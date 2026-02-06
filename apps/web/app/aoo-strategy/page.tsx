'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import dynamic from 'next/dynamic';
import type { MapAssignments, Player, Team, StrategyData as ImportedStrategyData, EventMode, AooTeam } from '@/lib/aoo-strategy/types';
import { defaultStrategyData } from '@/lib/aoo-strategy/strategy-data';
import { useAllianceRoster, formatPower, RosterMember } from '@/lib/supabase/use-alliance-roster';
import { getAllMemberStats, MemberEventStats } from '@/lib/supabase/use-event-participation';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/lib/supabase/auth-context';

// Dynamic import to avoid SSR issues with the map
const AOOInteractiveMap = dynamic(() => import('@/components/aoo-strategy/AOOInteractiveMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-5 h-5 border border-[#4318ff] border-t-transparent rounded-full animate-spin"></div>
    </div>
  ),
});

// Use TeamInfo as an alias for Team for backward compatibility
type TeamInfo = Team;

// Use imported StrategyData type
type StrategyData = ImportedStrategyData;

const DEFAULT_TEAMS: TeamInfo[] = [
    { name: 'Zone 1', description: 'Ark' },
    { name: 'Zone 2', description: 'Upper' },
    { name: 'Zone 3', description: 'Lower' },
];

const AVAILABLE_TAGS = ['Rally Leader', 'Coordinator', 'Teleport 1st', 'Teleport 2nd', 'Hold Obelisks', 'Garrison', 'Farm', 'Conquer', 'Confirmed'];

// Simplified tag colors - muted to not compete with zone colors
// Zone colors: Z1=blue, Z2=orange, Z3=purple (match in-game)
const TAG_COLORS: Record<string, string> = {
    'Rally Leader': 'bg-stone-700 text-white',
    'Coordinator': 'bg-stone-600 text-white',
    'Teleport 1st': 'bg-emerald-700 text-white',
    'Teleport 2nd': 'bg-emerald-600/70 text-white',
    'Hold Obelisks': 'bg-stone-600 text-stone-200',
    'Garrison': 'bg-stone-600 text-stone-200',
    'Farm': 'bg-stone-500 text-white',
    'Conquer': 'bg-stone-600 text-stone-200',
    'Confirmed': 'bg-green-600 text-white',
};

// Zone colors matching in-game
const ZONE_COLORS: Record<number, { bg: string; border: string; text: string }> = {
    1: { bg: 'bg-blue-600', border: 'border-blue-500', text: 'text-blue-400' },
    2: { bg: 'bg-orange-600', border: 'border-orange-500', text: 'text-orange-400' },
    3: { bg: 'bg-purple-600', border: 'border-purple-500', text: 'text-purple-400' },
};

// Available alliances for team builder
const ALLIANCES = ['ANG', '23KK', 'KNG', 'EQ'] as const;

// Confirmation status for team builder
type ConfirmationStatus = 'confirmed' | 'maybe' | 'none';

// Power-balanced distribution algorithm (includes kills for tracking)
function distributeByPowerWithKills(players: { name: string; power: number; kills: number }[]): Record<number, { name: string; power: number; kills: number }[]> {
    // Sort by power descending
    const sorted = [...players].sort((a, b) => b.power - a.power);

    // Greedy assignment: add to zone with lowest total power
    const zones: Record<number, { name: string; power: number; kills: number }[]> = { 1: [], 2: [], 3: [] };
    const zonePower: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

    for (const player of sorted) {
        // Find zone with minimum power
        const minZone = Object.entries(zonePower)
            .sort(([, a], [, b]) => a - b)[0][0];
        const zoneNum = parseInt(minZone);
        zones[zoneNum].push(player);
        zonePower[zoneNum] += player.power;
    }

    return zones;
}

// Team Builder Tab Component
interface PendingMember {
    name: string;
    power: number;
    kills: number;
    governorId?: string;
    isPending: true;
}

interface TeamBuilderTabProps {
    roster: { name: string; power: number; kills: number; alliance: string | null }[];
    powerByName: Record<string, number>;
    killsByName: Record<string, number>;
    allianceByName: Record<string, string | null>;
    alliances: string[];
    builderAlliance: string;
    setBuilderAlliance: (a: string) => void;
    teamCount: 1 | 2 | 3;
    setTeamCount: (c: 1 | 2 | 3) => void;
    activeTeam: 1 | 2 | 3;
    setActiveTeam: (t: 1 | 2 | 3) => void;
    confirmations: Record<string, ConfirmationStatus>;
    setConfirmations: (c: Record<string, ConfirmationStatus>) => void;
    builderStep: 'select' | 'distribute' | 'leads' | 'done';
    setBuilderStep: (s: 'select' | 'distribute' | 'leads' | 'done') => void;
    suggestedZones: Record<number, { name: string; power: number; kills: number }[]>;
    setSuggestedZones: (z: Record<number, { name: string; power: number; kills: number }[]>) => void;
    selectedRallyLeads: Record<number, string>;
    setSelectedRallyLeads: (r: Record<number, string>) => void;
    selectedTeleportFirst: Set<string>;
    setSelectedTeleportFirst: (t: Set<string>) => void;
    pendingAdditions: PendingMember[];
    setPendingAdditions: (p: PendingMember[]) => void;
    onApply: (zones: Record<number, { name: string; power: number; kills: number }[]>, rallyLeads: Record<number, string>, teleportFirst: Set<string>, substitutes: { name: string; power: number; kills: number }[]) => void;
    onSavePendingAdditions: (additions: PendingMember[]) => Promise<void>;
    theme: Record<string, string>;
    formatPower: (p: number | null | undefined) => string;
    user: { id: string } | null;
}

