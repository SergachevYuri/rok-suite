'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { type RosterSnapshot } from '@/lib/supabase/use-roster-snapshots';
import { type MemberEventStats, type EventParticipation } from '@/lib/supabase/use-event-participation';
import { TROPHY_CONFIG, type TrophyType } from '@/lib/supabase/use-king-trophies';
import type { RosterMember } from './roster-types';

export interface PlayerTrophy {
    trophy_type: TrophyType;
    awarded_date: string;
    week_of: string;
    reason: string | null;
}

export interface PlayerDetail {
    member: RosterMember | null;
    snapshots: RosterSnapshot[];
    eventStats: MemberEventStats | null;
    aooHistory: EventParticipation[];
    mobilizationHistory: EventParticipation[];
    trophies: PlayerTrophy[];
    nameHistory: string[];
    loading: boolean;
    error: string | null;
}

/**
 * Resolve a player name to a roster member.
 * Tries exact name match first, then checks alternate_names,
 * then checks kingdom_scan_players for governor_id-based lookup.
 */
async function resolveMember(supabase: ReturnType<typeof createClient>, playerName: string): Promise<RosterMember | null> {
    // 1. Exact name match
    const { data: exact } = await supabase
        .from('alliance_roster')
        .select('*')
        .eq('name', playerName)
        .single();

    if (exact) return exact as RosterMember;

    // 2. Check alternate_names (name might be a previous name)
    const { data: altMatches } = await supabase
        .from('alliance_roster')
        .select('*')
        .contains('alternate_names', [playerName]);

    if (altMatches && altMatches.length > 0) return altMatches[0] as RosterMember;

    // 3. Check scan history — find governor_id by name, then look up roster by gov_id
    const { data: scanMatch } = await supabase
        .from('kingdom_scan_players')
        .select('governor_id')
        .eq('name', playerName)
        .limit(1);

    if (scanMatch && scanMatch.length > 0 && scanMatch[0].governor_id) {
        const { data: byGovId } = await supabase
            .from('alliance_roster')
            .select('*')
            .eq('governor_id', scanMatch[0].governor_id)
            .single();

        if (byGovId) return byGovId as RosterMember;
    }

    return null;
}

/**
 * Collect all known names for a player using governor_id as the anchor.
 * Sources: current name, alternate_names, kingdom_scan_players names, merged members.
 */
async function collectAllNames(
    supabase: ReturnType<typeof createClient>,
    member: RosterMember
): Promise<Set<string>> {
    const names = new Set<string>();
    names.add(member.name);

    // Add alternate_names from roster
    if (member.alternate_names) {
        for (const n of member.alternate_names) names.add(n);
    }

    // Add names from scan history via governor_id
    if (member.governor_id) {
        const { data: scanNames } = await supabase
            .from('kingdom_scan_players')
            .select('name')
            .eq('governor_id', member.governor_id);

        if (scanNames) {
            for (const row of scanNames) names.add(row.name);
        }
    }

    // Check if any other roster entries were merged into this one
    const { data: merged } = await supabase
        .from('alliance_roster')
        .select('name, alternate_names')
        .eq('merged_into', member.id);

    if (merged) {
        for (const m of merged) {
            names.add(m.name);
            if (m.alternate_names) {
                for (const n of m.alternate_names) names.add(n);
            }
        }
    }

    return names;
}

/**
 * Calculate event stats from raw participation data across all name variants.
 */
function calculateEventStats(events: EventParticipation[]): MemberEventStats {
    const aooEvents = events.filter(e => e.event_type === 'aoo').sort((a, b) => b.event_date.localeCompare(a.event_date));
    const mobEvents = events.filter(e => e.event_type === 'mobilization').sort((a, b) => b.event_date.localeCompare(a.event_date));

    const aoo = {
        lastTeam: aooEvents[0]?.team ?? null,
        team1Count: aooEvents.filter(e => e.team === 'Team 1').length,
        team2Count: aooEvents.filter(e => e.team === 'Team 2').length,
        team1Participated: aooEvents.filter(e => e.team === 'Team 1' && e.participated).length,
        team2Participated: aooEvents.filter(e => e.team === 'Team 2' && e.participated).length,
        participatedCount: aooEvents.filter(e => e.participated).length,
        totalAssigned: aooEvents.length,
    };

    const lastMob = mobEvents[0];
    const prevMob = mobEvents[1];
    const mobilization = {
        lastScore: lastMob?.score ?? null,
        lastTurnedIn: lastMob?.turned_in ?? null,
        lastAccepted: lastMob?.accepted ?? null,
        lastDate: lastMob?.event_date ?? null,
        previousScore: prevMob?.score ?? null,
        previousDate: prevMob?.event_date ?? null,
        growth: lastMob?.score != null && prevMob?.score != null ? lastMob.score - prevMob.score : null,
        growthPercent: lastMob?.score != null && prevMob?.score != null && prevMob.score > 0
            ? ((lastMob.score - prevMob.score) / prevMob.score) * 100
            : null,
        totalEvents: mobEvents.length,
    };

    return { aoo, mobilization };
}

