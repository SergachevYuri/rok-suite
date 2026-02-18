'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import dynamic from 'next/dynamic';
import type { MapAssignments, Player, Team, StrategyData as ImportedStrategyData, EventMode, AooTeam } from '@/lib/aoo-strategy/types';
import { defaultStrategyData } from '@/lib/aoo-strategy/strategy-data';
import { useScanRoster, formatPower, RosterMember } from '@/lib/supabase/use-alliance-roster';
import { getAllMemberStats, MemberEventStats } from '@/lib/supabase/use-event-participation';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/lib/supabase/auth-context';
import { Swords, Plus, Link as LinkIcon, Copy, Check } from 'lucide-react';
import { allianceDisplay } from '@/lib/alliances';
import { matchesSearch as matchesSearchUtil } from '@/lib/search';

// Generate a random 8-character share ID
function generateShareId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

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

// Team number type
type TeamNumber = 1 | 2 | 3;

// Per-team state types
type ConfirmationsByTeam = Record<TeamNumber, Record<string, ConfirmationStatus>>;
type ZonesByTeam = Record<TeamNumber, Record<number, { name: string; power: number; kills: number }[]>>;
type RallyLeadsByTeam = Record<TeamNumber, Record<number, string>>;
type TeleportFirstByTeam = Record<TeamNumber, Set<string>>;
type ZoneSizesByTeam = Record<TeamNumber, Record<number, string>>;

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
    teamCount: TeamNumber;
    setTeamCount: (c: TeamNumber) => void;
    activeTeam: TeamNumber;
    setActiveTeam: (t: TeamNumber) => void;
    // Per-team state
    confirmationsByTeam: ConfirmationsByTeam;
    setConfirmationsByTeam: (c: ConfirmationsByTeam) => void;
    builderStep: 'select' | 'distribute' | 'leads' | 'done';
    setBuilderStep: (s: 'select' | 'distribute' | 'leads' | 'done') => void;
    suggestedZonesByTeam: ZonesByTeam;
    setSuggestedZonesByTeam: (z: ZonesByTeam) => void;
    selectedRallyLeadsByTeam: RallyLeadsByTeam;
    setSelectedRallyLeadsByTeam: (r: RallyLeadsByTeam) => void;
    selectedTeleportFirstByTeam: TeleportFirstByTeam;
    setSelectedTeleportFirstByTeam: (t: TeleportFirstByTeam) => void;
    zoneSizesByTeam: ZoneSizesByTeam;
    setZoneSizesByTeam: (z: ZoneSizesByTeam) => void;
    pendingAdditions: PendingMember[];
    setPendingAdditions: (p: PendingMember[]) => void;
    onApply: (allTeamData: Record<TeamNumber, { zones: Record<number, { name: string; power: number; kills: number }[]>; rallyLeads: Record<number, string>; teleportFirst: Set<string>; substitutes: { name: string; power: number; kills: number }[] }>) => void;
    onSavePendingAdditions: (additions: PendingMember[]) => Promise<void>;
    theme: Record<string, string>;
    formatPower: (p: number | null | undefined) => string;
    user: { id: string } | null;
    scanLabel: string | null;
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
    confirmationsByTeam,
    setConfirmationsByTeam,
    builderStep,
    setBuilderStep,
    suggestedZonesByTeam,
    setSuggestedZonesByTeam,
    selectedRallyLeadsByTeam,
    setSelectedRallyLeadsByTeam,
    selectedTeleportFirstByTeam,
    setSelectedTeleportFirstByTeam,
    zoneSizesByTeam,
    setZoneSizesByTeam,
    pendingAdditions,
    setPendingAdditions,
    onApply,
    onSavePendingAdditions,
    theme,
    formatPower,
    user,
    scanLabel,
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
    const [useCustomSizes, setUseCustomSizes] = useState(true); // Default to custom sizes
    const [copiedSummary, setCopiedSummary] = useState(false);

    // Generate exportable summary text for all teams (no emojis for in-game compatibility)
    const generateSummary = () => {
        const lines: string[] = [];
        lines.push('=========================================');
        lines.push('         AoO TEAM ASSIGNMENTS');
        lines.push('=========================================');
        lines.push('');

        for (const team of [1, 2, 3] as TeamNumber[]) {
            if (team > teamCount) continue;

            const zones = suggestedZonesByTeam[team] || {};
            const rallyLeads = selectedRallyLeadsByTeam[team] || {};
            const teleportFirst = selectedTeleportFirstByTeam[team] || new Set<string>();

            // Check if this team has any players
            const totalPlayers = (zones[1]?.length || 0) + (zones[2]?.length || 0) + (zones[3]?.length || 0);
            if (totalPlayers === 0) continue;

            lines.push(`>> TEAM ${team}`);
            lines.push('-----------------------------------------');

            for (const zoneNum of [1, 2, 3]) {
                const zonePlayers = zones[zoneNum] || [];
                if (zonePlayers.length === 0) continue;

                const zoneName = zoneNum === 1 ? 'Zone 1 (Ark)' : zoneNum === 2 ? 'Zone 2 (Upper)' : 'Zone 3 (Lower)';
                lines.push(`\n[${zoneName}] - ${zonePlayers.length} players`);

                // Sort by power descending
                const sorted = [...zonePlayers].sort((a, b) => b.power - a.power);
                for (const p of sorted) {
                    const isLead = rallyLeads[zoneNum] === p.name;
                    const isTeleport = teleportFirst.has(p.name);
                    const badges = [];
                    if (isLead) badges.push('Rally Lead');
                    if (isTeleport) badges.push('TP First');
                    const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';
                    lines.push(`  - ${p.name} (${formatPower(p.power)})${badgeStr}`);
                }
            }

            // Substitutes
            const subs = zones[0] || [];
            if (subs.length > 0) {
                lines.push(`\n[Substitutes] - ${subs.length}`);
                for (const p of subs) {
                    lines.push(`  - ${p.name} (${formatPower(p.power)})`);
                }
            }

            lines.push('');
        }

        lines.push('=========================================');

        return lines.join('\n');
    };

    // Copy summary to clipboard
    const copySummaryToClipboard = async () => {
        try {
            const summary = generateSummary();
            await navigator.clipboard.writeText(summary);
            setCopiedSummary(true);
            setTimeout(() => setCopiedSummary(false), 2000);
        } catch {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = generateSummary();
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopiedSummary(true);
            setTimeout(() => setCopiedSummary(false), 2000);
        }
    };

    // Helper to get a player's team assignment
    const getPlayerTeamAssignment = (name: string): { team: TeamNumber; status: ConfirmationStatus } | null => {
        for (const team of [1, 2, 3] as TeamNumber[]) {
            const status = confirmationsByTeam[team]?.[name];
            if (status && status !== 'none') {
                return { team, status };
            }
        }
        return null;
    };

    // Get player's overall status for filtering (confirmed/maybe/none across any team)
    const getPlayerOverallStatus = (name: string): ConfirmationStatus => {
        const assignment = getPlayerTeamAssignment(name);
        return assignment?.status || 'none';
    };

    // Set player's team assignment (clears from other teams)
    const setPlayerTeamAssignment = (name: string, team: TeamNumber, status: ConfirmationStatus) => {
        const newConfirmations = { ...confirmationsByTeam };
        // Clear from all teams first
        for (const t of [1, 2, 3] as TeamNumber[]) {
            if (newConfirmations[t]?.[name]) {
                newConfirmations[t] = { ...newConfirmations[t] };
                delete newConfirmations[t][name];
            }
        }
        // Set on the specified team if not 'none'
        if (status !== 'none') {
            newConfirmations[team] = { ...newConfirmations[team], [name]: status };
        }
        setConfirmationsByTeam(newConfirmations);
    };

    // Current team's data (for distribute step)
    const currentTeamConfirmations = confirmationsByTeam[activeTeam] || {};
    const suggestedZones = suggestedZonesByTeam[activeTeam] || {};
    const selectedRallyLeads = selectedRallyLeadsByTeam[activeTeam] || {};
    const selectedTeleportFirst = selectedTeleportFirstByTeam[activeTeam] || new Set<string>();
    const zoneSizes = zoneSizesByTeam[activeTeam] || { 0: '', 1: '', 2: '', 3: '' };

    // Setters for current team
    const setSuggestedZones = (zones: Record<number, { name: string; power: number; kills: number }[]>) => {
        setSuggestedZonesByTeam({ ...suggestedZonesByTeam, [activeTeam]: zones });
    };
    const setSelectedRallyLeads = (leads: Record<number, string>) => {
        setSelectedRallyLeadsByTeam({ ...selectedRallyLeadsByTeam, [activeTeam]: leads });
    };
    const setSelectedTeleportFirst = (first: Set<string>) => {
        setSelectedTeleportFirstByTeam({ ...selectedTeleportFirstByTeam, [activeTeam]: first });
    };
    const setZoneSizes = (sizes: Record<number, string>) => {
        setZoneSizesByTeam({ ...zoneSizesByTeam, [activeTeam]: sizes });
    };

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
                if (!matchesSearchUtil(searchTerm, m.name, 'governorId' in m && m.governorId ? parseInt(m.governorId) : null)) return false;
            }
            // Confirmation status filter (across all teams)
            if (builderFilter !== 'all') {
                const status = getPlayerOverallStatus(m.name);
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

        // Auto-confirm the new member on team 1
        setPlayerTeamAssignment(newMember.name, 1, 'confirmed');
    };

    // Count confirmations for CURRENT team (used in distribute step)
    const confirmedPlayers = combinedRoster.filter(m => currentTeamConfirmations[m.name] === 'confirmed');
    const maybePlayers = combinedRoster.filter(m => currentTeamConfirmations[m.name] === 'maybe');
    const confirmedPower = confirmedPlayers.reduce((sum: number, p) => sum + (p.power || 0), 0);
    const maybePower = maybePlayers.reduce((sum: number, p) => sum + (p.power || 0), 0);

    // Count per team (for display in select step)
    const getTeamCounts = (team: TeamNumber) => {
        const teamConf = confirmationsByTeam[team] || {};
        const confirmed = combinedRoster.filter(m => teamConf[m.name] === 'confirmed').length;
        const maybe = combinedRoster.filter(m => teamConf[m.name] === 'maybe').length;
        return { confirmed, maybe, total: confirmed + maybe };
    };

    // Auto-calculate zone sizes when player count changes (for current team)
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
    }, [confirmedPlayers.length, maybePlayers.length, activeTeam]);

    // Toggle confirmation status for a specific team
    const toggleTeamConfirmation = (name: string, team: TeamNumber) => {
        const teamConf = confirmationsByTeam[team] || {};
        const current = teamConf[name] || 'none';
        // Cycle: none -> confirmed -> maybe -> none
        const next: ConfirmationStatus = current === 'none' ? 'confirmed' : current === 'confirmed' ? 'maybe' : 'none';
        setPlayerTeamAssignment(name, team, next);
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

    // Handle distribute button - processes ALL teams at once
    const handleDistribute = () => {
        // Process each team from 1 to teamCount
        const newZonesByTeam: ZonesByTeam = { 1: {}, 2: {}, 3: {} };
        const newRallyLeadsByTeam: RallyLeadsByTeam = { 1: {}, 2: {}, 3: {} };
        const newTeleportFirstByTeam: TeleportFirstByTeam = { 1: new Set(), 2: new Set(), 3: new Set() };

        let totalPlayers = 0;

        for (const team of [1, 2, 3] as TeamNumber[]) {
            if (team > teamCount) continue;

            const teamConf = confirmationsByTeam[team] || {};
            const teamConfirmedPlayers = combinedRoster.filter(m => teamConf[m.name] === 'confirmed');
            const teamMaybePlayers = combinedRoster.filter(m => teamConf[m.name] === 'maybe');

            const confirmedList = teamConfirmedPlayers.map(p => ({
                name: p.name,
                power: p.power || 0,
                kills: p.kills || killsByName[p.name] || 0,
            }));
            const maybeList = teamMaybePlayers.map(p => ({
                name: p.name,
                power: p.power || 0,
                kills: p.kills || killsByName[p.name] || 0,
            }));

            totalPlayers += confirmedList.length + maybeList.length;

            if (confirmedList.length + maybeList.length < 1) {
                // No players for this team, skip
                newZonesByTeam[team] = { 0: [], 1: [], 2: [], 3: [] };
                continue;
            }

            let zones: Record<number, { name: string; power: number; kills: number }[]>;
            const teamZoneSizes = zoneSizesByTeam[team] || { 0: '', 1: '', 2: '', 3: '' };

            if (useCustomSizes) {
                // Use custom zone sizes (including subs as zone 0)
                const sizes = {
                    1: parseInt(teamZoneSizes[1]) || 0,
                    2: parseInt(teamZoneSizes[2]) || 0,
                    3: parseInt(teamZoneSizes[3]) || 0,
                };
                const subsSize = parseInt(teamZoneSizes[0]) || 0;
                const totalSize = sizes[1] + sizes[2] + sizes[3] + subsSize;

                if (totalSize === 0) {
                    // Fall back to auto-balance if no sizes set
                    const allPlayers = [...confirmedList, ...maybeList];
                    zones = distributeByPowerWithKills(allPlayers);
                    zones[0] = [];
                } else {
                    // First, distribute CONFIRMED players to zones 1-3 (power balanced)
                    zones = distributeByZoneSizes(confirmedList, sizes);

                    // Calculate remaining slots in each zone
                    const remainingSlots = {
                        1: sizes[1] - zones[1].length,
                        2: sizes[2] - zones[2].length,
                        3: sizes[3] - zones[3].length,
                    };
                    const totalRemainingSlots = remainingSlots[1] + remainingSlots[2] + remainingSlots[3];

                    // Maybe players go to subs first, overflow fills remaining zone slots
                    const sortedMaybe = [...maybeList].sort((a, b) => b.power - a.power);

                    if (totalRemainingSlots > 0 && sortedMaybe.length > subsSize) {
                        const forZones = sortedMaybe.slice(0, sortedMaybe.length - subsSize);
                        const forSubs = sortedMaybe.slice(sortedMaybe.length - subsSize);
                        const extraZones = distributeByZoneSizes(forZones, remainingSlots);
                        zones[1].push(...extraZones[1]);
                        zones[2].push(...extraZones[2]);
                        zones[3].push(...extraZones[3]);
                        zones[0] = forSubs;
                    } else {
                        zones[0] = sortedMaybe.slice(0, subsSize > 0 ? subsSize : sortedMaybe.length);
                    }

                    // Any unassigned confirmed players also go to subs
                    const assignedNames = new Set([
                        ...zones[1].map(p => p.name),
                        ...zones[2].map(p => p.name),
                        ...zones[3].map(p => p.name),
                        ...zones[0].map(p => p.name),
                    ]);
                    const unassignedConfirmed = confirmedList.filter(p => !assignedNames.has(p.name));
                    zones[0].push(...unassignedConfirmed);
                }
            } else {
                // Auto-balance by power (equal distribution) - include all players
                const allPlayers = [...confirmedList, ...maybeList];
                zones = distributeByPowerWithKills(allPlayers);
                zones[0] = []; // No subs in auto mode
            }

            newZonesByTeam[team] = zones;

            // Pre-select best rally lead per zone (highest rally score)
            const leads: Record<number, string> = {};
            for (const [zone, players] of Object.entries(zones)) {
                const zoneNum = parseInt(zone);
                if (zoneNum > 0 && players.length > 0) {
                    const sorted = [...players].sort((a, b) => getRallyScore(b.name) - getRallyScore(a.name));
                    leads[zoneNum] = sorted[0].name;
                }
            }
            newRallyLeadsByTeam[team] = leads;

            // Pre-select rally leads + top players for teleport first
            const teleport = new Set<string>();
            for (const [zone, players] of Object.entries(zones)) {
                if (parseInt(zone) === 0) continue;
                const sorted = [...players].sort((a, b) => getRallyScore(b.name) - getRallyScore(a.name));
                sorted.slice(0, Math.min(4, Math.ceil(players.length / 3))).forEach(p => teleport.add(p.name));
            }
            newTeleportFirstByTeam[team] = teleport;
        }

        if (totalPlayers < 1) {
            alert('Need at least 1 player to distribute across all teams');
            return;
        }

        // Update all teams at once
        setSuggestedZonesByTeam(newZonesByTeam);
        setSelectedRallyLeadsByTeam(newRallyLeadsByTeam);
        setSelectedTeleportFirstByTeam(newTeleportFirstByTeam);

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
            <section className={`${theme.card} border rounded-xl mb-6 p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                    <h2 className={`text-base font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                        🛠️ Team Builder
                    </h2>
                    <div className="flex flex-wrap items-center gap-6">
                        {/* Alliance selection - prominent */}
                        <div className="flex items-center gap-3">
                            <span className={`text-base font-medium ${theme.text}`}>Alliance:</span>
                            <select
                                value={builderAlliance}
                                onChange={(e) => setBuilderAlliance(e.target.value)}
                                className={`px-4 py-2 rounded-lg text-base font-medium ${theme.input} min-w-[140px] border-2 border-[#4318ff]/50`}
                                disabled={builderStep !== 'select'}
                            >
                                <option value="all">All Alliances</option>
                                {alliances.map(a => (
                                    <option key={a} value={a}>{allianceDisplay(a)}</option>
                                ))}
                            </select>
                        </div>
                        {/* Team count selection - clearer labeling */}
                        <div className="flex items-center gap-3">
                            <span className={`text-base font-medium ${theme.text}`}>AoO Teams:</span>
                            <div className="flex gap-1.5">
                                {[1, 2, 3].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setTeamCount(n as 1 | 2 | 3)}
                                        className={`w-10 h-10 rounded-lg text-base font-semibold transition-colors ${
                                            teamCount === n
                                                ? 'bg-[#4318ff] text-white ring-2 ring-[#4318ff]/50'
                                                : `${theme.tag} hover:opacity-80`
                                        }`}
                                        disabled={builderStep !== 'select'}
                                        title={`Organize ${n} AoO team${n > 1 ? 's' : ''} for this week`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Team summary with colored badges */}
                <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
                    <span className={`text-sm font-medium ${theme.textMuted}`}>Team Summary:</span>
                    {([1, 2, 3] as TeamNumber[]).slice(0, teamCount).map((t) => {
                        const counts = getTeamCounts(t);
                        const colors = {
                            1: { bg: 'bg-blue-600', text: 'text-blue-400', border: 'border-blue-500' },
                            2: { bg: 'bg-orange-600', text: 'text-orange-400', border: 'border-orange-500' },
                            3: { bg: 'bg-purple-600', text: 'text-purple-400', border: 'border-purple-500' },
                        }[t];
                        return (
                            <button
                                key={t}
                                onClick={() => setActiveTeam(t)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                                    builderStep === 'distribute' && activeTeam === t
                                        ? `${colors.bg} text-white shadow-md`
                                        : `${colors.bg}/20 ${colors.text} border ${colors.border}/50 hover:${colors.bg}/30`
                                }`}
                            >
                                <span className="font-bold">T{t}</span>
                                <span className="text-xs opacity-80">
                                    {counts.confirmed}✓ {counts.maybe > 0 && `+ ${counts.maybe}?`}
                                </span>
                            </button>
                        );
                    })}
                    {teamCount === 1 && (
                        <span className={`text-xs ${theme.textMuted}`}>(Use team count buttons to add more teams)</span>
                    )}
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-3 mb-5 text-sm">
                    <span className={`px-4 py-2 rounded-lg font-medium ${builderStep === 'select' ? 'bg-[#4318ff] text-white' : theme.tag}`}>
                        1. Select Players
                    </span>
                    <span className={`text-lg ${theme.textMuted}`}>→</span>
                    <span className={`px-4 py-2 rounded-lg font-medium ${builderStep === 'distribute' ? 'bg-[#4318ff] text-white' : theme.tag}`}>
                        2. Distribute & Assign
                    </span>
                    <span className={`text-lg ${theme.textMuted}`}>→</span>
                    <span className={`px-4 py-2 rounded-lg font-medium ${builderStep === 'done' ? 'bg-[#4318ff] text-white' : theme.tag}`}>
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
                    <section className={`${theme.card} border rounded-xl mb-6 p-5`}>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className={`text-lg font-semibold ${theme.text}`}>
                                    Select Players <span className={`text-base font-normal ${theme.textMuted}`}>({combinedRoster.length} available{pendingAdditions.length > 0 ? `, ${pendingAdditions.length} pending` : ''})</span>
                                </h3>
                                {scanLabel && (
                                    <p className={`text-xs ${theme.textMuted} mt-0.5`}>
                                        Data from scan: <span className={theme.text}>{scanLabel}</span>
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-6 text-base font-medium">
                                <span className="text-green-400">
                                    ✓ Confirmed: {confirmedPlayers.length} ({formatPower(confirmedPower)})
                                </span>
                                <span className="text-yellow-400">
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
                                className={`w-full px-4 py-3 rounded-lg text-base ${theme.input}`}
                            />
                        </div>

                        {/* Quick actions */}
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <button
                                onClick={() => {
                                    // Clear all team assignments
                                    setConfirmationsByTeam({ 1: {}, 2: {}, 3: {} });
                                }}
                                className={`px-4 py-2 text-sm rounded-lg ${theme.tag} hover:opacity-80`}
                            >
                                Clear All Teams
                            </button>
                            <button
                                onClick={() => setShowAddForm(!showAddForm)}
                                className={`px-5 py-2.5 text-base font-semibold rounded-lg transition-colors ${
                                    showAddForm
                                        ? 'bg-[#4318ff] text-white'
                                        : 'bg-green-600 text-white hover:bg-green-500'
                                }`}
                            >
                                + Add New Member
                            </button>
                            {pendingAdditions.length > 0 && (
                                <button
                                    onClick={() => onSavePendingAdditions(pendingAdditions)}
                                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:opacity-80"
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
                                                            {formatPower(member.power)} • {allianceDisplay(member.alliance)}
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
                        <div className={`grid grid-cols-[1fr_90px_110px_55px_55px_auto_28px] gap-3 px-3 py-2.5 text-base font-medium ${theme.textMuted} border-b border-[var(--border)]`}>
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
                            <span className="text-center">Team</span>
                            <div></div>
                        </div>

                        {/* Player list */}
                        <div className="max-h-[400px] overflow-y-auto space-y-1.5 pt-1">
                            {filteredRoster.map((member) => {
                                const assignment = getPlayerTeamAssignment(member.name);
                                const isPending = 'isPending' in member && member.isPending;
                                const aooStats = eventStats.get(member.name)?.aoo;

                                // Team colors matching in-game: T1=blue, T2=orange, T3=purple
                                const teamColors: Record<TeamNumber, { bg: string; border: string; text: string }> = {
                                    1: { bg: 'bg-blue-600', border: 'border-blue-500', text: 'text-blue-400' },
                                    2: { bg: 'bg-orange-600', border: 'border-orange-500', text: 'text-orange-400' },
                                    3: { bg: 'bg-purple-600', border: 'border-purple-500', text: 'text-purple-400' },
                                };

                                return (
                                    <div
                                        key={member.name}
                                        className={`w-full grid grid-cols-[1fr_90px_110px_55px_55px_auto_28px] gap-3 items-center px-3 py-3 rounded-lg transition-colors ${
                                            assignment ? `${teamColors[assignment.team].bg}/20 border ${teamColors[assignment.team].border}/30` :
                                            isPending ? 'bg-blue-600/20 border border-blue-500/30 border-dashed' :
                                            'bg-[var(--background-secondary)] border border-[var(--border)]'
                                        }`}
                                    >
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

                                        {/* Team assignment buttons */}
                                        <div className="flex items-center gap-1">
                                            {([1, 2, 3] as TeamNumber[]).slice(0, teamCount).map((team) => {
                                                const teamConf = confirmationsByTeam[team] || {};
                                                const status = teamConf[member.name] || 'none';
                                                const colors = teamColors[team];
                                                return (
                                                    <button
                                                        key={team}
                                                        onClick={() => toggleTeamConfirmation(member.name, team)}
                                                        className={`w-8 h-8 rounded-md text-sm font-bold transition-all ${
                                                            status === 'confirmed'
                                                                ? `${colors.bg} text-white shadow-md`
                                                                : status === 'maybe'
                                                                    ? `${colors.bg}/40 ${colors.text} border-2 ${colors.border}`
                                                                    : `bg-white/10 text-white/40 border border-white/20 hover:border-white/40`
                                                        }`}
                                                        title={`Team ${team}: ${status === 'confirmed' ? 'Confirmed' : status === 'maybe' ? 'Maybe' : 'Click to add'}`}
                                                    >
                                                        {status === 'confirmed' ? '✓' : status === 'maybe' ? '?' : team}
                                                    </button>
                                                );
                                            })}
                                        </div>

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
                                    </div>
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
                            onClick={copySummaryToClipboard}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                copiedSummary
                                    ? 'bg-green-600 text-white'
                                    : 'bg-[var(--background-secondary)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--background-hover)]'
                            }`}
                        >
                            {copiedSummary ? '✓ Copied!' : '📋 Copy Summary'}
                        </button>
                        <button
                            onClick={() => {
                                // Build all team data for apply
                                const allTeamData: Record<TeamNumber, { zones: Record<number, { name: string; power: number; kills: number }[]>; rallyLeads: Record<number, string>; teleportFirst: Set<string>; substitutes: { name: string; power: number; kills: number }[] }> = {} as Record<TeamNumber, { zones: Record<number, { name: string; power: number; kills: number }[]>; rallyLeads: Record<number, string>; teleportFirst: Set<string>; substitutes: { name: string; power: number; kills: number }[] }>;

                                for (const team of [1, 2, 3] as TeamNumber[]) {
                                    if (team > teamCount) continue;
                                    const zones = suggestedZonesByTeam[team] || {};
                                    const rallyLeads = selectedRallyLeadsByTeam[team] || {};
                                    const teleportFirst = selectedTeleportFirstByTeam[team] || new Set<string>();

                                    // Validate rally leads for this team
                                    const missingLeads = [1, 2, 3].filter(z => !rallyLeads[z] && (zones[z]?.length || 0) > 0);
                                    if (missingLeads.length > 0) {
                                        alert(`Team ${team}: Please select rally leads for Zone ${missingLeads.join(', ')}`);
                                        setActiveTeam(team);
                                        return;
                                    }

                                    allTeamData[team] = {
                                        zones,
                                        rallyLeads,
                                        teleportFirst,
                                        substitutes: zones[0] || []
                                    };
                                }

                                onApply(allTeamData);
                            }}
                            className="px-6 py-2 rounded-lg font-medium text-white bg-[#4318ff] hover:bg-[#4318ff]/80"
                        >
                            Apply All Teams →
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default function AooStrategyPage() {
    // URL params and router for shareable plans
    const searchParams = useSearchParams();
    const router = useRouter();
    const planIdFromUrl = searchParams.get('plan');

    // Auth for saving user selections
    const { user } = useAuth();

    // Fetch roster from Supabase
    const { roster, rosterNames, powerByName, killsByName, allianceByName, alliances: dbAlliances, loading: rosterLoading, scanLabel } = useScanRoster();
    const [activeTab, setActiveTab] = useState<'map' | 'roster' | 'builder'>('builder');
    const [players, setPlayers] = useState<Player[]>([]);
    const [substitutes, setSubstitutes] = useState<Player[]>([]);
    const [teams, setTeams] = useState<TeamInfo[]>(DEFAULT_TEAMS);
    const [mapImage, setMapImage] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [mapAssignments, setMapAssignments] = useState<MapAssignments | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const [strategyId, setStrategyId] = useState<number | null>(null);
    const strategyIdRef = useRef<number | null>(null);
    // Vision UI theme is always dark - no toggle needed
    const [strategyExpanded, setStrategyExpanded] = useState(false);
    const [eventMode, setEventMode] = useState<EventMode>('main');
    const [aooTeam, setAooTeam] = useState<AooTeam>('team1');

    // Shareable plan state
    const [shareId, setShareId] = useState<string | null>(null);
    const shareIdRef = useRef<string | null>(null);
    const [planName, setPlanName] = useState<string>('');
    const [linkCopied, setLinkCopied] = useState(false);

    // Everyone can edit shared plans (no password needed)
    const isEditor = !!shareId;

    const [playerSearch, setPlayerSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [newPlayerTeam, setNewPlayerTeam] = useState(1);
    const [newPlayerTags, setNewPlayerTags] = useState<string[]>([]);
    const [useCustomName, setUseCustomName] = useState(false);
    const [rosterSort, setRosterSort] = useState<'power' | 'teleport' | 'name'>('teleport');
    const [rosterTeamFilter, setRosterTeamFilter] = useState<'all' | 'T1' | 'T2' | 'T3'>('all');
    const [copySuccess, setCopySuccess] = useState<number | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const rosterGridRef = useRef<HTMLDivElement>(null);
    const rosterCanvasRef = useRef<HTMLCanvasElement>(null);

    // Team Builder state
    const [builderAlliance, setBuilderAlliance] = useState<string>('ANG');
    const [teamCount, setTeamCount] = useState<TeamNumber>(1); // Number of AoO teams to organize
    const [activeTeam, setActiveTeam] = useState<TeamNumber>(1); // Which team is being edited/distributed
    const [builderStep, setBuilderStep] = useState<'select' | 'distribute' | 'leads' | 'done'>('select');
    const [pendingAdditions, setPendingAdditions] = useState<PendingMember[]>([]);

    // Per-team state
    const emptyTeamState = { 1: {}, 2: {}, 3: {} };
    const [confirmationsByTeam, setConfirmationsByTeam] = useState<ConfirmationsByTeam>({ 1: {}, 2: {}, 3: {} });
    const [suggestedZonesByTeam, setSuggestedZonesByTeam] = useState<ZonesByTeam>({ 1: {}, 2: {}, 3: {} });
    const [selectedRallyLeadsByTeam, setSelectedRallyLeadsByTeam] = useState<RallyLeadsByTeam>({ 1: {}, 2: {}, 3: {} });
    const [selectedTeleportFirstByTeam, setSelectedTeleportFirstByTeam] = useState<TeleportFirstByTeam>({ 1: new Set(), 2: new Set(), 3: new Set() });
    const [zoneSizesByTeam, setZoneSizesByTeam] = useState<ZoneSizesByTeam>({
        1: { 0: '', 1: '', 2: '', 3: '' },
        2: { 0: '', 1: '', 2: '', 3: '' },
        3: { 0: '', 1: '', 2: '', 3: '' }
    });

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

    // Load plan by share_id from URL
    useEffect(() => {
        if (planIdFromUrl) {
            loadPlanByShareId(planIdFromUrl);
        } else {
            // No plan in URL - show landing page
            setIsLoading(false);
        }
    }, [planIdFromUrl]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Create a new plan with a unique share_id
    const createNewPlan = async () => {
        const newShareId = generateShareId();
        setIsLoading(true);

        try {
            const { data: newData, error } = await supabase
                .from('aoo_strategy')
                .insert([{
                    share_id: newShareId,
                    name: 'New AoO Plan',
                    data: {
                        players: [],
                        substitutes: [],
                        teams: DEFAULT_TEAMS,
                        mapImage: null,
                        notes: '',
                        mapAssignments: {}
                    }
                }])
                .select()
                .single();

            if (error) {
                console.error('Error creating plan:', error);
                alert(`Failed to create plan: ${error.message || error.code || 'Unknown error'}`);
                setIsLoading(false);
                return;
            }

            if (newData) {
                // Update URL without reload
                router.push(`/aoo-strategy?plan=${newShareId}`);
            }
        } catch (err) {
            console.error('Error creating plan:', err);
            alert('Failed to create plan. Please try again.');
            setIsLoading(false);
        }
    };

    // Load plan by share_id
    const loadPlanByShareId = async (planShareId: string) => {
        setIsLoading(true);
        console.log('Loading plan by share_id:', planShareId);

        try {
            const { data, error } = await supabase
                .from('aoo_strategy')
                .select('*')
                .eq('share_id', planShareId)
                .limit(1)
                .maybeSingle();

            if (error) {
                console.error('Error loading plan:', error);
                setIsLoading(false);
                return;
            }

            if (data) {
                console.log('Loaded plan:', data.id, data.share_id);
                setStrategyId(data.id);
                strategyIdRef.current = data.id;
                setShareId(data.share_id);
                shareIdRef.current = data.share_id;
                setPlanName(data.name || 'Untitled Plan');

                const strategyData = data.data as StrategyData;
                setPlayers(strategyData?.players || []);
                setSubstitutes(strategyData?.substitutes || []);
                setTeams(strategyData?.teams || DEFAULT_TEAMS);
                setMapImage(strategyData?.mapImage || null);
                setNotes(strategyData?.notes || '');
                setMapAssignments(strategyData?.mapAssignments || undefined);
            } else {
                // Plan not found
                console.log('Plan not found:', planShareId);
                alert('Plan not found. It may have been deleted.');
                router.push('/aoo-strategy');
            }
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setIsLoading(false);
    };

    const saveData = async (updatedData: Partial<StrategyData>) => {
        // Only save if we have a valid plan loaded
        const currentShareId = shareIdRef.current;
        if (!currentShareId) {
            console.log('No plan loaded, skipping save');
            return;
        }

        const data: StrategyData = {
            players: updatedData.players ?? players,
            teams: updatedData.teams ?? teams,
            mapImage: updatedData.mapImage ?? mapImage,
            notes: updatedData.notes ?? notes,
            mapAssignments: updatedData.mapAssignments ?? mapAssignments ?? {},
            substitutes: updatedData.substitutes ?? substitutes,
        };

        try {
            console.log('saveData called', { currentShareId, dataKeys: Object.keys(data) });
            const { error } = await supabase
                .from('aoo_strategy')
                .update({ data, updated_at: new Date().toISOString() })
                .eq('share_id', currentShareId);
            if (error) throw error;
            console.log('Update successful');
        } catch (error) {
            console.error('Error saving data:', error);
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

    const getTeamPlayers = (zoneNum: number) => {
        let zonePlayers = players.filter(p => p.team === zoneNum);
        // Filter by AoO team (T1, T2, T3) if a filter is selected
        if (rosterTeamFilter !== 'all') {
            zonePlayers = zonePlayers.filter(p => p.tags.includes(rosterTeamFilter));
        }
        return sortPlayers(zonePlayers);
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

        // Filter by team if filter is active
        let zonePlayers = players.filter(p => p.team === zoneNum);
        if (rosterTeamFilter !== 'all') {
            zonePlayers = zonePlayers.filter(p => p.tags.includes(rosterTeamFilter));
        }
        zonePlayers = sortPlayers(zonePlayers);

        const zoneName = teams[zoneNum - 1]?.name || `Zone ${zoneNum}`;
        const zoneDesc = teams[zoneNum - 1]?.description || '';
        const teamLabel = rosterTeamFilter !== 'all' ? ` (Team ${rosterTeamFilter.slice(1)})` : '';

        const header = `${zoneName} - ${zoneDesc}${teamLabel}`;
        const playerLines = zonePlayers.map(p => `${p.name}${formatPlayerTags(p)}`);

        return `${header}\n${playerLines.join('\n')}`;
    }, [players, teams, sortPlayers, rosterTeamFilter]);

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

        // Calculate dimensions - filter by team if filter is active
        const zonePlayers = [1, 2, 3].map(z => {
            let zPlayers = players.filter(p => p.team === z);
            if (rosterTeamFilter !== 'all') {
                zPlayers = zPlayers.filter(p => p.tags.includes(rosterTeamFilter));
            }
            return sortPlayers(zPlayers);
        });

        // Calculate subs for this team filter
        const exportSubs = rosterTeamFilter !== 'all'
            ? substitutes.filter(s => s.tags.includes(rosterTeamFilter))
            : substitutes;
        const subsHeight = exportSubs.length > 0 ? 60 + Math.ceil(exportSubs.length / 6) * 24 : 0;
        const maxPlayers = Math.max(...zonePlayers.map(z => z.length));
        const canvasWidth = (zoneWidth * 3) + (zoneGap * 2) + (padding * 2);
        const canvasHeight = headerHeight + (maxPlayers * playerHeight) + (padding * 2) + 60 + subsHeight;

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Background
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Title - include team if filtered
        ctx.fillStyle = '#fafafa';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const teamLabel = rosterTeamFilter !== 'all' ? ` - Team ${rosterTeamFilter.slice(1)}` : '';
        const titleText = eventMode === 'training'
            ? `Ark of Osiris - Training Match${teamLabel}`
            : `Ark of Osiris - Zone Assignments${teamLabel}`;
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

        // Substitutes section (already filtered as exportSubs)
        if (exportSubs.length > 0) {
            const subsY = padding + headerHeight + (maxPlayers * playerHeight) + 60;

            // Subs header
            ctx.fillStyle = '#a1a1aa';
            ctx.font = 'bold 12px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`SUBSTITUTES (${exportSubs.length})`, padding, subsY);

            // Draw subs in a grid (6 per row)
            const subsPerRow = 6;
            const subWidth = (canvasWidth - padding * 2) / subsPerRow;
            exportSubs.forEach((sub, idx) => {
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

        // Download with team in filename if filtered
        const link = document.createElement('a');
        const teamSuffix = rosterTeamFilter !== 'all' ? `-${rosterTeamFilter.toLowerCase()}` : '';
        link.download = eventMode === 'training' ? `aoo-training-roster${teamSuffix}.png` : `aoo-roster${teamSuffix}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }, [players, teams, substitutes, sortPlayers, powerByName, eventMode, rosterTeamFilter]);

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

    // Landing page - no plan selected
    if (!shareId) {
        return (
            <AppSidebar>
                <div className={`min-h-screen ${theme.bg} ${theme.text}`}>
                    <div className="max-w-2xl mx-auto px-6 py-20">
                        {/* Header */}
                        <div className="text-center mb-12">
                            <div className="inline-flex p-4 rounded-2xl bg-emerald-500/15 mb-6">
                                <Swords className="w-12 h-12 text-emerald-500" />
                            </div>
                            <h1 className="text-3xl font-bold mb-3">AoO Team Planner</h1>
                            <p className={`text-lg ${theme.textMuted}`}>
                                Build and share team assignments for Ark of Osiris
                            </p>
                        </div>

                        {/* Create New Plan */}
                        <div className={`${theme.card} border rounded-xl p-8 text-center mb-8`}>
                            <h2 className="text-xl font-semibold mb-3">Create a New Plan</h2>
                            <p className={`${theme.textMuted} mb-6`}>
                                Start fresh with a new team plan. You&apos;ll get a shareable link that anyone can use to view and edit.
                            </p>
                            <button
                                onClick={createNewPlan}
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
                            >
                                <Plus size={20} />
                                Create New Plan
                            </button>
                        </div>

                        {/* How it works */}
                        <div className={`${theme.card} border rounded-xl p-6`}>
                            <h3 className={`text-sm font-semibold uppercase tracking-wider ${theme.textMuted} mb-4`}>
                                How it works
                            </h3>
                            <div className="space-y-4 text-sm">
                                <div className="flex gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-semibold text-xs">1</span>
                                    <div>
                                        <strong>Create a plan</strong> - Click the button above to start a new team plan
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-semibold text-xs">2</span>
                                    <div>
                                        <strong>Build your teams</strong> - Select players, distribute to zones, assign rally leads
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-semibold text-xs">3</span>
                                    <div>
                                        <strong>Share the link</strong> - Copy the URL and share with your team leaders
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-semibold text-xs">4</span>
                                    <div>
                                        <strong>Collaborate</strong> - Anyone with the link can view and edit the plan
                                    </div>
                                </div>
                            </div>
                        </div>
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
                            <div className="p-2.5 rounded-lg bg-emerald-500/15 flex-shrink-0">
                                <Swords className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-lg sm:text-2xl font-semibold tracking-tight">AoO Planner</h1>
                                <p className={`text-xs sm:text-sm ${theme.textMuted} hidden sm:block`}>
                                    30v30 Strategy Planner
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-shrink-0">
                            {shareId && (
                                <button
                                    onClick={async () => {
                                        const url = `${window.location.origin}/aoo-strategy?plan=${shareId}`;
                                        await navigator.clipboard.writeText(url);
                                        setLinkCopied(true);
                                        setTimeout(() => setLinkCopied(false), 2000);
                                    }}
                                    className={`p-2 sm:px-4 sm:py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                                        linkCopied ? 'bg-green-600 text-white' : theme.button
                                    }`}
                                    title="Copy shareable link"
                                >
                                    {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                                    <span className="hidden sm:inline">{linkCopied ? 'Copied!' : 'Copy Link'}</span>
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

            {/* Collaborative Banner */}
            {shareId && (
                <div className="bg-emerald-500/10 border-b border-emerald-500/30">
                    <div className="max-w-6xl mx-auto px-4 md:px-6 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <LinkIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                <div>
                                    <p className={`text-xs ${theme.textMuted}`}>
                                        <strong className="text-emerald-400">Collaborative Plan</strong> - Anyone with this link can view and edit
                                    </p>
                                </div>
                            </div>
                            <code className={`text-xs px-2 py-1 rounded bg-[var(--background-secondary)] ${theme.textMuted} hidden sm:block`}>
                                ?plan={shareId}
                            </code>
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
                    confirmationsByTeam={confirmationsByTeam}
                    setConfirmationsByTeam={setConfirmationsByTeam}
                    builderStep={builderStep}
                    setBuilderStep={setBuilderStep}
                    suggestedZonesByTeam={suggestedZonesByTeam}
                    setSuggestedZonesByTeam={setSuggestedZonesByTeam}
                    selectedRallyLeadsByTeam={selectedRallyLeadsByTeam}
                    setSelectedRallyLeadsByTeam={setSelectedRallyLeadsByTeam}
                    selectedTeleportFirstByTeam={selectedTeleportFirstByTeam}
                    setSelectedTeleportFirstByTeam={setSelectedTeleportFirstByTeam}
                    zoneSizesByTeam={zoneSizesByTeam}
                    setZoneSizesByTeam={setZoneSizesByTeam}
                    pendingAdditions={pendingAdditions}
                    setPendingAdditions={setPendingAdditions}
                    onSavePendingAdditions={handleSavePendingAdditions}
                    onApply={(allTeamData) => {
                        // Apply distribution to strategy for all teams
                        const newPlayers: Player[] = [];
                        const newSubstitutes: Player[] = [];
                        let idCounter = Date.now();

                        // Process each team
                        for (const teamNum of [1, 2, 3] as TeamNumber[]) {
                            const teamData = allTeamData[teamNum];
                            if (!teamData) continue;

                            const { zones, rallyLeads, teleportFirst, substitutes } = teamData;

                            for (const [zoneNum, zonePeople] of Object.entries(zones)) {
                                const zone = parseInt(zoneNum);
                                if (zone === 0) continue; // Skip substitutes here
                                for (const p of zonePeople as { name: string; power: number; kills: number }[]) {
                                    const tags: string[] = ['Confirmed', `T${teamNum}`];
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

                            // Create substitutes for this team
                            for (const p of substitutes) {
                                newSubstitutes.push({
                                    id: idCounter++,
                                    name: p.name,
                                    team: 0,
                                    tags: ['Maybe', `T${teamNum}`],
                                    power: p.power,
                                    assignments: { phase1: '', phase2: '', phase3: '', phase4: '' },
                                });
                            }
                        }

                        setPlayers(newPlayers);
                        setSubstitutes(newSubstitutes);
                        saveData({ players: newPlayers, substitutes: newSubstitutes });
                        setActiveTab('roster');
                    }}
                    theme={theme}
                    formatPower={formatPower}
                    user={user}
                    scanLabel={scanLabel}
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
                            {/* Team filter */}
                            <div className="flex items-center gap-2">
                                <span className={`text-xs ${theme.textMuted}`}>Team:</span>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setRosterTeamFilter('all')}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${rosterTeamFilter === 'all' ? theme.tagActive : theme.tag}`}
                                    >
                                        All
                                    </button>
                                    <button
                                        onClick={() => setRosterTeamFilter('T1')}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${rosterTeamFilter === 'T1' ? 'bg-blue-600 text-white' : theme.tag}`}
                                    >
                                        T1
                                    </button>
                                    <button
                                        onClick={() => setRosterTeamFilter('T2')}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${rosterTeamFilter === 'T2' ? 'bg-orange-600 text-white' : theme.tag}`}
                                    >
                                        T2
                                    </button>
                                    <button
                                        onClick={() => setRosterTeamFilter('T3')}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${rosterTeamFilter === 'T3' ? 'bg-purple-600 text-white' : theme.tag}`}
                                    >
                                        T3
                                    </button>
                                </div>
                            </div>
                            {/* Sort */}
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
