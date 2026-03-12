'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMemberHistory, type RosterSnapshot } from '@/lib/supabase/use-roster-snapshots';
import { getMemberEventStats, getMemberEventHistory, type MemberEventStats, type EventParticipation } from '@/lib/supabase/use-event-participation';
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
                // 1. Fetch the roster member
                const { data: memberData } = await supabase
                    .from('alliance_roster')
                    .select('*')
                    .eq('name', playerName!)
                    .single();

                if (cancelled) return;
                const m = memberData as RosterMember | null;
                setMember(m);

                // 2. Parallel fetch everything else
                const [
                    snapshotData,
                    stats,
                    aoo,
                    mob,
                    trophyResult,
                    nameResult,
                ] = await Promise.all([
                    getMemberHistory(playerName!, 90),
                    getMemberEventStats(playerName!),
                    getMemberEventHistory(playerName!, 'aoo'),
                    getMemberEventHistory(playerName!, 'mobilization'),
                    // Trophies: need member_id from the roster entry
                    m?.id ? supabase
                        .from('king_trophies')
                        .select('trophy_type, awarded_date, week_of, reason')
                        .eq('member_id', m.id)
                        .order('awarded_date', { ascending: false })
                        : Promise.resolve({ data: [] }),
                    // Name history from scans
                    m?.governor_id ? supabase
                        .from('kingdom_scan_players')
                        .select('name')
                        .eq('governor_id', m.governor_id)
                        : Promise.resolve({ data: [] }),
                ]);

                if (cancelled) return;

                setSnapshots(snapshotData);
                setEventStats(stats);
                setAooHistory(aoo);
                setMobilizationHistory(mob);
                setTrophies((trophyResult.data || []) as PlayerTrophy[]);

                // Build name history: scan names + alternate_names, excluding current
                const names = new Set<string>();
                if (m?.alternate_names) {
                    for (const n of m.alternate_names) {
                        if (n !== playerName) names.add(n);
                    }
                }
                for (const row of (nameResult.data || []) as { name: string }[]) {
                    if (row.name !== playerName) names.add(row.name);
                }
                setNameHistory(Array.from(names));
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