// Dates known to have bad snapshot data
const EXCLUDED_SNAPSHOT_DATES = ['2025-12-26', '2025-12-27', '2026-01-25'];

export function usePlayerDetail(playerName: string | null): PlayerDetail {
    const [member, setMember] = useState<RosterMember | null>(null);
    const [snapshots, setSnapshots] = useState<RosterSnapshot[]>([]);
    const [eventStats, setEventStats] = useState<MemberEventStats | null>(null);
    const [aooHistory, setAooHistory] = useState<EventParticipation[]>([]);
    const [mobilizationHistory, setMobilizationHistory] = useState<EventParticipation[]>([]);
    const [trophies, setTrophies] = useState<PlayerTrophy[]>([]);
    const [nameHistory, setNameHistory] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!playerName) {
            setMember(null);
            setSnapshots([]);
            setEventStats(null);
            setAooHistory([]);
            setMobilizationHistory([]);
            setTrophies([]);
            setNameHistory([]);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        async function load() {
            const supabase = createClient();

            try {
                // 1. Resolve member by name, alternate_names, or governor_id via scans
                const m = await resolveMember(supabase, playerName!);
                if (cancelled) return;
                setMember(m);

                if (!m) {
                    // No roster entry found — nothing else to fetch
                    setSnapshots([]);
                    setEventStats(null);
                    setAooHistory([]);
                    setMobilizationHistory([]);
                    setTrophies([]);
                    setNameHistory([]);
                    return;
                }

                // 2. Collect ALL known names for this player (gov_id is the anchor)
                const allNames = await collectAllNames(supabase, m);
                if (cancelled) return;

                const nameArray = Array.from(allNames);

                // 3. Parallel fetch using all known names
                const [
                    snapshotResult,
                    eventResult,
                    trophyResult,
                ] = await Promise.all([
                    // Snapshots: query all name variants
                    supabase
                        .from('roster_snapshots')
                        .select('*')
                        .in('member_name', nameArray)
                        .order('snapshot_date', { ascending: true })
                        .limit(90),
                    // Events: query all name variants
                    supabase
                        .from('event_participation')
                        .select('*')
                        .in('member_name', nameArray)
                        .order('event_date', { ascending: false }),
                    // Trophies: use member UUID
                    supabase
                        .from('king_trophies')
                        .select('trophy_type, awarded_date, week_of, reason')
                        .eq('member_id', m.id)
                        .order('awarded_date', { ascending: false }),
                ]);

                if (cancelled) return;

                // Process snapshots: deduplicate by date, prefer current name
                const snapshotData = snapshotResult.data || [];
                const byDate = new Map<string, RosterSnapshot>();
                for (const snap of snapshotData as RosterSnapshot[]) {
                    if (EXCLUDED_SNAPSHOT_DATES.includes(snap.snapshot_date)) continue;
                    const existing = byDate.get(snap.snapshot_date);
                    if (!existing || snap.member_name === m.name) {
                        byDate.set(snap.snapshot_date, snap);
                    }
                }
                setSnapshots([...byDate.values()].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)));

                // Process events
                const allEvents = (eventResult.data || []) as EventParticipation[];
                const aoo = allEvents.filter(e => e.event_type === 'aoo');
                const mob = allEvents.filter(e => e.event_type === 'mobilization');
                setEventStats(calculateEventStats(allEvents));
                setAooHistory(aoo);
                setMobilizationHistory(mob);

                // Trophies
                setTrophies((trophyResult.data || []) as PlayerTrophy[]);

                // Name history: all names except current display name
                const previousNames = Array.from(allNames).filter(n => n !== m.name);
                setNameHistory(previousNames);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load player');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [playerName]);

    return { member, snapshots, eventStats, aooHistory, mobilizationHistory, trophies, nameHistory, loading, error };
}

export { TROPHY_CONFIG };
