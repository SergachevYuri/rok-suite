'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getAllMemberStats, type MemberEventStats } from '@/lib/supabase/use-event-participation';
import { useMemberTrophyCounts, type MemberTrophyCounts } from '@/lib/supabase/use-king-trophies';
import { useNameHistory } from '@/lib/supabase/use-name-history';
import { ADMIN_PASSWORD as EDITOR_PASSWORD } from '@/lib/auth-passwords';
import type { RosterMember } from './roster-types';

interface RosterContextValue {
    roster: RosterMember[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    eventStats: Map<string, MemberEventStats>;
    trophyCounts: Map<string, MemberTrophyCounts>;
    refetchTrophies: () => void;
    nameHistory: Map<number, string[]>;
    nameHistoryLoading: boolean;
    alliances: string[];
    isEditor: boolean;
    setIsEditor: (v: boolean) => void;
    editorPassword: typeof EDITOR_PASSWORD;
}

const RosterContext = createContext<RosterContextValue | null>(null);

export function useRosterContext() {
    const ctx = useContext(RosterContext);
    if (!ctx) throw new Error('useRosterContext must be used within RosterProvider');
    return ctx;
}

export function RosterProvider({ children }: { children: React.ReactNode }) {
    const [roster, setRoster] = useState<RosterMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [eventStats, setEventStats] = useState<Map<string, MemberEventStats>>(new Map());
    const [isEditor, setIsEditor] = useState(false);

    const { counts: trophyCounts, refetch: refetchTrophies } = useMemberTrophyCounts();

    // Extract governor IDs and current names for name history
    const governorIds = roster.filter(m => m.governor_id).map(m => m.governor_id as number);
    const currentNames = new Map(roster.filter(m => m.governor_id).map(m => [m.governor_id as number, m.name]));
    const { nameHistory, loading: nameHistoryLoading } = useNameHistory(governorIds, currentNames);

    // Unique alliances
    const alliances = Array.from(new Set(roster.map(m => m.alliance).filter(Boolean) as string[])).sort();

    const fetchRoster = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: err } = await supabase
                .from('alliance_roster')
                .select('*')
                .eq('is_active', true)
                .order('power', { ascending: false });

            if (err) throw err;
            setRoster((data || []) as RosterMember[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load roster');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch event stats
    useEffect(() => {
        async function loadEventStats() {
            try {
                const stats = await getAllMemberStats();
                setEventStats(stats);
            } catch {
                // Non-critical, fail silently
            }
        }
        if (roster.length > 0) loadEventStats();
    }, [roster]);

    // Initial load
    useEffect(() => {
        fetchRoster();
    }, [fetchRoster]);

    return (
        <RosterContext.Provider value={{
            roster,
            loading,
            error,
            refetch: fetchRoster,
            eventStats,
            trophyCounts,
            refetchTrophies,
            nameHistory,
            nameHistoryLoading,
            alliances,
            isEditor,
            setIsEditor,
            editorPassword: EDITOR_PASSWORD,
        }}>
            {children}
        </RosterContext.Provider>
    );
}
