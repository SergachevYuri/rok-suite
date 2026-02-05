'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import dynamic from 'next/dynamic';
import type { MapAssignments, Player, Team, StrategyData as ImportedStrategyData, EventMode, AooTeam } from '@/lib/aoo-strategy/types';
import { defaultStrategyData } from '@/lib/aoo-strategy/strategy-data';
import { useAllianceRoster, formatPower, RosterMember } from '@/lib/supabase/use-alliance-roster';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/lib/supabase/auth-context';

// Dynamic import to avoid SSR issues with the map
const AOOInteractiveMap = dynamic(() => import('@/components/aoo-strategy/AOOInteractiveMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-5 h-5 border-2 border-[#4318ff] border-t-transparent rounded-full animate-spin"></div>
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

    // Zone size inputs for distribution
    const [zoneSizes, setZoneSizes] = useState<Record<number, string>>({ 1: '', 2: '', 3: '' });
    const [useCustomSizes, setUseCustomSizes] = useState(false);

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

    // Apply search filter
    const filteredRoster = searchTerm.trim()
        ? combinedRoster.filter(m =>
            m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            ('governorId' in m && m.governorId?.includes(searchTerm))
          )
        : combinedRoster;

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
        const toDistribute = confirmedPlayers.map(p => ({
            name: p.name,
            power: p.power || 0,
            kills: p.kills || killsByName[p.name] || 0,
        }));
        if (toDistribute.length < 3) {
            alert('Need at least 3 confirmed players to distribute');
            return;
        }

        let zones: Record<number, { name: string; power: number; kills: number }[]>;

        if (useCustomSizes) {
            // Use custom zone sizes
            const sizes = {
                1: parseInt(zoneSizes[1]) || 0,
                2: parseInt(zoneSizes[2]) || 0,
                3: parseInt(zoneSizes[3]) || 0,
            };
            const totalSize = sizes[1] + sizes[2] + sizes[3];
            if (totalSize === 0) {
                alert('Please enter at least one zone size');
                return;
            }
            zones = distributeByZoneSizes(toDistribute, sizes);
        } else {
            // Auto-balance by power
            zones = distributeByPowerWithKills(toDistribute);
        }

        // Add "maybe" players as substitutes (zone 0)
        const subs = maybePlayers.map(p => ({
            name: p.name,
            power: p.power || 0,
            kills: p.kills || killsByName[p.name] || 0,
        }));
        zones[0] = subs;

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
                    <div className={`p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs ${theme.text}`}>
                        <strong className="text-blue-400">How to use:</strong> Select your alliance, choose how many teams to organize (1-3), then mark players as <span className="text-green-400">Confirmed</span> (definitely playing) or <span className="text-yellow-400">Maybe</span> (might join). Click <strong>Distribute to Zones</strong> to auto-balance power across 3 zones.
                    </div>
                )}
                {builderStep === 'distribute' && (
                    <div className={`p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs ${theme.text}`}>
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

                        {/* Player list */}
                        <div className="max-h-[400px] overflow-y-auto space-y-1">
                            {filteredRoster.map((member) => {
                                const status = confirmations[member.name] || 'none';
                                const isPending = 'isPending' in member && member.isPending;
                                return (
                                    <button
                                        key={member.name}
                                        onClick={() => toggleConfirmation(member.name)}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                                            status === 'confirmed' ? 'bg-green-600/20 border border-green-500/30' :
                                            status === 'maybe' ? 'bg-yellow-600/20 border border-yellow-500/30' :
                                            isPending ? 'bg-blue-600/20 border border-blue-500/30 border-dashed' :
                                            'bg-[var(--background-secondary)] border border-[var(--border)] hover:bg-[var(--background-hover)]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                                                status === 'confirmed' ? 'bg-green-600 text-white' :
                                                status === 'maybe' ? 'bg-yellow-600 text-white' :
                                                'bg-white/20 text-white/50'
                                            }`}>
                                                {status === 'confirmed' ? '✓' : status === 'maybe' ? '?' : ''}
                                            </span>
                                            <span className={`font-medium ${theme.text}`}>{member.name}</span>
                                            {isPending && (
                                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-600 text-white">
                                                    NEW
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <span className={theme.textMuted} title="Power">
                                                {formatPower(member.power)}
                                            </span>
                                            <span className={`${theme.textMuted} text-xs`} title="Kill Points">
                                                KP: {formatPower(member.kills || killsByName[member.name] || 0)}
                                            </span>
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

                    {/* Zone Size Configuration */}
                    <section className={`${theme.card} border rounded-xl mb-6 p-4`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-sm font-medium ${theme.text}`}>Zone Distribution</h3>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={useCustomSizes}
                                    onChange={(e) => setUseCustomSizes(e.target.checked)}
                                    className="rounded"
                                />
                                <span className={`text-xs ${theme.textMuted}`}>Custom zone sizes</span>
                            </label>
                        </div>

                        {useCustomSizes ? (
                            <>
                                <p className={`text-xs ${theme.textMuted} mb-3`}>
                                    Enter how many players per zone. Players are assigned by power (highest first).
                                </p>
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    {[1, 2, 3].map((zone) => {
                                        const zoneColor = zone === 1 ? 'border-blue-500' : zone === 2 ? 'border-orange-500' : 'border-purple-500';
                                        return (
                                            <div key={zone} className={`p-3 rounded-lg border-2 ${zoneColor} bg-[var(--background-secondary)]`}>
                                                <label className={`text-xs ${theme.textMuted} block mb-1`}>
                                                    Zone {zone}
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={confirmedPlayers.length}
                                                    value={zoneSizes[zone]}
                                                    onChange={(e) => setZoneSizes({ ...zoneSizes, [zone]: e.target.value })}
                                                    placeholder="0"
                                                    className={`w-full px-3 py-2 rounded-lg text-center text-lg font-bold ${theme.input} border`}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className={`text-xs ${theme.textMuted} text-center mb-4`}>
                                    Total: {(parseInt(zoneSizes[1]) || 0) + (parseInt(zoneSizes[2]) || 0) + (parseInt(zoneSizes[3]) || 0)} / {confirmedPlayers.length} confirmed
                                </div>
                            </>
                        ) : (
                            <p className={`text-xs ${theme.textMuted} mb-4`}>
                                Players will be auto-distributed to balance power across zones.
                            </p>
                        )}

                        <div className="flex justify-center">
                            <button
                                onClick={handleDistribute}
                                disabled={confirmedPlayers.length < 3}
                                className={`px-6 py-3 rounded-lg font-medium text-white ${
                                    confirmedPlayers.length >= 3 ? 'bg-[#4318ff] hover:bg-[#4318ff]/80' : 'bg-gray-600 cursor-not-allowed'
                                }`}
                            >
                                Distribute {confirmedPlayers.length} Players to Zones →
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
    const [activeTab, setActiveTab] = useState<'map' | 'roster' | 'lookup' | 'builder'>('lookup');
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
    const [lookupSearch, setLookupSearch] = useState('');
    const [selectedLookupPlayer, setSelectedLookupPlayer] = useState<Player | null>(null);
    const [showLookupDropdown, setShowLookupDropdown] = useState(false);
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
                        <div className="w-5 h-5 border-2 border-[#4318ff] border-t-transparent rounded-full animate-spin"></div>
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

                    {/* Tabs - Find My Role first */}
                    <div className="flex items-center gap-2 mt-4 border-b border-[var(--border)] pb-0 overflow-x-auto hide-scrollbar">
                        <button
                            onClick={() => setActiveTab('lookup')}
                            className={`px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 border-b-2 -mb-[1px] ${
                                activeTab === 'lookup'
                                    ? 'text-[#4318ff] border-[#4318ff] bg-[#4318ff]/5'
                                    : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]'
                            }`}
                        >
                            🔍 Find My Role
                        </button>
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
                    <section className={`${theme.card} border-2 border-[#4318ff] rounded-xl mb-6 p-4`}>
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

            {/* Lookup Tab */}
            {activeTab === 'lookup' && (
                <div className="max-w-3xl mx-auto p-4 md:p-6">
                    {/* Key Instructions */}
                    <section className={`${theme.card} border-4 border-[#4318ff] rounded-xl p-6 mb-6`}>
                        <h2 className={`text-xl font-bold text-center mb-4 text-[#9f7aea]`}>⚔️ AoO Battle Guide</h2>

                        {/* Pre-battle checklist */}
                        <div className="p-4 rounded-lg bg-purple-500/10 border-2 border-purple-500 mb-4">
                            <h3 className="font-bold text-purple-400 mb-3">⏰ BEFORE THE BATTLE</h3>
                            <ul className={`space-y-2 text-sm ${theme.text}`}>
                                <li className="flex items-start gap-2">
                                    <span className="text-purple-400">1.</span>
                                    <span>Look up your name below to find your <strong>zone assignment</strong></span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-purple-400">2.</span>
                                    <span>Note your <strong>phase instructions</strong> (what to do at each stage)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-purple-400">3.</span>
                                    <span>Prepare your troops: <strong>Cavalry</strong> for rallies, <strong>Infantry</strong> for garrisons</span>
                                </li>
                            </ul>
                        </div>

                        {/* Important Rules */}
                        <div className="p-4 rounded-lg bg-[#4318ff]/10 border-2 border-[#4318ff] mb-4">
                            <h3 className="font-bold text-[#9f7aea] mb-3">📌 DURING THE BATTLE</h3>
                            <ul className={`space-y-2 ${theme.text}`}>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#9f7aea] font-bold">1.</span>
                                    <span><strong>Stay in your assigned lane/zone.</strong> Do not wander.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#9f7aea] font-bold">2.</span>
                                    <span><strong>Rush to your obelisk first.</strong> Rally leaders teleport first.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#9f7aea] font-bold">3.</span>
                                    <span><strong>Fully occupy + garrison before moving to next building.</strong></span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#9f7aea] font-bold">4.</span>
                                    <span><strong>Only rally buildings the enemy has occupied.</strong></span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#9f7aea] font-bold">5.</span>
                                    <span><strong>Work together as a unit.</strong> Follow your zone leader.</span>
                                </li>
                            </ul>
                        </div>

                        {/* Troop Deployment */}
                        <div className="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
                            <h3 className={`font-bold ${theme.textMuted} mb-3`}>🎯 TROOP DEPLOYMENT</h3>
                            <div className="grid grid-cols-3 gap-3 text-center text-sm">
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                                    <div className="text-2xl mb-1">🐴</div>
                                    <div className="font-bold text-red-500">Cavalry</div>
                                    <div className={`text-xs ${theme.textMuted}`}>Join rallies</div>
                                </div>
                                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                                    <div className="text-2xl mb-1">🛡️</div>
                                    <div className="font-bold text-blue-500">Infantry</div>
                                    <div className={`text-xs ${theme.textMuted}`}>Garrison buildings</div>
                                </div>
                                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                                    <div className="text-2xl mb-1">🌾</div>
                                    <div className="font-bold text-yellow-500">Other</div>
                                    <div className={`text-xs ${theme.textMuted}`}>Gather tiles</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Player Lookup */}
                    <section className={`${theme.card} border rounded-xl p-6`}>
                        <h2 className={`text-xl font-semibold mb-4 text-center`}>🔍 Find Your Role</h2>
                        <p className={`text-sm ${theme.textMuted} text-center mb-6`}>Enter your in-game name to see your assignments for each phase</p>

                        <div className="relative">
                            <input
                                type="text"
                                value={lookupSearch}
                                onChange={(e) => {
                                    setLookupSearch(e.target.value);
                                    setSelectedLookupPlayer(null);
                                    setShowLookupDropdown(true);
                                }}
                                onFocus={() => setShowLookupDropdown(true)}
                                placeholder="Enter your name..."
                                className={`w-full px-4 py-3 rounded-lg border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff] text-lg text-center`}
                            />

                            {/* Dropdown with matching players */}
                            {showLookupDropdown && lookupSearch.trim() && !selectedLookupPlayer && (() => {
                                const searchLower = lookupSearch.toLowerCase().trim();
                                const matchingPlayers = players.filter(p => p.name.toLowerCase().includes(searchLower));
                                const matchingSubs = substitutes.filter(s => s.name.toLowerCase().includes(searchLower));
                                const allMatches = [...matchingPlayers, ...matchingSubs];

                                if (allMatches.length === 0) return null;

                                return (
                                    <div className={`absolute z-50 w-full mt-1 rounded-lg border ${theme.card} shadow-xl max-h-60 overflow-y-auto`}>
                                        {matchingPlayers.map(player => {
                                            const zoneColors: Record<number, string> = {
                                                1: 'text-blue-500',
                                                2: 'text-orange-500',
                                                3: 'text-purple-500'
                                            };
                                            return (
                                                <button
                                                    key={player.id}
                                                    onClick={() => {
                                                        setSelectedLookupPlayer(player);
                                                        setLookupSearch(player.name);
                                                        setShowLookupDropdown(false);
                                                    }}
                                                    className={`w-full px-4 py-3 text-left hover:bg-[var(--background-hover)] flex items-center justify-between border-b ${theme.border}`}
                                                >
                                                    <span className={`font-medium ${theme.text}`}>{player.name}</span>
                                                    <span className={`text-sm ${zoneColors[player.team]}`}>Zone {player.team}</span>
                                                </button>
                                            );
                                        })}
                                        {matchingSubs.map(sub => (
                                            <button
                                                key={sub.id}
                                                onClick={() => {
                                                    setLookupSearch(sub.name);
                                                    setShowLookupDropdown(false);
                                                }}
                                                className={`w-full px-4 py-3 text-left hover:bg-[var(--background-hover)] flex items-center justify-between border-b ${theme.border}`}
                                            >
                                                <span className={`font-medium ${theme.text}`}>{sub.name}</span>
                                                <span className={`text-sm ${theme.textMuted}`}>Substitute</span>
                                            </button>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        {(selectedLookupPlayer || (lookupSearch.trim() && !showLookupDropdown)) && (() => {
                            const searchLower = lookupSearch.toLowerCase().trim();
                            const foundPlayer = selectedLookupPlayer || players.find(p => p.name.toLowerCase() === searchLower) || players.find(p => p.name.toLowerCase().includes(searchLower));
                            const foundSub = substitutes.find(s => s.name.toLowerCase().includes(searchLower));
                            
                            if (foundPlayer) {
                                const teamInfo = teams[foundPlayer.team - 1];
                                const playerPower = foundPlayer.power || powerByName[foundPlayer.name];
                                const zoneColors: Record<number, string> = {
                                    1: 'text-blue-500',
                                    2: 'text-orange-500',
                                    3: 'text-purple-500'
                                };
                                const zoneBgColors: Record<number, string> = {
                                    1: 'bg-blue-500/10 border-blue-500/30',
                                    2: 'bg-orange-500/10 border-orange-500/30',
                                    3: 'bg-purple-500/10 border-purple-500/30'
                                };
                                return (
                                    <div className="mt-6 p-6 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)]">
                                        {/* Print Button */}
                                        <div className="flex justify-end mb-4">
                                            <button
                                                onClick={() => window.print()}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium ${theme.buttonPrimary} flex items-center gap-2`}
                                            >
                                                🖨️ Print Quick Reference
                                            </button>
                                        </div>

                                        {/* Player header */}
                                        <div className="text-center mb-6">
                                            <h3 className={`text-2xl md:text-3xl font-bold ${zoneColors[foundPlayer.team]}`}>{foundPlayer.name}</h3>
                                            {playerPower && (
                                                <p className={`text-sm ${theme.textMuted}`}>⚔️ {formatPower(playerPower)} Power</p>
                                            )}
                                            <p className={`text-lg md:text-xl font-semibold mt-1 ${zoneColors[foundPlayer.team]}`}>
                                                {teamInfo?.name || `Zone ${foundPlayer.team}`}
                                                {teamInfo?.description && <span className={theme.textMuted}> • {teamInfo.description}</span>}
                                            </p>
                                        </div>
                                        
                                        {/* Role tags */}
                                        {foundPlayer.tags.length > 0 && (
                                            <div className="mb-6 text-center">
                                                <div className="flex flex-wrap gap-2 justify-center">
                                                    {foundPlayer.tags.map(tag => (
                                                        <span key={tag} className={`px-3 py-1.5 rounded-full text-sm font-medium ${TAG_COLORS[tag]}`}>{tag}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Phase-by-phase assignments - ENHANCED */}
                                        {foundPlayer.assignments && (
                                            <div className={`p-6 rounded-xl border-4 ${zoneBgColors[foundPlayer.team]} mb-6`}>
                                                <h4 className={`text-lg font-bold uppercase tracking-wider mb-6 text-center ${zoneColors[foundPlayer.team]}`}>
                                                    📋 YOUR BATTLE PLAN
                                                </h4>
                                                <div className="grid gap-4">
                                                    <div className="p-4 rounded-xl bg-[rgba(6,11,40,0.94)] border-4 border-yellow-500 shadow-lg">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-3xl">🏃</span>
                                                                <div>
                                                                    <div className="text-yellow-500 font-bold text-lg">PHASE 1</div>
                                                                    <div className={`text-xs ${theme.textMuted}`}>RUSH • 0:00</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <p className={`font-semibold text-base ${theme.text}`}>{foundPlayer.assignments.phase1}</p>
                                                    </div>
                                                    <div className="p-4 rounded-xl bg-[rgba(6,11,40,0.94)] border-4 border-yellow-600 shadow-lg">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-3xl">📍</span>
                                                                <div>
                                                                    <div className="text-yellow-600 font-bold text-lg">PHASE 2</div>
                                                                    <div className={`text-xs ${theme.textMuted}`}>SECURE • ~5:00</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <p className={`font-semibold text-base ${theme.text}`}>{foundPlayer.assignments.phase2}</p>
                                                    </div>
                                                    <div className="p-4 rounded-xl bg-[rgba(6,11,40,0.94)] border-4 border-orange-500 shadow-lg">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-3xl">⚔️</span>
                                                                <div>
                                                                    <div className="text-orange-500 font-bold text-lg">PHASE 3</div>
                                                                    <div className={`text-xs ${theme.textMuted}`}>EXPAND • ~15:00</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <p className={`font-semibold text-base ${theme.text}`}>{foundPlayer.assignments.phase3}</p>
                                                    </div>
                                                    <div className="p-4 rounded-xl bg-[rgba(6,11,40,0.94)] border-4 border-red-500 shadow-lg">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-3xl">💥</span>
                                                                <div>
                                                                    <div className="text-red-500 font-bold text-lg">PHASE 4</div>
                                                                    <div className={`text-xs ${theme.textMuted}`}>CONTEST • ~45:00</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <p className={`font-semibold text-base ${theme.text}`}>{foundPlayer.assignments.phase4}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Mini Map showing assigned buildings */}
                                        <div className="mt-4 p-4 rounded-lg bg-[rgba(6,11,40,0.94)] border border-[var(--border)]">
                                            <h4 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${theme.textMuted}`}>🗺️ Your Buildings</h4>
                                            <div className="relative w-full rounded-lg overflow-hidden" style={{ aspectRatio: '1275 / 891' }}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src="/aoo-strategy/aoo-map.jpg"
                                                    alt="AOO Map"
                                                    className="absolute inset-0 w-full h-full object-cover"
                                                    style={{ opacity: 0.6 }}
                                                />
                                                {/* Highlight assigned buildings */}
                                                {foundPlayer.assignments && (() => {
                                                    const buildingPositions: Record<string, {x: number, y: number, name: string}> = {
                                                        'obelisk (upper)': {x: 50, y: 12, name: 'Obelisk (Upper)'},
                                                        'obelisk (left)': {x: 10, y: 40, name: 'Obelisk (Left)'},
                                                        'obelisk (right)': {x: 90, y: 40, name: 'Obelisk (Right)'},
                                                        'obelisk (lower)': {x: 42, y: 78, name: 'Obelisk (Lower)'},
                                                        'outpost of iset 1': {x: 35, y: 15, name: 'Iset 1'},
                                                        'outpost of iset 2': {x: 15, y: 24, name: 'Iset 2'},
                                                        'outpost of iset 3': {x: 35, y: 28, name: 'Iset 3'},
                                                        'outpost of seth 1': {x: 65, y: 60, name: 'Seth 1'},
                                                        'outpost of seth 2': {x: 85, y: 60, name: 'Seth 2'},
                                                        'outpost of seth 3': {x: 65, y: 73, name: 'Seth 3'},
                                                        'shrine of war (left)': {x: 28, y: 46, name: 'War-L'},
                                                        'shrine of war (right)': {x: 72, y: 38, name: 'War-R'},
                                                        'shrine of life (right)': {x: 72, y: 18, name: 'Life-R'},
                                                        'shrine of life (left)': {x: 22, y: 73, name: 'Life-L'},
                                                        'desert altar (right)': {x: 55, y: 28, name: 'Des-R'},
                                                        'desert altar (left)': {x: 42, y: 60, name: 'Des-L'},
                                                        'sky altar (right)': {x: 88, y: 25, name: 'Sky-R'},
                                                        'sky altar (left)': {x: 10, y: 58, name: 'Sky-L'},
                                                        'ark': {x: 48, y: 43, name: 'Ark'},
                                                    };
                                                    
                                                    const allAssignments = Object.values(foundPlayer.assignments).join(' ').toLowerCase();
                                                    const assignedBuildings = Object.entries(buildingPositions).filter(([key]) => 
                                                        allAssignments.includes(key)
                                                    );
                                                    
                                                    const zoneMarkerColors: Record<number, string> = {
                                                        1: '#2563EB',
                                                        2: '#D97706', 
                                                        3: '#7C3AED'
                                                    };
                                                    
                                                    return assignedBuildings.map(([key, pos]) => (
                                                        <div
                                                            key={key}
                                                            className="absolute flex flex-col items-center"
                                                            style={{
                                                                left: `${pos.x}%`,
                                                                top: `${pos.y}%`,
                                                                transform: 'translate(-50%, -50%)',
                                                            }}
                                                        >
                                                            <div 
                                                                className="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-pulse"
                                                                style={{ backgroundColor: zoneMarkerColors[foundPlayer.team] }}
                                                            >
                                                                <span className="text-white text-[8px] font-bold">★</span>
                                                            </div>
                                                            <span className="text-[8px] font-bold text-white bg-black/70 px-1 rounded mt-0.5">{pos.name}</span>
                                                        </div>
                                                    ));
                                                })()}
                                                {/* START marker */}
                                                <div
                                                    className="absolute px-1.5 py-0.5 rounded bg-[#4318ff] text-white text-[8px] font-bold"
                                                    style={{ left: '12%', top: '6%', transform: 'translate(-50%, -50%)' }}
                                                >
                                                    START
                                                </div>
                                            </div>
                                            <p className={`text-xs ${theme.textMuted} mt-2 text-center`}>
                                                ★ = Your assigned buildings across all phases
                                            </p>
                                        </div>

                                        {/* Role instructions */}
                                        <div className="mt-4 p-4 rounded-lg bg-[rgba(6,11,40,0.94)] border border-[var(--border)]">
                                            <h4 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${theme.textMuted}`}>💡 Role Tips</h4>
                                            <ul className={`space-y-2 text-sm ${theme.text}`}>
                                                {foundPlayer.tags.includes('Rally Leader') && (
                                                    <li>🎯 <strong>Rally Leader:</strong> Use strongest commanders (Guan Yu, Martel, YSG). Start rallies early!</li>
                                                )}
                                                {foundPlayer.tags.includes('Teleport 1st') && (
                                                    <li>⚡ <strong>Teleport 1st:</strong> You are Fluffy, Sysstm, or Suntzu. Teleport IMMEDIATELY!</li>
                                                )}
                                                {foundPlayer.tags.includes('Hold Obelisks') && (
                                                    <li>🏰 <strong>Hold Obelisks:</strong> Send 1 troop to EACH Obelisk 3&4. Once first wave TPs, join rallies!</li>
                                                )}
                                                {foundPlayer.tags.includes('Garrison') && (
                                                    <li>🛡️ <strong>Garrison:</strong> Use infantry commanders. Stay in buildings to defend!</li>
                                                )}
                                                {foundPlayer.tags.includes('Farm') && (
                                                    <>
                                                        <li>🌾 <strong>Farm:</strong> Gather constantly from start to finish!</li>
                                                        <li>📍 <strong>Where:</strong> Start near your zone&apos;s obelisk, move to resource nodes near captured buildings</li>
                                                        <li>💰 <strong>Points:</strong> Can earn 13,000+ points - almost as much as 4 Ark captures!</li>
                                                        <li>⚠️ <strong>Safety:</strong> Stay in friendly territory, avoid enemy marches</li>
                                                    </>
                                                )}
                                                {foundPlayer.tags.includes('Conquer') && (
                                                    <li>🏃 <strong>Conquer:</strong> Use T1 cavalry for speed. Capture undefended buildings fast!</li>
                                                )}
                                            </ul>
                                        </div>

                                        {/* March Deployment Guide */}
                                        <div className="mt-4 p-4 rounded-lg bg-[rgba(6,11,40,0.94)] border border-[var(--border)]">
                                            <h4 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${theme.textMuted}`}>🎖️ March Deployment</h4>
                                            <div className={`space-y-3 text-sm ${theme.text}`}>
                                                <div className="p-2 rounded bg-[var(--background-secondary)]">
                                                    <p className="font-medium mb-1">Recommended: 3 Marches</p>
                                                    <ul className={`text-xs ${theme.textMuted} space-y-1`}>
                                                        <li>• <strong>March 1:</strong> In a building (garrison/obelisk)</li>
                                                        <li>• <strong>March 2:</strong> In another building or rally</li>
                                                        <li>• <strong>March 3:</strong> Mobile - support rallies or Ark</li>
                                                    </ul>
                                                </div>
                                                {foundPlayer.tags.includes('Rally Leader') && (
                                                    <div className="p-2 rounded border-l-2 border-red-500 bg-red-500/10">
                                                        <p className="font-medium text-red-500">Rally Leader Marches:</p>
                                                        <ul className={`text-xs ${theme.textMuted}`}>
                                                            <li>• Lead rally with your strongest march</li>
                                                            <li>• Keep 1-2 marches for garrison backup</li>
                                                        </ul>
                                                    </div>
                                                )}
                                                {foundPlayer.tags.includes('Garrison') && (
                                                    <div className="p-2 rounded border-l-2 border-orange-500 bg-orange-500/10">
                                                        <p className="font-medium text-orange-500">Garrison Marches:</p>
                                                        <ul className={`text-xs ${theme.textMuted}`}>
                                                            <li>• Keep marches IN buildings at all times</li>
                                                            <li>• Use infantry for better defense</li>
                                                            <li>• Switch buildings as we capture more</li>
                                                        </ul>
                                                    </div>
                                                )}
                                                {foundPlayer.tags.includes('Conquer') && (
                                                    <div className="p-2 rounded border-l-2 border-purple-500 bg-purple-500/10">
                                                        <p className="font-medium text-purple-500">Conquer Marches:</p>
                                                        <ul className={`text-xs ${theme.textMuted}`}>
                                                            <li>• March 1: T1 cavalry (fastest) for captures</li>
                                                            <li>• March 2-3: Support or fill rallies</li>
                                                        </ul>
                                                    </div>
                                                )}
                                                {foundPlayer.tags.includes('Farm') && (
                                                    <div className="p-2 rounded border-l-2 border-yellow-500 bg-yellow-500/10">
                                                        <p className="font-medium text-yellow-600">Farmer Marches:</p>
                                                        <ul className={`text-xs ${theme.textMuted}`}>
                                                            <li>• All 5 marches gathering resources</li>
                                                            <li>• Spread across multiple nodes</li>
                                                            <li>• Don&apos;t return home - go node to node</li>
                                                        </ul>
                                                    </div>
                                                )}
                                                {foundPlayer.tags.includes('Teleport 1st') && (
                                                    <div className="p-2 rounded border-l-2 border-blue-500 bg-blue-500/10">
                                                        <p className="font-medium text-blue-500">Teleport Marches:</p>
                                                        <ul className={`text-xs ${theme.textMuted}`}>
                                                            <li>• Before teleport: All troops in city OR in buildings</li>
                                                            <li>• After teleport: Rally altars &amp; fill rallies</li>
                                                        </ul>
                                                    </div>
                                                )}
                                                {foundPlayer.tags.includes('Hold Obelisks') && (
                                                    <div className="p-2 rounded border-l-2 border-cyan-500 bg-cyan-500/10">
                                                        <p className="font-medium text-cyan-500">Hold Strategy:</p>
                                                        <ul className={`text-xs ${theme.textMuted}`}>
                                                            <li>• Send 1 troop (any type) to Obelisk 3</li>
                                                            <li>• Send 1 troop (any type) to Obelisk 4</li>
                                                            <li>• Once Fluffy/Sysstm/Suntzu TP, join rallies!</li>
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            } else if (foundSub) {
                                const subPower = foundSub.power || powerByName[foundSub.name];
                                return (
                                    <div className="mt-6 p-6 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-center">
                                        <h3 className="text-2xl font-bold text-yellow-500">{foundSub.name}</h3>
                                        {subPower && (
                                            <p className={`text-sm ${theme.textMuted}`}>⚔️ {formatPower(subPower)} Power</p>
                                        )}
                                        <p className={`text-lg ${theme.textMuted} mt-2`}>📋 Substitute</p>
                                        <div className="mt-4 p-4 rounded-lg bg-[rgba(6,11,40,0.94)] border border-[var(--border)]">
                                            <p className={theme.text}>You are on the substitute list.</p>
                                            <p className={`mt-2 text-sm ${theme.textMuted}`}>Be ready to join if a spot opens up! Make sure you:</p>
                                            <ul className={`mt-2 text-sm ${theme.textMuted} text-left max-w-xs mx-auto`}>
                                                <li>• Clear your hospital before battle</li>
                                                <li>• Have troops ready in your city</li>
                                                <li>• Stay available on Discord</li>
                                            </ul>
                                        </div>
                                    </div>
                                );
                            } else {
                                return (
                                    <div className="mt-6 p-6 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-center">
                                        <p className={`text-lg ${theme.textMuted}`}>❌ Player not found</p>
                                        <p className={`mt-2 text-sm ${theme.textMuted}`}>Try checking the Zone Roster tab or contact your alliance leader.</p>
                                    </div>
                                );
                            }
                        })()}
                    </section>

                    <footer className={`mt-8 pt-4 border-t ${theme.border} text-center`}>
                        <p className={`text-xs ${theme.textMuted}`}>Angmar • Rise of Kingdoms</p>
                        <p className={`text-[10px] ${theme.textMuted} mt-1 opacity-50`}>Led by Fluffy • Suntzu is charming the enemy (again)</p>
                    </footer>
                </div>
            )}

        </div>
        </AppSidebar>
    );
}