function TeamBuilderTab({
    roster,
    powerByName,
    killsByName,
    allianceByName,
    alliances,
    builderAlliance,
    setBuilderAlliance,
    teamCount,
    setTeamCount,
    activeTeam,
    setActiveTeam,
    confirmations,
    setConfirmations,
    builderStep,
    setBuilderStep,
    suggestedZones,
    setSuggestedZones,
    selectedRallyLeads,
    setSelectedRallyLeads,
    selectedTeleportFirst,
    setSelectedTeleportFirst,
    pendingAdditions,
    setPendingAdditions,
    onApply,
    onSavePendingAdditions,
    theme,
    formatPower,
    user,
}: TeamBuilderTabProps) {
    // Local state for search and add member form
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberPower, setNewMemberPower] = useState('');
    const [newMemberGovId, setNewMemberGovId] = useState('');
    const [showAutoComplete, setShowAutoComplete] = useState(false);
    const [builderSort, setBuilderSort] = useState<'power' | 'kp' | 't1' | 't2' | 'name'>('power');
    const [builderFilter, setBuilderFilter] = useState<'all' | 'confirmed' | 'maybe' | 'none'>('all');

    // Zone size inputs for distribution (0 = subs)
    const [zoneSizes, setZoneSizes] = useState<Record<number, string>>({ 0: '', 1: '', 2: '', 3: '' });
    const [useCustomSizes, setUseCustomSizes] = useState(true); // Default to custom sizes

    // Event participation stats for AoO history
    const [eventStats, setEventStats] = useState<Map<string, MemberEventStats>>(new Map());

    // Load event stats on mount
    useEffect(() => {
        getAllMemberStats().then(stats => setEventStats(stats));
    }, []);

    // Filter roster by alliance
    const baseRoster = builderAlliance === 'all'
        ? roster
        : roster.filter(m => m.alliance === builderAlliance);

    // Combine with pending additions
    const combinedRoster = [
        ...baseRoster.map(m => ({ ...m, isPending: false as const })),
        ...pendingAdditions.filter(p => builderAlliance === 'all' || !p.governorId), // Show pending in "all" or if no specific alliance
    ];

    // Autocomplete suggestions from full roster (independent of alliance filter)
    const autocompleteSuggestions = newMemberName.trim().length >= 2
        ? roster.filter(m =>
            m.name.toLowerCase().includes(newMemberName.toLowerCase()) &&
            !combinedRoster.some(c => c.name === m.name) // Exclude already in current list
          ).slice(0, 8)
        : [];

    // Select autocomplete suggestion
    const handleSelectSuggestion = (member: typeof roster[0]) => {
        setNewMemberName(member.name);
        setNewMemberPower(member.power?.toString() || '');
        setShowAutoComplete(false);
    };

    // Apply search and confirmation status filter
    const filteredRoster = combinedRoster
        .filter(m => {
            // Search filter
            if (searchTerm.trim()) {
                const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    ('governorId' in m && m.governorId?.includes(searchTerm));
                if (!matchesSearch) return false;
            }
            // Confirmation status filter
            if (builderFilter !== 'all') {
                const status = confirmations[m.name] || 'none';
                if (builderFilter !== status) return false;
            }
            return true;
        })
        .sort((a, b) => {
            // Sort logic
            const aStats = eventStats.get(a.name)?.aoo;
            const bStats = eventStats.get(b.name)?.aoo;
            switch (builderSort) {
                case 'power':
                    return (b.power || 0) - (a.power || 0);
                case 'kp':
                    const aKp = a.kills || killsByName[a.name] || 0;
                    const bKp = b.kills || killsByName[b.name] || 0;
                    return bKp - aKp;
                case 't1': {
                    // Sort by: rate desc, then total assignments desc (2/2 > 1/1), then participated desc
                    const aT1Rate = aStats && aStats.team1Count > 0 ? aStats.team1Participated / aStats.team1Count : -1;
                    const bT1Rate = bStats && bStats.team1Count > 0 ? bStats.team1Participated / bStats.team1Count : -1;
                    if (bT1Rate !== aT1Rate) return bT1Rate - aT1Rate;
                    // Same rate - prefer more assignments (2/2 > 1/1)
                    const aT1Count = aStats?.team1Count || 0;
                    const bT1Count = bStats?.team1Count || 0;
                    if (bT1Count !== aT1Count) return bT1Count - aT1Count;
                    return (bStats?.team1Participated || 0) - (aStats?.team1Participated || 0);
                }
                case 't2': {
                    const aT2Rate = aStats && aStats.team2Count > 0 ? aStats.team2Participated / aStats.team2Count : -1;
                    const bT2Rate = bStats && bStats.team2Count > 0 ? bStats.team2Participated / bStats.team2Count : -1;
                    if (bT2Rate !== aT2Rate) return bT2Rate - aT2Rate;
                    const aT2Count = aStats?.team2Count || 0;
                    const bT2Count = bStats?.team2Count || 0;
                    if (bT2Count !== aT2Count) return bT2Count - aT2Count;
                    return (bStats?.team2Participated || 0) - (aStats?.team2Participated || 0);
                }
                case 'name':
                    return a.name.localeCompare(b.name);
                default:
                    return 0;
            }
        });

    // Check if search term matches nothing in roster (for showing "add" option)
    const noResults = searchTerm.trim().length > 0 && filteredRoster.length === 0;

    // Add a new pending member
    const handleAddMember = () => {
        if (!newMemberName.trim()) return;

        const newMember: PendingMember = {
            name: newMemberName.trim(),
            power: parseInt(newMemberPower) || 0,
            kills: 0,
            governorId: newMemberGovId.trim() || undefined,
            isPending: true,
        };

        setPendingAdditions([...pendingAdditions, newMember]);
        setNewMemberName('');
        setNewMemberPower('');
        setNewMemberGovId('');
        setShowAddForm(false);
        setSearchTerm('');

        // Auto-confirm the new member
        setConfirmations({ ...confirmations, [newMember.name]: 'confirmed' });
    };

    // Count confirmations (from combined roster)
    const confirmedPlayers = combinedRoster.filter(m => confirmations[m.name] === 'confirmed');
    const maybePlayers = combinedRoster.filter(m => confirmations[m.name] === 'maybe');
    const confirmedPower = confirmedPlayers.reduce((sum, p) => sum + (p.power || 0), 0);
    const maybePower = maybePlayers.reduce((sum, p) => sum + (p.power || 0), 0);

    // Auto-calculate zone sizes when player count changes
    useEffect(() => {
        const totalPlayers = confirmedPlayers.length + maybePlayers.length;
        if (totalPlayers === 0) return;

        // Calculate base size per zone
        const basePerZone = Math.floor(totalPlayers / 3);
        const remainder = totalPlayers % 3;

        // Distribute evenly with remainder going to zones 1, 2, 3 in order
        const newSizes = {
            0: zoneSizes[0] || '0', // Keep subs as-is or default to 0
            1: String(basePerZone + (remainder >= 1 ? 1 : 0)),
            2: String(basePerZone + (remainder >= 2 ? 1 : 0)),
            3: String(basePerZone),
        };

        setZoneSizes(newSizes);
    // Only recalculate when player counts change, not when zoneSizes changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confirmedPlayers.length, maybePlayers.length]);

    // Toggle confirmation status
    const toggleConfirmation = (name: string) => {
        const current = confirmations[name] || 'none';
        const next: ConfirmationStatus = current === 'none' ? 'confirmed' : current === 'confirmed' ? 'maybe' : 'none';
        setConfirmations({ ...confirmations, [name]: next });
    };

    // Suggest rally leads based on power AND kills (KP)
    // Score = power * 0.4 + kills * 0.6 (weighted towards fighting capability)
    const getRallyScore = (name: string) => {
        const power = powerByName[name] || 0;
        const kills = killsByName[name] || 0;
        return power * 0.4 + kills * 0.6;
    };

    // Distribute players by custom zone sizes with power balancing
    const distributeByZoneSizes = (
        players: { name: string; power: number; kills: number }[],
        sizes: Record<number, number>
    ): Record<number, { name: string; power: number; kills: number }[]> => {
        // Sort by power descending
        const sorted = [...players].sort((a, b) => b.power - a.power);
        const zones: Record<number, { name: string; power: number; kills: number }[]> = { 1: [], 2: [], 3: [] };
        const zonePower: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

        // Greedy assignment: assign each player to the zone with lowest power that still has room
        for (const player of sorted) {
            // Find zones that still have room
            const availableZones = [1, 2, 3].filter(z => zones[z].length < sizes[z]);

            if (availableZones.length === 0) {
                // All zones full, skip (or could add to overflow)
                continue;
            }

            // Pick the zone with lowest total power among available zones
            const targetZone = availableZones.reduce((min, z) =>
                zonePower[z] < zonePower[min] ? z : min, availableZones[0]);

            zones[targetZone].push(player);
            zonePower[targetZone] += player.power;
        }

        return zones;
    };

    // Handle distribute button
    const handleDistribute = () => {
        // Combine confirmed + maybe players for distribution
        const allPlayers = [...confirmedPlayers, ...maybePlayers].map(p => ({
            name: p.name,
            power: p.power || 0,
            kills: p.kills || killsByName[p.name] || 0,
        }));

        if (allPlayers.length < 1) {
            alert('Need at least 1 player to distribute');
            return;
        }

        let zones: Record<number, { name: string; power: number; kills: number }[]>;

        if (useCustomSizes) {
            // Use custom zone sizes (including subs as zone 0)
            const sizes = {
                1: parseInt(zoneSizes[1]) || 0,
                2: parseInt(zoneSizes[2]) || 0,
                3: parseInt(zoneSizes[3]) || 0,
            };
            const subsSize = parseInt(zoneSizes[0]) || 0;
            const totalSize = sizes[1] + sizes[2] + sizes[3] + subsSize;

            if (totalSize === 0) {
                alert('Please enter zone sizes');
                return;
            }

            // Distribute to zones 1-3 first (power balanced)
            zones = distributeByZoneSizes(allPlayers, sizes);

            // Players not assigned to zones 1-3 become subs
            const assignedNames = new Set([
                ...zones[1].map(p => p.name),
                ...zones[2].map(p => p.name),
                ...zones[3].map(p => p.name),
            ]);
            const remainingPlayers = allPlayers.filter(p => !assignedNames.has(p.name));

            // Take up to subsSize as subs (sorted by power)
            const sortedRemaining = [...remainingPlayers].sort((a, b) => b.power - a.power);
            zones[0] = subsSize > 0 ? sortedRemaining.slice(0, subsSize) : sortedRemaining;
        } else {
            // Auto-balance by power (equal distribution)
            zones = distributeByPowerWithKills(allPlayers);
            zones[0] = []; // No subs in auto mode
        }

        setSuggestedZones(zones);

        // Pre-select best rally lead per zone (highest rally score)
        const leads: Record<number, string> = {};
        for (const [zone, players] of Object.entries(zones)) {
            const zoneNum = parseInt(zone);
            if (zoneNum > 0 && players.length > 0) { // Skip substitutes (zone 0)
                // Sort by rally score and pick the best
                const sorted = [...players].sort((a, b) => getRallyScore(b.name) - getRallyScore(a.name));
                leads[zoneNum] = sorted[0].name;
            }
        }
        setSelectedRallyLeads(leads);

        // Pre-select rally leads + top players for teleport first
        const teleport = new Set<string>();
        for (const [zone, players] of Object.entries(zones)) {
            if (parseInt(zone) === 0) continue; // Skip substitutes
            // Top 3-4 players per zone teleport first (by rally score)
            const sorted = [...players].sort((a, b) => getRallyScore(b.name) - getRallyScore(a.name));
            sorted.slice(0, Math.min(4, Math.ceil(players.length / 3))).forEach(p => teleport.add(p.name));
        }
        setSelectedTeleportFirst(teleport);

        setBuilderStep('distribute');
    };

    // Move player between zones
    const movePlayerToZone = (playerName: string, fromZone: number, toZone: number) => {
        const newZones = { ...suggestedZones };
        const player = newZones[fromZone].find(p => p.name === playerName);
        if (player) {
            newZones[fromZone] = newZones[fromZone].filter(p => p.name !== playerName);
            newZones[toZone] = [...newZones[toZone], player];
            setSuggestedZones(newZones);
        }
    };

    // Calculate zone power totals
    const getZonePower = (zone: number) => suggestedZones[zone]?.reduce((sum, p) => sum + p.power, 0) || 0;
    const totalPower = getZonePower(1) + getZonePower(2) + getZonePower(3);

    // Reset to selection step
    const handleReset = () => {
        setBuilderStep('select');
        setSuggestedZones({});
        setSelectedRallyLeads({});
        setSelectedTeleportFirst(new Set());
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6">
            {/* Alliance & Team Selection */}
            <section className={`${theme.card} border rounded-xl mb-6 p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <h2 className={`text-sm font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                        🛠️ Team Builder
                    </h2>
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Alliance selection */}
                        <div className="flex items-center gap-2">
                            <span className={`text-xs ${theme.textMuted}`}>Alliance:</span>
                            <select
                                value={builderAlliance}
                                onChange={(e) => setBuilderAlliance(e.target.value)}
                                className={`px-3 py-1.5 rounded-lg text-sm ${theme.input}`}
                                disabled={builderStep !== 'select'}
                            >
                                <option value="all">All Alliances</option>
                                {alliances.map(a => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                            </select>
                        </div>
                        {/* Team count selection */}
                        <div className="flex items-center gap-2">
                            <span className={`text-xs ${theme.textMuted}`}>Teams:</span>
                            <div className="flex gap-1">
                                {[1, 2, 3].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setTeamCount(n as 1 | 2 | 3)}
                                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                            teamCount === n
                                                ? 'bg-[#4318ff] text-white'
                                                : `${theme.tag} hover:opacity-80`
                                        }`}
                                        disabled={builderStep !== 'select'}
                                        title={`Organize ${n} team${n > 1 ? 's' : ''}`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Team tabs (only show if more than 1 team) */}
                {teamCount > 1 && (
                    <div className="flex gap-2 mb-4">
                        {Array.from({ length: teamCount }, (_, i) => i + 1).map((t) => (
                            <button
                                key={t}
                                onClick={() => setActiveTeam(t as 1 | 2 | 3)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    activeTeam === t
                                        ? 'bg-[#4318ff] text-white'
                                        : `${theme.tag} hover:opacity-80`
                                }`}
                            >
                                Team {t}
                            </button>
                        ))}
                    </div>
                )}

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-4 text-xs">
                    <span className={`px-2 py-1 rounded ${builderStep === 'select' ? 'bg-[#4318ff] text-white' : theme.tag}`}>
                        1. Select Players
                    </span>
                    <span className={theme.textMuted}>→</span>
                    <span className={`px-2 py-1 rounded ${builderStep === 'distribute' ? 'bg-[#4318ff] text-white' : theme.tag}`}>
                        2. Distribute & Assign
                    </span>
                    <span className={theme.textMuted}>→</span>
                    <span className={`px-2 py-1 rounded ${builderStep === 'done' ? 'bg-[#4318ff] text-white' : theme.tag}`}>
                        3. Apply
                    </span>
                </div>

                {/* Instructions for coordinators */}
                {builderStep === 'select' && (
                    <div className={`p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-base ${theme.text}`}>
                        <strong className="text-blue-400">How to use:</strong> Select your alliance, choose how many teams to organize (1-3), then mark players as <span className="text-green-400">Confirmed</span> (definitely playing) or <span className="text-yellow-400">Maybe</span> (might join). Click <strong>Distribute to Zones</strong> to auto-balance power across 3 zones.
                    </div>
                )}
                {builderStep === 'distribute' && (
                    <div className={`p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-base ${theme.text}`}>
                        <strong className="text-blue-400">Adjust assignments:</strong> Select a <span className="text-yellow-400">Rally Lead</span> for each zone (sorted by power + KP). Toggle <span className="text-[#9f7aea]">⚡ Teleport First</span> for early arrivals. Use the zone dropdown to move players between zones. When ready, click <strong>Apply to Strategy</strong>.
                    </div>
                )}
            </section>

            {builderStep === 'select' && (
                <>
                    {/* Player Selection List */}
                    <section className={`${theme.card} border rounded-xl mb-6 p-4`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-sm font-medium ${theme.text}`}>
                                Select Players ({combinedRoster.length} available{pendingAdditions.length > 0 ? `, ${pendingAdditions.length} pending` : ''})
                            </h3>
                            <div className="flex items-center gap-4 text-xs">
                                <span className="text-green-500">
                                    ✓ Confirmed: {confirmedPlayers.length} ({formatPower(confirmedPower)})
                                </span>
                                <span className="text-yellow-500">
                                    ? Maybe: {maybePlayers.length} ({formatPower(maybePower)})
                                </span>
                            </div>
                        </div>

                        {/* Search input */}
                        <div className="mb-4">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by name or governor ID..."
                                className={`w-full px-3 py-2 rounded-lg text-sm ${theme.input}`}
                            />
                        </div>

                        {/* Quick actions */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            <button
                                onClick={() => {
                                    const newConf: Record<string, ConfirmationStatus> = {};
                                    combinedRoster.forEach(p => newConf[p.name] = 'confirmed');
                                    setConfirmations({ ...confirmations, ...newConf });
                                }}
                                className={`px-3 py-1 text-xs rounded ${theme.tag} hover:opacity-80`}
                            >
                                Select All
                            </button>
                            <button
                                onClick={() => {
                                    const newConf: Record<string, ConfirmationStatus> = {};
                                    combinedRoster.forEach(p => newConf[p.name] = 'none');
                                    setConfirmations({ ...confirmations, ...newConf });
                                }}
                                className={`px-3 py-1 text-xs rounded ${theme.tag} hover:opacity-80`}
                            >
                                Clear All
                            </button>
                            <button
                                onClick={() => setShowAddForm(!showAddForm)}
                                className={`px-3 py-1 text-xs rounded ${showAddForm ? 'bg-[#4318ff] text-white' : theme.tag} hover:opacity-80`}
                            >
                                + Add New Member
                            </button>
                            {pendingAdditions.length > 0 && (
                                <button
                                    onClick={() => onSavePendingAdditions(pendingAdditions)}
                                    className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:opacity-80"
                                >
                                    Save {pendingAdditions.length} Pending
                                </button>
                            )}
                        </div>

                        {/* Add Member Form */}
                        {showAddForm && (
                            <div className={`p-4 mb-4 rounded-lg border ${theme.border} bg-[#4318ff]/10`}>
                                <h4 className="text-sm font-medium text-[#9f7aea] mb-3">Add Member to Team</h4>
                                <p className={`text-xs ${theme.textMuted} mb-3`}>
                                    Start typing to search existing roster, or enter a new name.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                    {/* Name input with autocomplete */}
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={newMemberName}
                                            onChange={(e) => {
                                                setNewMemberName(e.target.value);
                                                setShowAutoComplete(true);
                                            }}
                                            onFocus={() => setShowAutoComplete(true)}
                                            onBlur={() => setTimeout(() => setShowAutoComplete(false), 200)}
                                            placeholder="In-game name *"
                                            className={`w-full px-3 py-2 rounded-lg text-sm ${theme.input}`}
                                        />
                                        {/* Autocomplete dropdown */}
                                        {showAutoComplete && autocompleteSuggestions.length > 0 && (
                                            <div className={`absolute z-50 w-full mt-1 rounded-lg border ${theme.card} shadow-xl max-h-48 overflow-y-auto`}>
                                                {autocompleteSuggestions.map((member) => (
                                                    <button
                                                        key={member.name}
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => handleSelectSuggestion(member)}
                                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--background-hover)] flex items-center justify-between border-b ${theme.border}`}
                                                    >
                                                        <span className={theme.text}>{member.name}</span>
                                                        <span className={`text-xs ${theme.textMuted}`}>
                                                            {formatPower(member.power)} • {member.alliance || 'No alliance'}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={newMemberPower}
                                        onChange={(e) => setNewMemberPower(e.target.value.replace(/\D/g, ''))}
                                        placeholder="Power (optional)"
                                        className={`px-3 py-2 rounded-lg text-sm ${theme.input}`}
                                    />
                                    <input
                                        type="text"
                                        value={newMemberGovId}
                                        onChange={(e) => setNewMemberGovId(e.target.value.replace(/\D/g, ''))}
                                        placeholder="Governor ID (optional)"
                                        className={`px-3 py-2 rounded-lg text-sm ${theme.input}`}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleAddMember}
                                        disabled={!newMemberName.trim()}
                                        className={`px-4 py-2 text-sm rounded-lg ${newMemberName.trim() ? 'bg-[#4318ff] text-white hover:bg-[#4318ff]/80' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                                    >
                                        Add Member
                                    </button>
                                    <button
                                        onClick={() => setShowAddForm(false)}
                                        className={`px-4 py-2 text-sm rounded-lg ${theme.tag} hover:opacity-80`}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* No results message */}
                        {noResults && (
                            <div className={`p-4 mb-4 rounded-lg text-center ${theme.card} border border-dashed ${theme.border}`}>
                                <p className={`text-sm ${theme.textMuted} mb-2`}>
                                    No members found matching &quot;{searchTerm}&quot;
                                </p>
                                <button
                                    onClick={() => {
                                        setNewMemberName(searchTerm);
                                        setShowAddForm(true);
                                    }}
                                    className="px-4 py-2 text-sm rounded-lg bg-[#4318ff] text-white hover:bg-[#4318ff]/80"
                                >
                                    + Add &quot;{searchTerm}&quot; as new member
                                </button>
                            </div>
                        )}

                        {/* Sort & Filter Controls */}
                        <div className="flex items-center justify-between mb-4 gap-4">
                            {/* Filter by status */}
                            <div className="flex items-center gap-3">
                                <span className={`text-base ${theme.textMuted}`}>Show:</span>
                                <div className="flex gap-1.5">
                                    {(['all', 'confirmed', 'maybe', 'none'] as const).map((filter) => (
                                        <button
                                            key={filter}
                                            onClick={() => setBuilderFilter(filter)}
                                            className={`px-4 py-2 text-base rounded-lg transition-colors ${
                                                builderFilter === filter
                                                    ? filter === 'confirmed' ? 'bg-green-600 text-white'
                                                    : filter === 'maybe' ? 'bg-yellow-600 text-white'
                                                    : filter === 'none' ? 'bg-gray-600 text-white'
                                                    : 'bg-[#4318ff] text-white'
                                                    : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:bg-[var(--background-hover)]'
                                            }`}
                                        >
                                            {filter === 'all' ? 'All' : filter === 'confirmed' ? 'Confirmed' : filter === 'maybe' ? 'Maybe' : 'Unconfirmed'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Sort dropdown */}
                            <div className="flex items-center gap-3">
                                <span className={`text-base ${theme.textMuted}`}>Sort:</span>
                                <select
                                    value={builderSort}
                                    onChange={(e) => setBuilderSort(e.target.value as typeof builderSort)}
                                    className={`px-4 py-2 text-base rounded-lg ${theme.input} cursor-pointer`}
                                >
                                    <option value="power">Power (High to Low)</option>
                                    <option value="kp">Kill Points (High to Low)</option>
                                    <option value="t1">T1 Participation</option>
                                    <option value="t2">T2 Participation</option>
                                    <option value="name">Name (A-Z)</option>
                                </select>
                            </div>
                        </div>

                        {/* Player list */}
                        {/* Column headers - clickable for sorting */}
                        <div className={`grid grid-cols-[auto_1fr_90px_110px_55px_55px_28px] gap-3 px-3 py-2.5 text-base font-medium ${theme.textMuted} border-b border-[var(--border)]`}>
                            <div className="w-8"></div>
                            <button
                                onClick={() => setBuilderSort('name')}
                                className={`text-left hover:text-white transition-colors ${builderSort === 'name' ? 'text-white' : ''}`}
                            >
                                Name {builderSort === 'name' && '↑'}
                            </button>
                            <button
                                onClick={() => setBuilderSort('power')}
                                className={`text-right hover:text-white transition-colors ${builderSort === 'power' ? 'text-white' : ''}`}
                            >
                                Power {builderSort === 'power' && '↓'}
                            </button>
                            <button
                                onClick={() => setBuilderSort('kp')}
                                className={`text-right hover:text-white transition-colors ${builderSort === 'kp' ? 'text-white' : ''}`}
                            >
                                KP {builderSort === 'kp' && '↓'}
                            </button>
                            <button
                                onClick={() => setBuilderSort('t1')}
                                className={`text-center hover:text-blue-300 transition-colors ${builderSort === 't1' ? 'text-blue-300' : 'text-blue-400'}`}
                            >
                                T1 {builderSort === 't1' && '↓'}
                            </button>
                            <button
                                onClick={() => setBuilderSort('t2')}
                                className={`text-center hover:text-orange-300 transition-colors ${builderSort === 't2' ? 'text-orange-300' : 'text-orange-400'}`}
                            >
                                T2 {builderSort === 't2' && '↓'}
                            </button>
                            <div></div>
                        </div>

                        {/* Player list */}
                        <div className="max-h-[400px] overflow-y-auto space-y-1.5 pt-1">
                            {filteredRoster.map((member) => {
                                const status = confirmations[member.name] || 'none';
                                const isPending = 'isPending' in member && member.isPending;
                                const aooStats = eventStats.get(member.name)?.aoo;
                                return (
                                    <button
                                        key={member.name}
                                        onClick={() => toggleConfirmation(member.name)}
                                        className={`w-full grid grid-cols-[auto_1fr_90px_110px_55px_55px_28px] gap-3 items-center px-3 py-3 rounded-lg transition-colors ${
                                            status === 'confirmed' ? 'bg-green-600/20 border border-green-500/30' :
                                            status === 'maybe' ? 'bg-yellow-600/20 border border-yellow-500/30' :
                                            isPending ? 'bg-blue-600/20 border border-blue-500/30 border-dashed' :
                                            'bg-[var(--background-secondary)] border border-[var(--border)] hover:bg-[var(--background-hover)]'
                                        }`}
                                    >
                                        {/* Status icon */}
                                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-base ${
                                            status === 'confirmed' ? 'bg-green-600 text-white' :
                                            status === 'maybe' ? 'bg-yellow-600 text-white' :
                                            'bg-white/20 text-white/50'
                                        }`}>
                                            {status === 'confirmed' ? '✓' : status === 'maybe' ? '?' : ''}
                                        </span>

                                        {/* Name */}
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`font-medium text-lg ${theme.text} truncate`}>{member.name}</span>
                                            {isPending && (
                                                <span className="px-2 py-0.5 text-sm rounded bg-blue-600 text-white shrink-0">
                                                    NEW
                                                </span>
                                            )}
                                        </div>

                                        {/* Power */}
                                        <span className={`${theme.text} text-lg text-right font-semibold`}>
                                            {formatPower(member.power)}
                                        </span>

                                        {/* KP */}
                                        <span className={`${theme.textMuted} text-base text-right`}>
                                            {formatPower(member.kills || killsByName[member.name] || 0)}
                                        </span>

                                        {/* T1 History */}
                                        <span
                                            className={`text-base text-center font-medium ${aooStats && aooStats.team1Count > 0 ? 'text-blue-400' : theme.textMuted}`}
                                            title={aooStats && aooStats.team1Count > 0 ? `Team 1: ${aooStats.team1Participated}/${aooStats.team1Count} participated` : 'No Team 1 history'}
                                        >
                                            {aooStats && aooStats.team1Count > 0
                                                ? `${aooStats.team1Participated}/${aooStats.team1Count}`
                                                : '—'}
                                        </span>

                                        {/* T2 History */}
                                        <span
                                            className={`text-base text-center font-medium ${aooStats && aooStats.team2Count > 0 ? 'text-orange-400' : theme.textMuted}`}
                                            title={aooStats && aooStats.team2Count > 0 ? `Team 2: ${aooStats.team2Participated}/${aooStats.team2Count} participated` : 'No Team 2 history'}
                                        >
                                            {aooStats && aooStats.team2Count > 0
                                                ? `${aooStats.team2Participated}/${aooStats.team2Count}`
                                                : '—'}
                                        </span>

                                        {/* Actions */}
                                        <div className="flex justify-center">
                                            {isPending && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPendingAdditions(pendingAdditions.filter(p => p.name !== member.name));
                                                    }}
                                                    className="text-red-400 hover:text-red-300 text-xs"
                                                    title="Remove"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* Zone Size Configuration - Prominent */}
                    <section className={`${theme.card} border border-[#4318ff] rounded-xl mb-6 p-5`}>
                        <h3 className={`text-lg font-semibold ${theme.text} mb-2`}>⚔️ Zone Distribution</h3>
                        <p className={`text-sm ${theme.textMuted} mb-4`}>
                            Enter how many players you want in each zone. Power will be balanced automatically within your specified sizes.
                        </p>

                        {/* Zone inputs in a row */}
                        <div className="grid grid-cols-4 gap-3 mb-4">
                            {/* Zone 1 */}
                            <div className="p-3 rounded-lg border border-blue-500 bg-[var(--background-secondary)]">
                                <label className="text-xs text-blue-400 font-semibold block mb-1">
                                    Zone 1 (Ark)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={zoneSizes[1]}
                                    onChange={(e) => setZoneSizes({ ...zoneSizes, 1: e.target.value })}
                                    placeholder="10"
                                    className={`w-full px-3 py-2 rounded-lg text-center text-xl font-bold ${theme.input} border`}
                                />
                            </div>
                            {/* Zone 2 */}
                            <div className="p-3 rounded-lg border border-orange-500 bg-[var(--background-secondary)]">
                                <label className="text-xs text-orange-400 font-semibold block mb-1">
                                    Zone 2 (Upper)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={zoneSizes[2]}
                                    onChange={(e) => setZoneSizes({ ...zoneSizes, 2: e.target.value })}
                                    placeholder="10"
                                    className={`w-full px-3 py-2 rounded-lg text-center text-xl font-bold ${theme.input} border`}
                                />
                            </div>
                            {/* Zone 3 */}
                            <div className="p-3 rounded-lg border border-purple-500 bg-[var(--background-secondary)]">
                                <label className="text-xs text-purple-400 font-semibold block mb-1">
                                    Zone 3 (Lower)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={zoneSizes[3]}
                                    onChange={(e) => setZoneSizes({ ...zoneSizes, 3: e.target.value })}
                                    placeholder="10"
                                    className={`w-full px-3 py-2 rounded-lg text-center text-xl font-bold ${theme.input} border`}
                                />
                            </div>
                            {/* Subs */}
                            <div className="p-3 rounded-lg border border-gray-500 bg-[var(--background-secondary)]">
                                <label className="text-xs text-gray-400 font-semibold block mb-1">
                                    Substitutes
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={zoneSizes[0]}
                                    onChange={(e) => setZoneSizes({ ...zoneSizes, 0: e.target.value })}
                                    placeholder="5"
                                    className={`w-full px-3 py-2 rounded-lg text-center text-xl font-bold ${theme.input} border`}
                                />
                            </div>
                        </div>

                        {/* Summary */}
                        <div className={`flex items-center justify-between p-3 rounded-lg bg-[var(--background-secondary)] mb-4`}>
                            <div className={`text-sm ${theme.textMuted}`}>
                                <span className="font-medium">Total slots:</span>{' '}
                                <span className={theme.text}>
                                    {(parseInt(zoneSizes[1]) || 0) + (parseInt(zoneSizes[2]) || 0) + (parseInt(zoneSizes[3]) || 0) + (parseInt(zoneSizes[0]) || 0)}
                                </span>
                            </div>
                            <div className={`text-sm ${theme.textMuted}`}>
                                <span className="font-medium">Available players:</span>{' '}
                                <span className={theme.text}>{confirmedPlayers.length + maybePlayers.length}</span>
                                <span className="text-xs ml-1">({confirmedPlayers.length} confirmed, {maybePlayers.length} maybe)</span>
                            </div>
                        </div>

                        {/* Auto-balance toggle */}
                        <div className="flex items-center justify-between mb-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!useCustomSizes}
                                    onChange={(e) => setUseCustomSizes(!e.target.checked)}
                                    className="rounded"
                                />
                                <span className={`text-xs ${theme.textMuted}`}>Auto-balance (ignore sizes above, split evenly by power)</span>
                            </label>
                        </div>

                        <div className="flex justify-center">
                            <button
                                onClick={handleDistribute}
                                disabled={confirmedPlayers.length + maybePlayers.length < 1}
                                className={`px-8 py-3 rounded-lg font-semibold text-white text-lg ${
                                    confirmedPlayers.length + maybePlayers.length >= 1 ? 'bg-[#4318ff] hover:bg-[#4318ff]/80' : 'bg-gray-600 cursor-not-allowed'
                                }`}
                            >
                                Distribute {confirmedPlayers.length + maybePlayers.length} Players →
                            </button>
                        </div>
                    </section>
                </>
            )}

            {builderStep === 'distribute' && (
                <>
                    {/* Zone Distribution */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        {[1, 2, 3].map((zone) => {
                            const zoneColor = ZONE_COLORS[zone as keyof typeof ZONE_COLORS];
                            const zonePlayers = suggestedZones[zone] || [];
                            const zonePower = getZonePower(zone);
                            const balancePercent = totalPower > 0 ? ((zonePower / totalPower) * 100).toFixed(1) : '0';

                            return (
                                <section key={zone} className={`${theme.card} border-l-4 ${zoneColor.border} rounded-xl p-4`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className={`font-semibold ${zoneColor.text}`}>
                                            Zone {zone} ({zonePlayers.length})
                                        </h3>
                                        <div className="text-right">
                                            <span className={`text-sm ${theme.textAccent}`}>{formatPower(zonePower)}</span>
                                            <span className={`text-xs ${theme.textMuted} ml-1`}>({balancePercent}%)</span>
                                        </div>
                                    </div>

                                    {/* Rally Lead Selection */}
                                    <div className="mb-3 p-2 rounded bg-[var(--background-secondary)]">
                                        <span className={`text-xs ${theme.textMuted}`}>Rally Lead:</span>
                                        <select
                                            value={selectedRallyLeads[zone] || ''}
                                            onChange={(e) => setSelectedRallyLeads({ ...selectedRallyLeads, [zone]: e.target.value })}
                                            className={`w-full mt-1 px-2 py-1 rounded text-sm ${theme.input}`}
                                        >
                                            <option value="">Select Rally Lead...</option>
                                            {[...zonePlayers].sort((a, b) => getRallyScore(b.name) - getRallyScore(a.name)).map(p => (
                                                <option key={p.name} value={p.name}>
                                                    {p.name} | {formatPower(p.power)} | KP: {formatPower(p.kills || killsByName[p.name] || 0)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Player List */}
                                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                                        {zonePlayers.map((player) => (
                                            <div key={player.name} className="flex items-center justify-between px-2 py-1.5 rounded bg-[var(--background-secondary)]">
                                                <div className="flex items-center gap-2">
                                                    {/* Teleport First checkbox */}
                                                    <button
                                                        onClick={() => {
                                                            const newSet = new Set(selectedTeleportFirst);
                                                            if (newSet.has(player.name)) {
                                                                newSet.delete(player.name);
                                                            } else {
                                                                newSet.add(player.name);
                                                            }
                                                            setSelectedTeleportFirst(newSet);
                                                        }}
                                                        className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                                                            selectedTeleportFirst.has(player.name)
                                                                ? 'bg-[#4318ff] text-white'
                                                                : 'bg-white/20'
                                                        }`}
                                                        title="Teleport First"
                                                    >
                                                        {selectedTeleportFirst.has(player.name) ? '⚡' : ''}
                                                    </button>
                                                    <span className={`text-sm ${selectedRallyLeads[zone] === player.name ? 'font-bold text-yellow-400' : theme.text}`}>
                                                        {player.name}
                                                        {selectedRallyLeads[zone] === player.name && ' ⭐'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs ${theme.textMuted}`} title="Power">
                                                        {formatPower(player.power)}
                                                    </span>
                                                    <span className={`text-xs text-blue-400`} title="Kill Points">
                                                        KP: {formatPower(player.kills || killsByName[player.name] || 0)}
                                                    </span>
                                                    {/* Move to other zone */}
                                                    <select
                                                        value={zone}
                                                        onChange={(e) => movePlayerToZone(player.name, zone, parseInt(e.target.value))}
                                                        className={`text-xs px-1 py-0.5 rounded ${theme.input}`}
                                                    >
                                                        <option value={0}>Sub</option>
                                                        <option value={1}>Z1</option>
                                                        <option value={2}>Z2</option>
                                                        <option value={3}>Z3</option>
                                                    </select>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>

                    {/* Substitutes Section */}
                    {(suggestedZones[0]?.length || 0) > 0 && (
                        <section className={`${theme.card} border-l-4 border-gray-500 rounded-xl p-4 mb-6`}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className={`font-semibold text-gray-400`}>
                                    Substitutes ({suggestedZones[0]?.length || 0})
                                </h3>
                                <span className={`text-sm ${theme.textMuted}`}>
                                    {formatPower(suggestedZones[0]?.reduce((sum, p) => sum + p.power, 0) || 0)}
                                </span>
                            </div>
                            <p className={`text-xs ${theme.textMuted} mb-3`}>
                                Players marked as &quot;Maybe&quot; - move to a zone if they confirm
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {(suggestedZones[0] || []).map((player) => (
                                    <div key={player.name} className="flex items-center gap-2 px-3 py-1.5 rounded bg-[var(--background-secondary)]">
                                        <span className={`text-sm ${theme.text}`}>{player.name}</span>
                                        <span className={`text-xs ${theme.textMuted}`}>{formatPower(player.power)}</span>
                                        <select
                                            value={0}
                                            onChange={(e) => movePlayerToZone(player.name, 0, parseInt(e.target.value))}
                                            className={`text-xs px-1 py-0.5 rounded ${theme.input}`}
                                        >
                                            <option value={0}>Sub</option>
                                            <option value={1}>→ Z1</option>
                                            <option value={2}>→ Z2</option>
                                            <option value={3}>→ Z3</option>
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Legend */}
                    <div className={`flex items-center justify-center gap-6 mb-6 text-xs ${theme.textMuted}`}>
                        <span>⭐ = Rally Lead</span>
                        <span>⚡ = Teleport First</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={handleReset}
                            className={`px-4 py-2 rounded-lg text-sm ${theme.tag} hover:opacity-80`}
                        >
                            ← Back to Selection
                        </button>
                        <button
                            onClick={() => {
                                // Validate rally leads
                                const missingLeads = [1, 2, 3].filter(z => !selectedRallyLeads[z] && (suggestedZones[z]?.length || 0) > 0);
                                if (missingLeads.length > 0) {
                                    alert(`Please select rally leads for Zone ${missingLeads.join(', ')}`);
                                    return;
                                }
                                onApply(suggestedZones, selectedRallyLeads, selectedTeleportFirst, suggestedZones[0] || []);
                            }}
                            className="px-6 py-2 rounded-lg font-medium text-white bg-[#4318ff] hover:bg-[#4318ff]/80"
                        >
                            Apply to Strategy →
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default function AooStrategyPage() {
    // Auth for saving user selections
    const { user } = useAuth();

    // Fetch roster from Supabase
    const { roster, rosterNames, powerByName, killsByName, allianceByName, alliances: dbAlliances, loading: rosterLoading } = useAllianceRoster();
    const [activeTab, setActiveTab] = useState<'map' | 'roster' | 'builder'>('builder');
    const [players, setPlayers] = useState<Player[]>([]);
    const [substitutes, setSubstitutes] = useState<Player[]>([]);
    const [teams, setTeams] = useState<TeamInfo[]>(DEFAULT_TEAMS);
    const [mapImage, setMapImage] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [mapAssignments, setMapAssignments] = useState<MapAssignments | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditor, setIsEditor] = useState(false);
    const [editorPassword, setEditorPassword] = useState('');
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [strategyId, setStrategyId] = useState<number | null>(null);
    const strategyIdRef = useRef<number | null>(null);
    // Vision UI theme is always dark - no toggle needed
    const [strategyExpanded, setStrategyExpanded] = useState(false);
    const [eventMode, setEventMode] = useState<EventMode>('main');
    const [aooTeam, setAooTeam] = useState<AooTeam>('team1');

    const [playerSearch, setPlayerSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [newPlayerTeam, setNewPlayerTeam] = useState(1);
    const [newPlayerTags, setNewPlayerTags] = useState<string[]>([]);
    const [useCustomName, setUseCustomName] = useState(false);
    const [rosterSort, setRosterSort] = useState<'power' | 'teleport' | 'name'>('teleport');
    const [copySuccess, setCopySuccess] = useState<number | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const rosterGridRef = useRef<HTMLDivElement>(null);
    const rosterCanvasRef = useRef<HTMLCanvasElement>(null);

    // Team Builder state
    const [builderAlliance, setBuilderAlliance] = useState<string>('ANG');
    const [teamCount, setTeamCount] = useState<1 | 2 | 3>(1); // Number of AoO teams to organize
    const [activeTeam, setActiveTeam] = useState<1 | 2 | 3>(1); // Which team is being edited
    const [confirmations, setConfirmations] = useState<Record<string, ConfirmationStatus>>({});
    const [builderStep, setBuilderStep] = useState<'select' | 'distribute' | 'leads' | 'done'>('select');
    const [suggestedZones, setSuggestedZones] = useState<Record<number, { name: string; power: number; kills: number }[]>>({});
    const [selectedRallyLeads, setSelectedRallyLeads] = useState<Record<number, string>>({});
    const [selectedTeleportFirst, setSelectedTeleportFirst] = useState<Set<string>>(new Set());
    const [pendingAdditions, setPendingAdditions] = useState<PendingMember[]>([]);

    const EDITOR_PASSWORD = 'carn-dum';

    // Save pending additions to Supabase for admin approval
    const handleSavePendingAdditions = async (additions: PendingMember[]) => {
        if (additions.length === 0) return;

        try {
            const supabase = (await import('@/lib/supabase/client')).createClient();
            const { error } = await supabase
                .from('pending_roster_additions')
                .insert(additions.map(a => ({
                    name: a.name,
                    power: a.power || null,
                    governor_id: a.governorId ? parseInt(a.governorId) : null,
                    alliance: builderAlliance !== 'all' ? builderAlliance : null,
                    suggested_by: user?.id || 'anonymous',
                })));

            if (error) {
                console.error('Error saving pending additions:', error);
                alert('Failed to save pending members. They will still be available in this session.');
            } else {
                alert(`${additions.length} member(s) submitted for approval!`);
            }
        } catch (err) {
            console.error('Error saving pending additions:', err);
        }
    };

    useEffect(() => {
        // Load data for the initial event mode and team (check URL or localStorage)
        const savedMode = localStorage.getItem('aoo-event-mode') as EventMode | null;
        const savedTeam = localStorage.getItem('aoo-team') as AooTeam | null;
        const initialMode = savedMode || 'main';
        const initialTeam = savedTeam || 'team1';
        setEventMode(initialMode);
        setAooTeam(initialTeam);
        loadData(initialMode, initialTeam);
    }, []);

    // Handle event mode changes
    const handleEventModeChange = (newMode: EventMode) => {
        if (newMode === eventMode) return;
        setEventMode(newMode);
        localStorage.setItem('aoo-event-mode', newMode);
        loadData(newMode, aooTeam);
    };

    // Handle AoO team changes (Team 1 / Team 2)
    const handleAooTeamChange = (newTeam: AooTeam) => {
        if (newTeam === aooTeam) return;
        setAooTeam(newTeam);
        localStorage.setItem('aoo-team', newTeam);
        loadData(eventMode, newTeam);
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const loadData = async (mode: EventMode = eventMode, team: AooTeam = aooTeam) => {
        setIsLoading(true);
        console.log('loadData called', { mode, team });
        try {
            // Query for the specific event mode and team
            const { data, error } = await supabase
                .from('aoo_strategy')
                .select('*')
                .eq('event_mode', mode)
                .eq('aoo_team', team)
                .limit(1)
                .maybeSingle();

            console.log('Supabase query result', { data, error, hasData: !!data, dataId: data?.id });

            if (error && error.code !== 'PGRST116') {
                // PGRST116 = column doesn't exist (migration not run yet)
                console.error('Error loading data:', error);
            }

            if (data) {
                console.log('Loading from Supabase, setting strategyId to:', data.id);
                setStrategyId(data.id);
                strategyIdRef.current = data.id;
                const strategyData = data.data as StrategyData;
                console.log('Strategy data mapAssignments:', strategyData?.mapAssignments);
                setPlayers(strategyData?.players || []);
                setSubstitutes(strategyData?.substitutes || []);
                setTeams(strategyData?.teams || DEFAULT_TEAMS);
                setMapImage(strategyData?.mapImage || null);
                setNotes(strategyData?.notes || '');
                setMapAssignments(strategyData?.mapAssignments || undefined);
            } else {
                // No data in Supabase - try to load from JSON files
                console.log('No Supabase data, trying JSON fallback');
                setStrategyId(null);
                strategyIdRef.current = null;
                try {
                    const jsonFile = team === 'team1' ? '/data/aoo-team1.json' : '/data/aoo-team2.json';
                    const response = await fetch(jsonFile);
                    if (response.ok) {
                        const jsonData = await response.json() as StrategyData;
                        console.log('Loaded from JSON:', jsonFile);
                        setPlayers(jsonData?.players || []);
                        setSubstitutes(jsonData?.substitutes || []);
                        setTeams(jsonData?.teams || DEFAULT_TEAMS);
                        setMapImage(jsonData?.mapImage || null);
                        setNotes(jsonData?.notes || '');
                        setMapAssignments(jsonData?.mapAssignments || undefined);
                    } else {
                        // JSON file not found - use empty defaults
                        console.log('JSON file not found, using defaults');
                        setPlayers([]);
                        setSubstitutes([]);
                        setTeams(DEFAULT_TEAMS);
                        setMapImage(null);
                        setNotes('');
                        setMapAssignments(undefined);
                    }
                } catch {
                    // Error loading JSON - use empty defaults
                    console.log('Error loading JSON, using defaults');
                    setPlayers([]);
                    setSubstitutes([]);
                    setTeams(DEFAULT_TEAMS);
                    setMapImage(null);
                    setNotes('');
                    setMapAssignments(undefined);
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setIsLoading(false);
    };

    const saveData = async (updatedData: Partial<StrategyData>) => {
        const data: StrategyData = {
            players: updatedData.players ?? players,
            teams: updatedData.teams ?? teams,
            mapImage: updatedData.mapImage ?? mapImage,
            notes: updatedData.notes ?? notes,
            mapAssignments: updatedData.mapAssignments ?? mapAssignments ?? {},
            substitutes: updatedData.substitutes ?? substitutes,
        };
        // Use ref to get the latest strategyId (avoids stale closure issues)
        const currentStrategyId = strategyIdRef.current;
        try {
            console.log('saveData called', { currentStrategyId, strategyId, eventMode, aooTeam, dataKeys: Object.keys(data) });
            if (currentStrategyId) {
                console.log('Updating existing row:', currentStrategyId);
                const { error } = await supabase.from('aoo_strategy').update({ data }).eq('id', currentStrategyId);
                if (error) throw error;
                console.log('Update successful');
            } else {
                console.log('Inserting new row for', eventMode, aooTeam);
                const { data: newData, error } = await supabase
                    .from('aoo_strategy')
                    .insert([{ data, event_mode: eventMode, aoo_team: aooTeam }])
                    .select()
                    .single();
                if (error) throw error;
                if (newData) {
                    console.log('Insert successful, new id:', newData.id);
                    setStrategyId(newData.id);
                    strategyIdRef.current = newData.id;
                }
            }
        } catch (error) {
            console.error('Error saving data:', error);
            alert('Error saving data: ' + (error instanceof Error ? error.message : String(error)));
        }
    };

    const handleMapUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!isEditor) return;
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const newMapImage = event.target?.result as string;
                setMapImage(newMapImage);
                saveData({ mapImage: newMapImage });
            };
            reader.readAsDataURL(file);
        }
    };

    const assignedNames = [...players, ...substitutes].map(p => p.name.toLowerCase());
    const filteredRoster = rosterNames.filter(name =>
        name.toLowerCase().includes(playerSearch.toLowerCase()) &&
        !assignedNames.includes(name.toLowerCase())
    );

    const addPlayer = (name: string) => {
        if (!isEditor || !name.trim()) return;
        if ([...players, ...substitutes].some(p => p.name.toLowerCase() === name.toLowerCase())) {
            alert('Player already assigned!');
            return;
        }
        const newPlayer: Player = { id: Date.now(), name: name.trim(), team: newPlayerTeam, tags: newPlayerTags, power: 0, assignments: { phase1: "", phase2: "", phase3: "", phase4: "" } };
        
        if (newPlayerTeam === 0) {
            // Add to substitutes
            const updatedSubs = [...substitutes, newPlayer];
            setSubstitutes(updatedSubs);
            saveData({ substitutes: updatedSubs });
        } else {
            // Add to players
            const updatedPlayers = [...players, newPlayer];
            setPlayers(updatedPlayers);
            saveData({ players: updatedPlayers });
        }
        
        setPlayerSearch('');
        setNewPlayerTags([]);
        setShowDropdown(false);
        setUseCustomName(false);
    };

    const removePlayer = (id: number) => {
        if (!isEditor) return;
        const updatedPlayers = players.filter(p => p.id !== id);
        setPlayers(updatedPlayers);
        saveData({ players: updatedPlayers });
    };

    const togglePlayerTag = (playerId: number, tag: string) => {
        if (!isEditor) return;
        const updatedPlayers = players.map(p => {
            if (p.id === playerId) {
                const newTags = p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag];
                return { ...p, tags: newTags };
            }
            return p;
        });
        setPlayers(updatedPlayers);
        saveData({ players: updatedPlayers });
    };

    const updateTeamDescription = (teamIndex: number, description: string) => {
        if (!isEditor) return;
        const updatedTeams = teams.map((t, i) => i === teamIndex ? { ...t, description } : t);
        setTeams(updatedTeams);
        saveData({ teams: updatedTeams });
    };

    const movePlayer = (playerId: number, newTeam: number) => {
        if (!isEditor) return;
        const updatedPlayers = players.map(p => p.id === playerId ? { ...p, team: newTeam } : p);
        setPlayers(updatedPlayers);
        saveData({ players: updatedPlayers });
    };

    const handlePasswordSubmit = () => {
        if (editorPassword === EDITOR_PASSWORD) {
            setIsEditor(true);
            setShowPasswordPrompt(false);
            setEditorPassword('');
        } else {
            alert('Incorrect password');
            setEditorPassword('');
        }
    };

    const getTeamPlayers = (teamNum: number) => {
        const teamPlayers = players.filter(p => p.team === teamNum);
        return sortPlayers(teamPlayers);
    };

    const sortPlayers = (playerList: Player[]) => {
        return [...playerList].sort((a, b) => {
            // Rally Leaders always at top
            const aIsLeader = a.tags.includes('Rally Leader');
            const bIsLeader = b.tags.includes('Rally Leader');
            if (aIsLeader && !bIsLeader) return -1;
            if (!aIsLeader && bIsLeader) return 1;

            switch (rosterSort) {
                case 'power':
                    const powerA = a.power || powerByName[a.name] || 0;
                    const powerB = b.power || powerByName[b.name] || 0;
                    return powerB - powerA; // Descending
                case 'teleport':
                    // Teleport order: 1st > 2nd > none, then by power within group
                    const getTeleportOrder = (p: Player) => {
                        if (p.tags.includes('Teleport 1st')) return 0;
                        if (p.tags.includes('Teleport 2nd')) return 1;
                        return 2;
                    };
                    const orderA = getTeleportOrder(a);
                    const orderB = getTeleportOrder(b);
                    if (orderA !== orderB) return orderA - orderB;
                    // Same teleport group, sort by power
                    return (b.power || powerByName[b.name] || 0) - (a.power || powerByName[a.name] || 0);
                case 'name':
                    return a.name.localeCompare(b.name); // Alphabetical
                default:
                    return 0;
            }
        });
    };

    const handleMapSave = (newAssignments: MapAssignments) => {
        console.log('handleMapSave called', { newAssignments, strategyId, isEditor });
        setMapAssignments(newAssignments);
        saveData({ mapAssignments: newAssignments });
    };

    // Generate zone roster text for copying to clipboard (newline separated)
    const generateZoneText = useCallback((zoneNum: number) => {
        const formatPlayerTags = (p: Player) => {
            const tags: string[] = [];
            if (p.tags.includes('Rally Leader')) tags.push('Leader');
            if (p.tags.includes('Coordinator')) tags.push('Coordinator');
            if (p.tags.includes('Teleport 1st')) tags.push('1st Teleport');
            if (p.tags.includes('Teleport 2nd')) tags.push('2nd Teleport');
            return tags.length > 0 ? ` (${tags.join(', ')})` : '';
        };

        const zonePlayers = sortPlayers(players.filter(p => p.team === zoneNum));
        const zoneName = teams[zoneNum - 1]?.name || `Zone ${zoneNum}`;
        const zoneDesc = teams[zoneNum - 1]?.description || '';

        const header = `${zoneName} - ${zoneDesc}`;
        const playerLines = zonePlayers.map(p => `${p.name}${formatPlayerTags(p)}`);

        return `${header}\n${playerLines.join('\n')}`;
    }, [players, teams, sortPlayers]);

    const copyZoneToClipboard = useCallback(async (zoneNum: number) => {
        const text = generateZoneText(zoneNum);
        try {
            await navigator.clipboard.writeText(text);
            setCopySuccess(zoneNum);
            setTimeout(() => setCopySuccess(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [generateZoneText]);

    const exportRosterImage = useCallback(() => {
        const canvas = rosterCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Canvas settings
        const padding = 40;
        const zoneWidth = 400;
        const playerHeight = 28;
        const headerHeight = 50;
        const zoneGap = 30;
        const subsHeight = substitutes.length > 0 ? 60 + Math.ceil(substitutes.length / 6) * 24 : 0;

        // Calculate dimensions
        const zonePlayers = [1, 2, 3].map(z => sortPlayers(players.filter(p => p.team === z)));
        const maxPlayers = Math.max(...zonePlayers.map(z => z.length));
        const canvasWidth = (zoneWidth * 3) + (zoneGap * 2) + (padding * 2);
        const canvasHeight = headerHeight + (maxPlayers * playerHeight) + (padding * 2) + 60 + subsHeight;

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Background
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Title
        ctx.fillStyle = '#fafafa';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const titleText = eventMode === 'training'
            ? 'Ark of Osiris - Training Match'
            : 'Ark of Osiris - Zone Assignments';
        ctx.fillText(titleText, canvasWidth / 2, padding + 10);

        // Zone colors matching in-game (Z1=blue, Z2=orange, Z3=purple)
        const zoneHexColors: Record<number, string> = {
            1: '#2563eb', // blue-600
            2: '#ea580c', // orange-600
            3: '#9333ea', // purple-600
        };

        // Draw each zone
        [1, 2, 3].forEach((zoneNum, idx) => {
            const x = padding + (idx * (zoneWidth + zoneGap));
            const y = padding + headerHeight;
            const zonePlayersList = zonePlayers[idx];
            const zoneName = teams[zoneNum - 1]?.name || `Zone ${zoneNum}`;
            const zoneDesc = teams[zoneNum - 1]?.description || '';

            // Zone header with colored left border
            ctx.fillStyle = '#27272a';
            ctx.fillRect(x, y, zoneWidth, 36);
            // Left color stripe
            ctx.fillStyle = zoneHexColors[zoneNum];
            ctx.fillRect(x, y, 4, 36);
            ctx.fillStyle = zoneHexColors[zoneNum];
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${zoneName} - ${zoneDesc}`, x + 12, y + 24);
            ctx.fillStyle = '#a1a1aa';
            ctx.font = '12px system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${zonePlayersList.length} players`, x + zoneWidth - 12, y + 24);

            // Players
            zonePlayersList.forEach((p, pIdx) => {
                const py = y + 40 + (pIdx * playerHeight);

                // Alternating row background
                ctx.fillStyle = pIdx % 2 === 0 ? '#1f1f23' : '#18181b';
                ctx.fillRect(x, py, zoneWidth, playerHeight);

                // Player name
                ctx.fillStyle = '#fafafa';
                ctx.font = '13px system-ui, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(p.name, x + 12, py + 18);

                // Tags - muted colors to not compete with zone colors
                let tagX = x + 140;
                const tagColors: Record<string, string> = {
                    'Rally Leader': '#44403c',  // stone-700
                    'Coordinator': '#57534e',   // stone-600
                    'Teleport 1st': '#047857',  // emerald-700
                    'Teleport 2nd': '#059669',  // emerald-600
                };

                p.tags.forEach(tag => {
                    if (tagColors[tag]) {
                        const shortTag = tag === 'Rally Leader' ? 'Leader' :
                                        tag === 'Coordinator' ? 'Coord' :
                                        tag === 'Teleport 1st' ? '1st' :
                                        tag === 'Teleport 2nd' ? '2nd' : tag;
                        ctx.fillStyle = tagColors[tag];
                        const tagWidth = ctx.measureText(shortTag).width + 12;
                        ctx.beginPath();
                        ctx.roundRect(tagX, py + 4, tagWidth, 18, 4);
                        ctx.fill();
                        ctx.fillStyle = '#fff';
                        ctx.font = '11px system-ui, sans-serif';
                        ctx.fillText(shortTag, tagX + 6, py + 16);
                        tagX += tagWidth + 4;
                    }
                });

                // Power
                const power = p.power || powerByName[p.name] || 0;
                if (power > 0) {
                    ctx.fillStyle = '#71717a';
                    ctx.font = '11px system-ui, sans-serif';
                    ctx.textAlign = 'right';
                    ctx.fillText(formatPower(power), x + zoneWidth - 12, py + 18);
                }
            });
        });

        // Substitutes section
        if (substitutes.length > 0) {
            const subsY = padding + headerHeight + (maxPlayers * playerHeight) + 60;

            // Subs header
            ctx.fillStyle = '#a1a1aa';
            ctx.font = 'bold 12px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`SUBSTITUTES (${substitutes.length})`, padding, subsY);

            // Draw subs in a grid (6 per row)
            const subsPerRow = 6;
            const subWidth = (canvasWidth - padding * 2) / subsPerRow;
            substitutes.forEach((sub, idx) => {
                const row = Math.floor(idx / subsPerRow);
                const col = idx % subsPerRow;
                const sx = padding + (col * subWidth);
                const sy = subsY + 16 + (row * 24);

                ctx.fillStyle = '#71717a';
                ctx.font = '12px system-ui, sans-serif';
                ctx.textAlign = 'left';
                const power = sub.power || powerByName[sub.name] || 0;
                const powerStr = power > 0 ? ` (${formatPower(power)})` : '';
                ctx.fillText(`${sub.name}${powerStr}`, sx, sy);
            });
        }

        // Download
        const link = document.createElement('a');
        link.download = eventMode === 'training' ? 'aoo-training-roster.png' : 'aoo-roster.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }, [players, teams, substitutes, sortPlayers, powerByName, eventMode]);

    // Theme using CSS variables to match the rest of the app
    const theme = {
        bg: 'bg-[var(--background)]',
        card: 'bg-[var(--background-card)] border-[var(--border)] backdrop-blur-xl',
        text: 'text-[var(--foreground)]',
        textMuted: 'text-[var(--text-secondary)]',
        textAccent: 'text-[#4318ff]',
        border: 'border-[var(--border)]',
        input: 'bg-[var(--background-card)] border-[var(--border)] text-[var(--foreground)] placeholder-[var(--text-muted)]',
        button: 'bg-[var(--background-card)] hover:opacity-80 text-[var(--foreground)] border border-[var(--border)]',
        buttonPrimary: 'bg-gradient-to-r from-[#4318ff] to-[#9f7aea] hover:opacity-90 text-white',
        tag: 'bg-[var(--background-secondary)] text-[var(--text-secondary)]',
        tagActive: 'bg-[#4318ff] text-white',
        dropdown: 'bg-[var(--background-card)] border-[var(--border)]',
        dropdownHover: 'hover:bg-[var(--background-hover)]',
        tabActive: 'text-[#4318ff] border-[#4318ff] bg-[#4318ff]/5',
        tabInactive: 'text-[var(--text-secondary)] border-transparent hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]',
    };

    if (isLoading) {
        return (
            <AppSidebar>
                <div className={`min-h-screen ${theme.bg} ${theme.text} flex items-center justify-center`}>
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border border-[#4318ff] border-t-transparent rounded-full animate-spin"></div>
                        <span className={theme.textMuted}>Loading...</span>
                    </div>
                </div>
            </AppSidebar>
        );
    }

    return (
        <AppSidebar>
        <div className={`min-h-screen ${theme.bg} ${theme.text} transition-colors duration-200`}>
            {/* Header */}
            <header className="bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] sticky top-14 lg:top-0 z-30">
                <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <div className="min-w-0">
                                <h1 className="text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight">AoO Planner</h1>
                                <p className={`text-xs sm:text-sm ${theme.textMuted} hidden sm:block`}>
                                    30v30 Strategy Planner
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-shrink-0">
                            {!isEditor ? (
                                <button onClick={() => setShowPasswordPrompt(true)} className={`p-2 sm:px-4 sm:py-2 rounded-lg text-sm font-medium ${theme.button}`} title="Edit Mode">
                                    <span className="hidden sm:inline">Edit Mode</span>
                                    <span className="sm:hidden text-xs">Edit</span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => setIsEditor(false)}
                                    className={`p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-medium ${theme.tagActive} hover:opacity-80 transition-opacity`}
                                >
                                    <span className="hidden sm:inline">Exit Edit</span>
                                    <span className="sm:hidden text-xs">Exit</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-2 mt-4 border-b border-[var(--border)] pb-0 overflow-x-auto hide-scrollbar">
                        <button
                            onClick={() => setActiveTab('builder')}
                            className={`px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 border-b-2 -mb-[1px] ${
                                activeTab === 'builder'
                                    ? 'text-[#4318ff] border-[#4318ff] bg-[#4318ff]/5'
                                    : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]'
                            }`}
                        >
                            🛠️ Team Builder
                        </button>
                        <button
                            onClick={() => setActiveTab('roster')}
                            className={`px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 border-b-2 -mb-[1px] ${
                                activeTab === 'roster'
                                    ? 'text-[#4318ff] border-[#4318ff] bg-[#4318ff]/5'
                                    : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]'
                            }`}
                        >
                            👥 Zone Roster
                        </button>
                    </div>
                </div>
            </header>

            {/* Password Prompt Modal */}
            {showPasswordPrompt && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className={`${theme.card} border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl`}>
                        <h2 className="text-lg font-semibold mb-4">Enter Password</h2>
                        <input type="password" value={editorPassword} onChange={(e) => setEditorPassword(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()} placeholder="Password"
                            className={`w-full px-3 py-2 rounded-lg border ${theme.input} mb-4 focus:outline-none focus:ring-2 focus:ring-[#4318ff]`} autoFocus />
                        <div className="flex gap-2">
                            <button onClick={handlePasswordSubmit} className={`flex-1 py-2 rounded-lg font-medium ${theme.buttonPrimary}`}>Submit</button>
                            <button onClick={() => setShowPasswordPrompt(false)} className={`flex-1 py-2 rounded-lg font-medium ${theme.button}`}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Mode Banner */}
            {isEditor && (
                <div className="bg-[#4318ff]/10 border-b border-[#4318ff]/30">
                    <div className="max-w-6xl mx-auto px-4 md:px-6 py-3">
                        <div className="flex items-start gap-3">
                            <span className="text-[#9f7aea] text-lg flex-shrink-0">✏️</span>
                            <div>
                                <h3 className="font-medium text-[#9f7aea] text-sm">Edit Mode Active</h3>
                                <p className={`text-xs ${theme.textMuted} mt-1`}>
                                    <strong>Team Builder:</strong> Select players, distribute to zones, assign rally leads •
                                    <strong> Zone Roster:</strong> Fine-tune assignments and toggle tags
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab Content */}
            {activeTab === 'map' && (
                <AOOInteractiveMap
                    initialAssignments={mapAssignments}
                    onSave={handleMapSave}
                    isEditor={isEditor}
                    players={players}
                />
            )}

            {activeTab === 'builder' && (
                <TeamBuilderTab
                    roster={roster}
                    powerByName={powerByName}
                    killsByName={killsByName}
                    allianceByName={allianceByName}
                    alliances={dbAlliances.length > 0 ? dbAlliances : [...ALLIANCES]}
                    builderAlliance={builderAlliance}
                    setBuilderAlliance={setBuilderAlliance}
                    teamCount={teamCount}
                    setTeamCount={setTeamCount}
                    activeTeam={activeTeam}
                    setActiveTeam={setActiveTeam}
                    confirmations={confirmations}
                    setConfirmations={setConfirmations}
                    builderStep={builderStep}
                    setBuilderStep={setBuilderStep}
                    suggestedZones={suggestedZones}
                    setSuggestedZones={setSuggestedZones}
                    selectedRallyLeads={selectedRallyLeads}
                    setSelectedRallyLeads={setSelectedRallyLeads}
                    selectedTeleportFirst={selectedTeleportFirst}
                    setSelectedTeleportFirst={setSelectedTeleportFirst}
                    pendingAdditions={pendingAdditions}
                    setPendingAdditions={setPendingAdditions}
                    onSavePendingAdditions={handleSavePendingAdditions}
                    onApply={(zonePlayers, rallyLeads, teleportFirst, subs) => {
                        // Apply distribution to strategy
                        const newPlayers: Player[] = [];
                        const newSubstitutes: Player[] = [];
                        let idCounter = Date.now();

                        for (const [zoneNum, zonePeople] of Object.entries(zonePlayers)) {
                            const zone = parseInt(zoneNum);
                            if (zone === 0) continue; // Skip substitutes here, handle separately
                            for (const p of zonePeople) {
                                const tags: string[] = ['Confirmed'];
                                if (rallyLeads[zone] === p.name) {
                                    tags.push('Rally Leader');
                                }
                                if (teleportFirst.has(p.name)) {
                                    tags.push('Teleport 1st');
                                }
                                newPlayers.push({
                                    id: idCounter++,
                                    name: p.name,
                                    team: zone,
                                    tags,
                                    power: p.power,
                                    assignments: { phase1: '', phase2: '', phase3: '', phase4: '' },
                                });
                            }
                        }

                        // Create substitutes
                        for (const p of subs) {
                            newSubstitutes.push({
                                id: idCounter++,
                                name: p.name,
                                team: 0,
                                tags: ['Maybe'],
                                power: p.power,
                                assignments: { phase1: '', phase2: '', phase3: '', phase4: '' },
                            });
                        }

                        setPlayers(newPlayers);
                        setSubstitutes(newSubstitutes);
                        saveData({ players: newPlayers, substitutes: newSubstitutes });
                        setActiveTab('roster');
                    }}
                    theme={theme}
                    formatPower={formatPower}
                    user={user}
                />
            )}

            {activeTab === 'roster' && (
                /* Roster Tab */
                <div className="max-w-7xl mx-auto p-4 md:p-6">
                    {/* Strategy Overview */}
                    <section className={`${theme.card} border border-[#4318ff] rounded-xl mb-6 p-4`}>
                        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 text-[#9f7aea]`}>📋 Strategy Overview</h2>

                        {/* Key Rules */}
                        <div className={`grid md:grid-cols-2 gap-4 mb-4`}>
                            <div className="p-3 rounded-lg bg-[#4318ff]/10 border border-[#4318ff]/20">
                                <h3 className="font-bold text-[#9f7aea] text-sm mb-2">📌 IMPORTANT</h3>
                                <ul className={`text-xs space-y-1 ${theme.text}`}>
                                    <li>• Pay attention to your lane assignment</li>
                                    <li>• Everyone rush their obelisk first</li>
                                    <li>• Rally leaders TP first</li>
                                    <li>• Move down ONLY after garrisoning</li>
                                    <li>• Only rally occupied buildings</li>
                                    <li>• Work as a unit, not individual</li>
                                </ul>
                            </div>
                            <div className="p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
                                <h3 className={`font-bold ${theme.textMuted} text-sm mb-2`}>🎯 TROOP DEPLOYMENT</h3>
                                <ul className={`text-xs space-y-1 ${theme.text}`}>
                                    <li>🐴 <strong>Cavalry</strong> → For rallies</li>
                                    <li>🛡️ <strong>Infantry</strong> → To garrison</li>
                                    <li>🌾 <strong>Else</strong> → Gather tiles</li>
                                </ul>
                            </div>
                        </div>

                        {/* Expandable Notes */}
                        <button
                            onClick={() => setStrategyExpanded(!strategyExpanded)}
                            className={`w-full p-2 flex items-center justify-between hover:opacity-80 transition-opacity border-t ${theme.border}`}
                        >
                            <span className={`text-xs ${theme.textMuted}`}>{isEditor ? 'Edit Notes' : 'Additional Notes'}</span>
                            <span className={`text-sm ${theme.textMuted}`}>{strategyExpanded ? '▼' : '▶'}</span>
                        </button>
                        {strategyExpanded && (
                            <div className={`pt-2`}>
                                {isEditor ? (
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        onBlur={() => saveData({ notes })}
                                        placeholder="Add strategy notes..."
                                        className={`w-full min-h-[150px] px-3 py-2 rounded-lg border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff] resize-y font-mono text-sm`}
                                    />
                                ) : (
                                    <div className={`whitespace-pre-wrap font-mono text-sm ${theme.text}`}>
                                        {notes || 'No additional notes'}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    {isEditor && (
                        <section className={`${theme.card} border rounded-xl p-4 mb-6`}>
                            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${theme.textMuted}`}>Add Player</h2>
                            <div className="flex flex-wrap gap-3 items-end">
                                <div className="flex-1 min-w-[200px] relative" ref={dropdownRef}>
                                    <div className="flex gap-2 mb-2">
                                        <button onClick={() => setUseCustomName(false)} className={`text-xs px-2 py-1 rounded ${!useCustomName ? theme.tagActive : theme.tag}`}>
                                            From Roster
                                        </button>
                                        <button onClick={() => setUseCustomName(true)} className={`text-xs px-2 py-1 rounded ${useCustomName ? theme.tagActive : theme.tag}`}>
                                            Custom Name
                                        </button>
                                    </div>
                                    <input type="text" value={playerSearch} onChange={(e) => { setPlayerSearch(e.target.value); setShowDropdown(true); }}
                                        onFocus={() => !useCustomName && setShowDropdown(true)}
                                        placeholder={useCustomName ? "Enter custom name" : "Search roster..."}
                                        className={`w-full px-3 py-2 rounded-lg border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff]`} />
                                    {showDropdown && !useCustomName && filteredRoster.length > 0 && (
                                        <div className={`absolute z-10 w-full mt-1 ${theme.dropdown} border rounded-lg shadow-lg max-h-48 overflow-y-auto`}>
                                            {filteredRoster.slice(0, 10).map(name => (
                                                <button key={name} onClick={() => addPlayer(name)}
                                                    className={`w-full text-left px-3 py-2 text-sm ${theme.dropdownHover} ${theme.text}`}>
                                                    {name}
                                                </button>
                                            ))}
                                            {filteredRoster.length > 10 && (
                                                <div className={`px-3 py-2 text-xs ${theme.textMuted}`}>+{filteredRoster.length - 10} more...</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="w-48">
                                    <select value={newPlayerTeam} onChange={(e) => setNewPlayerTeam(Number(e.target.value))}
                                        className={`w-full px-3 py-2 rounded-lg border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff]`}>
                                        <option value={1}>Zone 1 ({getTeamPlayers(1).length})</option>
                                        <option value={2}>Zone 2 ({getTeamPlayers(2).length})</option>
                                        <option value={3}>Zone 3 ({getTeamPlayers(3).length})</option>
                                        <option value={0}>Substitute ({substitutes.length})</option>
                                    </select>
                                </div>
                                {useCustomName && (
                                    <button onClick={() => addPlayer(playerSearch)} className={`px-6 py-2 rounded-lg font-medium ${theme.buttonPrimary}`}>Add</button>
                                )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {AVAILABLE_TAGS.map(tag => (
                                    <button key={tag} onClick={() => setNewPlayerTags(newPlayerTags.includes(tag) ? newPlayerTags.filter(t => t !== tag) : [...newPlayerTags, tag])}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${newPlayerTags.includes(tag) ? TAG_COLORS[tag] : theme.tag}`}>
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Sort Controls and Export */}
                    <div className={`flex flex-wrap items-center justify-between gap-3 mb-4`}>
                        <div className="flex items-center gap-4">
                            <h2 className={`text-sm font-semibold uppercase tracking-wider ${theme.textMuted}`}>Zone Assignments</h2>
                            <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                <span className={`text-xs ${theme.textMuted}`}>= confirmed</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Sort options */}
                            <div className="flex items-center gap-2">
                                <span className={`text-xs ${theme.textMuted}`}>Sort:</span>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setRosterSort('power')}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${rosterSort === 'power' ? theme.tagActive : theme.tag}`}
                                    >
                                        Power
                                    </button>
                                    <button
                                        onClick={() => setRosterSort('teleport')}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${rosterSort === 'teleport' ? theme.tagActive : theme.tag}`}
                                    >
                                        Teleport
                                    </button>
                                    <button
                                        onClick={() => setRosterSort('name')}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${rosterSort === 'name' ? theme.tagActive : theme.tag}`}
                                    >
                                        Name
                                    </button>
                                </div>
                            </div>
                            {/* Export action */}
                            <button
                                onClick={exportRosterImage}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${theme.button}`}
                            >
                                📷 Export
                            </button>
                        </div>
                    </div>
                    {/* Hidden canvas for export */}
                    <canvas ref={rosterCanvasRef} style={{ display: 'none' }} />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        {[1, 2, 3].map((teamNum) => {
                            const teamInfo = teams[teamNum - 1];
                            const teamPlayers = getTeamPlayers(teamNum);
                            const zoneTotalPower = teamPlayers.reduce((sum, p) => sum + (p.power || powerByName[p.name] || 0), 0);
                            const zoneColor = ZONE_COLORS[teamNum as keyof typeof ZONE_COLORS];
                            return (
                                <section key={teamNum} className={`${theme.card} border-l-4 ${zoneColor.border} rounded-xl p-4`}>
                                    <div className={`mb-4 pb-3 border-b ${theme.border}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <h3 className={`font-semibold ${zoneColor.text}`}>{teamInfo.name}</h3>
                                                <button
                                                    onClick={() => copyZoneToClipboard(teamNum)}
                                                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${copySuccess === teamNum ? 'bg-[#4318ff] text-white' : theme.tag} hover:opacity-80`}
                                                    title={`Copy ${teamInfo.name} roster`}
                                                >
                                                    {copySuccess === teamNum ? '✓' : '📋'}
                                                </button>
                                            </div>
                                            <div className="text-right">
                                                <span className={`text-xs ${theme.textMuted}`}>{teamPlayers.length} players</span>
                                                {zoneTotalPower > 0 && (
                                                    <p className={`text-xs ${theme.textAccent}`}>{formatPower(zoneTotalPower)}</p>
                                                )}
                                            </div>
                                        </div>
                                        {isEditor ? (
                                            <input type="text" value={teamInfo.description} onChange={(e) => updateTeamDescription(teamNum - 1, e.target.value)}
                                                placeholder="Role description" className={`mt-2 w-full px-2 py-1 rounded text-sm border ${theme.input} focus:outline-none focus:ring-1 focus:ring-[#4318ff]`} />
                                        ) : (
                                            <p className={`text-sm ${theme.textAccent} mt-1`}>{teamInfo.description || '—'}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {teamPlayers.length === 0 ? (
                                            <p className={`text-sm ${theme.textMuted} text-center py-6`}>No players</p>
                                        ) : (
                                            teamPlayers.map((player) => (
                                                <div key={player.id} className="rounded-lg p-3 bg-[var(--background-secondary)] border border-white/5">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            {player.tags.includes('Confirmed') && (
                                                                <span className="w-2 h-2 rounded-full bg-green-500" title="Confirmed" />
                                                            )}
                                                            <span className="font-medium text-sm">{player.name}</span>
                                                            {(player.power || powerByName[player.name]) && (
                                                                <span className={`text-xs ${theme.textMuted}`}>
                                                                    {formatPower(player.power || powerByName[player.name])}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {isEditor && (
                                                            <div className="flex items-center gap-2">
                                                                <select value={player.team} onChange={(e) => movePlayer(player.id, Number(e.target.value))}
                                                                    className={`text-xs px-2 py-1 rounded border ${theme.input}`}>
                                                                    <option value={1}>Z1</option><option value={2}>Z2</option><option value={3}>Z3</option>
                                                                </select>
                                                                <button onClick={() => removePlayer(player.id)} className="text-red-500 hover:text-red-400 text-sm">✕</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {isEditor ? (
                                                            AVAILABLE_TAGS.map(tag => (
                                                                <button key={tag} onClick={() => togglePlayerTag(player.id, tag)}
                                                                    className={`px-2 py-0.5 rounded text-xs transition-colors ${player.tags.includes(tag) ? TAG_COLORS[tag] : theme.tag}`}>
                                                                    {tag}
                                                                </button>
                                                            ))
                                                        ) : (
                                                            player.tags.filter(tag => tag !== 'Confirmed').length > 0 ? player.tags.filter(tag => tag !== 'Confirmed').map(tag => (
                                                                <span key={tag} className={`px-2 py-0.5 rounded text-xs ${TAG_COLORS[tag]}`}>{tag}</span>
                                                            )) : <span className={`text-xs ${theme.textMuted}`}>No tags</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </section>
                            );
                        })}
                    </div>

                    {/* Substitutes Section */}
                    <section className={`${theme.card} border rounded-xl p-4 mt-6`}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className={`text-sm font-semibold uppercase tracking-wider ${theme.textMuted}`}>Substitutes</h2>
                            <span className={`text-xs ${theme.textMuted}`}>{substitutes.length} players</span>
                        </div>
                        {isEditor && (
                            <div className="flex gap-2 mb-4">
                                <input 
                                    type="text" 
                                    placeholder="Add substitute name..."
                                    className={`flex-1 px-3 py-2 rounded-lg border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff]`}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            const input = e.target as HTMLInputElement;
                                            if (input.value.trim()) {
                                                const newSub: Player = { id: Date.now(), name: input.value.trim(), team: 0, tags: [], power: 0, assignments: { phase1: "", phase2: "", phase3: "", phase4: "" } };
                                                const updatedSubs = [...substitutes, newSub];
                                                setSubstitutes(updatedSubs);
                                                saveData({ substitutes: updatedSubs });
                                                input.value = '';
                                            }
                                        }
                                    }}
                                />
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {substitutes.length === 0 ? (
                                <p className={`text-sm ${theme.textMuted}`}>No substitutes added</p>
                            ) : (
                                substitutes.map(sub => (
                                    <div key={sub.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
                                        <span className="text-sm">{sub.name}</span>
                                        {isEditor && (
                                            <button 
                                                onClick={() => {
                                                    const updatedSubs = substitutes.filter(s => s.id !== sub.id);
                                                    setSubstitutes(updatedSubs);
                                                    saveData({ substitutes: updatedSubs });
                                                }}
                                                className="text-red-500 hover:text-red-400 text-xs"
                                            >✕</button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    <footer className={`mt-8 pt-4 border-t ${theme.border} text-center`}>
                        <p className={`text-xs ${theme.textMuted}`}>Angmar • Rise of Kingdoms</p>
                        <p className={`text-[10px] ${theme.textMuted} mt-1 opacity-50`}>🥙 Kebab (BBQ) provides the snacks • Moon provides unsolicited advice</p>
                    </footer>
                </div>
            )}

        </div>
        </AppSidebar>
    );
}
