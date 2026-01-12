'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatPower } from '@/lib/supabase/use-alliance-roster';
import { createSnapshot, useRosterSnapshots, formatDate, type DailyTotals, type MemberChange } from '@/lib/supabase/use-roster-snapshots';
import { getAllMemberStats, getMemberEventHistory, recordEvent, deleteEvent, bulkRecordAoO, bulkRecordMobilization, type MemberEventStats, type EventParticipation } from '@/lib/supabase/use-event-participation';
import { ArrowLeft, Search, ChevronUp, ChevronDown, Edit2, Save, X, Upload, Users, History, Lock, TrendingUp, UserPlus, UserMinus, Calendar, Trophy, BarChart3, AlertTriangle } from 'lucide-react';

interface RosterMember {
    id: string;
    name: string;
    power: number;
    kills: number;
    t4_kills: number;
    t5_kills: number;
    deads: number;
    tier: string | null;
    role: string | null;
    notes: string | null;
    tags: string[] | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

type SortField = 'default' | 'name' | 'power' | 'kills' | 'role';

// Column descriptions for tooltips
const COLUMN_TOOLTIPS: Record<string, string> = {
    name: 'In-game governor name',
    power: 'Total account power',
    kp: 'Kill points (total kills)',
    t4t5: 'T4 and T5 troop kill points',
    aoo: 'Ark of Osiris: Last team assignment and participation rate',
    mob: 'Mobilization: Individual points and resources turned in/accepted',
    rank: 'Alliance rank (R1-R5)',
};
type SortDirection = 'asc' | 'desc';

const EDITOR_PASSWORD = 'carn-dum';

// Activity score breakdown interface
interface ActivityBreakdown {
    aooRate: number;      // 0-100 percentage
    mobPercentile: number; // 0-100 percentile
    kpPercentile: number;  // 0-100 percentile
    powerPercentile: number; // 0-100 percentile
}

interface MemberActivityScore {
    score: number;
    breakdown: ActivityBreakdown;
}

// Activity weights interface
interface ActivityWeights {
    kp: number;
    power: number;
    aoo: number;
    mob: number;
}

// Calculate activity scores for all members
function calculateActivityScores(
    roster: RosterMember[],
    eventStats: Map<string, MemberEventStats>,
    weights: ActivityWeights = { kp: 50, power: 30, aoo: 10, mob: 10 }
): Map<string, MemberActivityScore> {
    const scores = new Map<string, MemberActivityScore>();

    // Get sorted arrays for percentile calculations
    const mobScores = roster
        .map(m => eventStats.get(m.name)?.mobilization.lastScore ?? 0)
        .sort((a, b) => a - b);
    const kpValues = roster.map(m => m.kills || 0).sort((a, b) => a - b);
    const powerValues = roster.map(m => m.power).sort((a, b) => a - b);

    // Helper to calculate percentile rank
    const getPercentile = (value: number, sortedArray: number[]): number => {
        if (sortedArray.length === 0) return 0;
        const idx = sortedArray.findIndex(v => v >= value);
        if (idx === -1) return 100;
        return (idx / sortedArray.length) * 100;
    };

    // Convert weights from percentages to decimals
    const w = {
        kp: weights.kp / 100,
        power: weights.power / 100,
        aoo: weights.aoo / 100,
        mob: weights.mob / 100,
    };

    for (const member of roster) {
        const stats = eventStats.get(member.name);

        // AoO participation rate
        let aooRate = 0;
        if (stats?.aoo.totalAssigned && stats.aoo.totalAssigned > 0) {
            aooRate = (stats.aoo.participatedCount / stats.aoo.totalAssigned) * 100;
        }

        // Mobilization percentile
        const mobScore = stats?.mobilization.lastScore ?? 0;
        const mobPercentile = getPercentile(mobScore, mobScores);

        // KP percentile
        const kpPercentile = getPercentile(member.kills || 0, kpValues);

        // Power percentile
        const powerPercentile = getPercentile(member.power, powerValues);

        // Calculate weighted score
        const score = Math.round(
            w.aoo * aooRate +
            w.mob * mobPercentile +
            w.kp * kpPercentile +
            w.power * powerPercentile
        );

        scores.set(member.name, {
            score,
            breakdown: {
                aooRate,
                mobPercentile,
                kpPercentile,
                powerPercentile,
            },
        });
    }

    return scores;
}

export default function RosterPage() {
    const [roster, setRoster] = useState<RosterMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('default'); // Default: rank → power → name
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Editor mode
    const [isEditor, setIsEditor] = useState(false);
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [editorPassword, setEditorPassword] = useState('');

    // Editing state - kills stored as string for decimal input (millions)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<{ killsM: string; t4t5KillsM: string; notes: string }>({ killsM: '', t4t5KillsM: '', notes: '' });

    // CSV Import
    const [showImport, setShowImport] = useState(false);
    const [importStatus, setImportStatus] = useState<string | null>(null);

    // Tabs and History
    const [activeTab, setActiveTab] = useState<'roster' | 'history' | 'events' | 'analytics'>('roster');
    const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);

    // Event participation stats
    const [eventStats, setEventStats] = useState<Map<string, MemberEventStats>>(new Map());

    // Events tab state
    const [eventType, setEventType] = useState<'aoo' | 'mobilization'>('aoo');
    const [eventDate, setEventDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [eventEntries, setEventEntries] = useState<Map<string, { team: 'Team 1' | 'Team 2' | null; participated: boolean; score: string }>>(new Map());
    const [eventSaving, setEventSaving] = useState(false);

    // Activity score weights (must sum to 100)
    const [activityWeights, setActivityWeights] = useState({ kp: 50, power: 30, aoo: 10, mob: 10 });

    // Mobilization growth expanded state
    const [showAllGrowth, setShowAllGrowth] = useState(false);
    // Growth table sorting
    const [growthSort, setGrowthSort] = useState<{ field: 'name' | 'previousScore' | 'lastScore' | 'growth' | 'growthPercent'; direction: 'asc' | 'desc' }>({ field: 'growth', direction: 'desc' });

    // History data from hook
    const { dailyTotals, memberChanges, lastSnapshotDate, loading: historyLoading, refetch: refetchHistory } = useRosterSnapshots();

    const fetchRoster = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const { data, error: fetchError } = await supabase
                .from('alliance_roster')
                .select('*')
                .eq('is_active', true)
                .order('power', { ascending: false });

            if (fetchError) throw fetchError;
            setRoster(data || []);
        } catch (err) {
            console.error('Error fetching roster:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch roster');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoster();
    }, [fetchRoster]);

    // Fetch event participation stats
    const fetchEventStats = useCallback(async () => {
        try {
            const stats = await getAllMemberStats();
            setEventStats(stats);
        } catch (err) {
            console.error('Error fetching event stats:', err);
        }
    }, []);

    useEffect(() => {
        fetchEventStats();
    }, [fetchEventStats]);

    // Initialize event entries when roster or event type changes
    useEffect(() => {
        const entries = new Map<string, { team: 'Team 1' | 'Team 2' | null; participated: boolean; score: string }>();
        roster.forEach(member => {
            entries.set(member.name, { team: null, participated: false, score: '' });
        });
        setEventEntries(entries);
    }, [roster, eventType]);

    // Save bulk event data
    const handleSaveEventData = async () => {
        setEventSaving(true);
        try {
            if (eventType === 'aoo') {
                // Filter entries with team assigned
                const aooEntries: { memberName: string; team: 'Team 1' | 'Team 2'; participated: boolean }[] = [];
                eventEntries.forEach((entry, memberName) => {
                    if (entry.team) {
                        aooEntries.push({
                            memberName,
                            team: entry.team,
                            participated: entry.participated,
                        });
                    }
                });
                if (aooEntries.length > 0) {
                    await bulkRecordAoO(eventDate, aooEntries);
                }
            } else {
                // Filter entries with score
                const mobEntries: { memberName: string; score: number }[] = [];
                eventEntries.forEach((entry, memberName) => {
                    if (entry.score) {
                        const scoreNum = parseFloat(entry.score) * 1000; // Input is in thousands
                        if (!isNaN(scoreNum) && scoreNum > 0) {
                            mobEntries.push({
                                memberName,
                                score: Math.round(scoreNum),
                            });
                        }
                    }
                });
                if (mobEntries.length > 0) {
                    await bulkRecordMobilization(eventDate, mobEntries);
                }
            }
            // Refresh stats
            await fetchEventStats();
            setSnapshotStatus(`${eventType === 'aoo' ? 'AoO' : 'Mobilization'} event saved!`);
            setTimeout(() => setSnapshotStatus(null), 2000);
        } catch (err) {
            console.error('Error saving event data:', err);
            setSnapshotStatus('Failed to save event data');
            setTimeout(() => setSnapshotStatus(null), 2000);
        } finally {
            setEventSaving(false);
        }
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

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            // Default direction: name=asc, role/default=asc (R5 first), power/kills=desc (highest first)
            setSortDirection(field === 'name' || field === 'role' || field === 'default' ? 'asc' : 'desc');
        }
    };

    const resetToDefaultSort = () => {
        setSortField('default');
        setSortDirection('asc');
    };

    const startEditing = (member: RosterMember) => {
        setEditingId(member.id);
        // Convert kills to millions for display (e.g., 18543993 -> "18.5")
        const killsM = member.kills ? (member.kills / 1000000).toFixed(1) : '';
        // Format T4/T5 as "X/Y" (e.g., "5.2/3.1")
        const t4M = member.t4_kills ? (member.t4_kills / 1000000).toFixed(1) : '0';
        const t5M = member.t5_kills ? (member.t5_kills / 1000000).toFixed(1) : '0';
        const t4t5KillsM = (member.t4_kills || member.t5_kills) ? `${t4M}/${t5M}` : '';
        setEditValues({ killsM, t4t5KillsM, notes: member.notes || '' });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditValues({ killsM: '', t4t5KillsM: '', notes: '' });
    };

    const saveEditing = async () => {
        if (!editingId) return;

        try {
            // Convert millions input back to raw number (e.g., "18.5" -> 18500000)
            const killsRaw = editValues.killsM ? Math.round(parseFloat(editValues.killsM) * 1000000) : 0;

            // Parse T4/T5 from "X/Y" format (e.g., "5.2/3.1" -> t4=5200000, t5=3100000)
            let t4KillsRaw = 0;
            let t5KillsRaw = 0;
            if (editValues.t4t5KillsM) {
                const parts = editValues.t4t5KillsM.split('/');
                t4KillsRaw = parts[0] ? Math.round(parseFloat(parts[0]) * 1000000) : 0;
                t5KillsRaw = parts[1] ? Math.round(parseFloat(parts[1]) * 1000000) : 0;
            }

            const { error } = await supabase
                .from('alliance_roster')
                .update({ kills: killsRaw, t4_kills: t4KillsRaw, t5_kills: t5KillsRaw, notes: editValues.notes || null })
                .eq('id', editingId);

            if (error) throw error;

            setRoster(roster.map(m =>
                m.id === editingId
                    ? { ...m, kills: killsRaw, t4_kills: t4KillsRaw, t5_kills: t5KillsRaw, notes: editValues.notes || null }
                    : m
            ));
            setEditingId(null);
        } catch (err) {
            console.error('Error saving:', err);
            alert('Failed to save changes');
        }
    };

    const handleImportCSV = async (file: File) => {
        setImportStatus('Reading file...');

        try {
            const content = await file.text();
            const lines = content.trim().split('\n');

            if (lines.length < 2) {
                throw new Error('CSV must have a header row and at least one data row');
            }

            const header = lines[0].split(',').map(h => h.trim().toLowerCase());
            const nameIdx = header.indexOf('name');
            const powerIdx = header.indexOf('power');
            const killsIdx = header.indexOf('kills');
            const roleIdx = header.indexOf('role') !== -1 ? header.indexOf('role') : header.indexOf('rank');
            const notesIdx = header.indexOf('notes');

            if (nameIdx === -1) {
                throw new Error('CSV must have a "name" column');
            }

            const rows: Partial<RosterMember>[] = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const values = line.split(',').map(v => v.trim());
                const name = values[nameIdx];
                if (!name) continue;

                rows.push({
                    name,
                    power: powerIdx !== -1 ? parseInt(values[powerIdx], 10) || 0 : 0,
                    kills: killsIdx !== -1 ? parseInt(values[killsIdx], 10) || 0 : 0,
                    role: roleIdx !== -1 ? values[roleIdx] || null : null,
                    notes: notesIdx !== -1 ? values[notesIdx] || null : null,
                    is_active: true,
                });
            }

            setImportStatus(`Importing ${rows.length} members...`);

            const { error } = await supabase
                .from('alliance_roster')
                .upsert(rows, { onConflict: 'name' });

            if (error) throw error;

            setImportStatus(`Imported ${rows.length} members. Creating snapshot...`);

            // Auto-create snapshot after import
            try {
                const snapshotData = rows.map(r => ({
                    name: r.name!,
                    power: r.power || 0,
                    kills: r.kills || 0,
                    role: r.role || null,
                    is_active: true,
                }));
                await createSnapshot(snapshotData);
                setImportStatus(`Successfully imported ${rows.length} members and saved snapshot!`);
                refetchHistory();
            } catch {
                setImportStatus(`Imported ${rows.length} members (snapshot failed)`);
            }

            setTimeout(() => {
                setImportStatus(null);
                setShowImport(false);
            }, 2000);

            fetchRoster();
        } catch (err) {
            console.error('Import error:', err);
            setImportStatus(`Error: ${err instanceof Error ? err.message : 'Import failed'}`);
        }
    };

    // Manual snapshot handler
    const handleCreateSnapshot = async () => {
        if (roster.length === 0) {
            setSnapshotStatus('No roster data to snapshot');
            setTimeout(() => setSnapshotStatus(null), 2000);
            return;
        }

        setSnapshotStatus('Creating snapshot...');
        try {
            const snapshotData = roster.map(m => ({
                name: m.name,
                power: m.power,
                kills: m.kills || 0,
                role: m.role,
                is_active: m.is_active,
            }));
            const result = await createSnapshot(snapshotData);
            setSnapshotStatus(`Snapshot saved for ${result.date} (${result.count} members)`);
            refetchHistory();
            setTimeout(() => setSnapshotStatus(null), 3000);
        } catch (err) {
            console.error('Snapshot error:', err);
            setSnapshotStatus('Failed to create snapshot');
            setTimeout(() => setSnapshotStatus(null), 3000);
        }
    };

    // Helper to get rank order (R5=1, R4=2, R3=3, R2=4, R1=5, null=6)
    const getRankOrder = (role: string | null): number => {
        if (!role) return 6;
        const match = role.match(/R(\d)/);
        if (match) return 6 - parseInt(match[1]); // R5=1, R4=2, R3=3, R2=4, R1=5
        return 6;
    };

    // Get unique tags from roster
    const availableTags = useMemo(() => {
        const tags = new Set<string>();
        roster.forEach(m => {
            if (m.tags) {
                m.tags.forEach(t => tags.add(t));
            }
        });
        return Array.from(tags).sort();
    }, [roster]);

    // Filter and sort roster
    const filteredRoster = roster
        .filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
        .filter(m => !tagFilter || (m.tags && m.tags.includes(tagFilter)))
        .sort((a, b) => {
            // When sorting by default or rank, use multi-level: rank → power (desc) → name (asc)
            if (sortField === 'default' || sortField === 'role') {
                const rankA = getRankOrder(a.role);
                const rankB = getRankOrder(b.role);
                const rankCompare = sortDirection === 'asc' ? rankA - rankB : rankB - rankA;
                if (rankCompare !== 0) return rankCompare;

                // Secondary: power descending
                if (a.power !== b.power) return b.power - a.power;

                // Tertiary: name ascending
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            }

            // Single-field sorting for other columns
            let aVal: string | number = 0;
            let bVal: string | number = 0;

            switch (sortField) {
                case 'name':
                    aVal = a.name.toLowerCase();
                    bVal = b.name.toLowerCase();
                    break;
                case 'power':
                    aVal = a.power;
                    bVal = b.power;
                    break;
                case 'kills':
                    aVal = a.kills || 0;
                    bVal = b.kills || 0;
                    break;
            }

            if (sortDirection === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        });

    const totalPower = roster.reduce((sum, m) => sum + m.power, 0);
    const totalKills = roster.reduce((sum, m) => sum + (m.kills || 0), 0);

    // Vision UI theme - using CSS variables for dark/light mode support
    const theme = {
        bg: 'bg-[var(--background)]',
        card: 'bg-[var(--background-card)] border-[var(--border)] backdrop-blur-xl',
        text: 'text-[var(--foreground)]',
        textMuted: 'text-[var(--text-secondary)]',
        border: 'border-[var(--border)]',
        input: 'bg-[var(--background-card)] border-[var(--border)] text-[var(--foreground)] placeholder-[var(--text-muted)]',
        button: 'bg-[var(--background-card)] hover:opacity-80 text-[var(--foreground)] border border-[var(--border)]',
        buttonPrimary: 'bg-gradient-to-r from-[#4318ff] to-[#9f7aea] hover:opacity-90 text-white',
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        const isActive = sortField === field;
        const Icon = isActive && sortDirection === 'desc' ? ChevronDown : ChevronUp;
        return <Icon className={`w-4 h-4 transition-opacity ${isActive ? 'opacity-100' : 'opacity-30'}`} />;
    };

    // Tooltip component for column headers (shows below to avoid being clipped by overflow)
    const ColumnTooltip = ({ text, children }: { text: string; children: React.ReactNode }) => (
        <div className="group relative inline-flex">
            {children}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs bg-[var(--background-card)] border border-[var(--border)] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {text}
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className={`min-h-screen ${theme.bg} ${theme.text} flex items-center justify-center`}>
                <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-[#4318ff] border-t-transparent rounded-full animate-spin"></div>
                    <span className={theme.textMuted}>Loading roster...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${theme.bg} ${theme.text}`}>
            {/* Grid background */}
            <div className="fixed inset-0 bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

            {/* Header */}
            <header className="bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] sticky top-0 z-40">
                <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Link
                                href="/"
                                className={`p-2 rounded-lg ${theme.button} hover:opacity-80 transition-opacity`}
                                title="Back to Home"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Alliance Roster</h1>
                                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#4318ff]/20 text-[#9f7aea]">
                                        {roster.length} members
                                    </span>
                                </div>
                                <p className={`text-sm ${theme.textMuted}`}>Member stats and kill points</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {isEditor && (
                                <>
                                    <button
                                        onClick={() => setShowImport(!showImport)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium ${theme.button} flex items-center gap-2`}
                                    >
                                        <Upload className="w-4 h-4" />
                                        Import CSV
                                    </button>
                                    <button
                                        onClick={handleCreateSnapshot}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium ${theme.button} flex items-center gap-2`}
                                        title="Save today's roster data for historical tracking"
                                    >
                                        <Lock className="w-4 h-4" />
                                        Lock Today
                                    </button>
                                </>
                            )}
                            {!isEditor ? (
                                <button
                                    onClick={() => setShowPasswordPrompt(true)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium ${theme.button}`}
                                >
                                    Edit Mode
                                </button>
                            ) : (
                                <button
                                    onClick={async () => {
                                        setIsEditor(false);
                                        setEditingId(null);
                                        // Auto-save snapshot on exit
                                        if (roster.length > 0) {
                                            try {
                                                const snapshotData = roster.map(m => ({
                                                    name: m.name,
                                                    power: m.power,
                                                    kills: m.kills || 0,
                                                    role: m.role,
                                                    is_active: m.is_active,
                                                }));
                                                await createSnapshot(snapshotData);
                                                setSnapshotStatus('Snapshot auto-saved');
                                                refetchHistory();
                                                setTimeout(() => setSnapshotStatus(null), 2000);
                                            } catch {
                                                // Silent fail for auto-save
                                            }
                                        }
                                    }}
                                    className="px-3 py-2 rounded-lg text-sm font-medium bg-[#4318ff] text-white hover:bg-[#4318ff]/80 transition-colors"
                                >
                                    Exit Edit Mode
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex flex-wrap gap-2 mt-4">
                        <button
                            onClick={() => setActiveTab('roster')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                                activeTab === 'roster'
                                    ? 'bg-[#4318ff] text-white'
                                    : `${theme.button}`
                            }`}
                        >
                            <Users className="w-4 h-4" />
                            Roster
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                                activeTab === 'history'
                                    ? 'bg-[#4318ff] text-white'
                                    : `${theme.button}`
                            }`}
                        >
                            <History className="w-4 h-4" />
                            History
                        </button>
                        <button
                            onClick={() => setActiveTab('analytics')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                                activeTab === 'analytics'
                                    ? 'bg-[#4318ff] text-white'
                                    : `${theme.button}`
                            }`}
                        >
                            <BarChart3 className="w-4 h-4" />
                            Analytics
                        </button>
                        {isEditor && (
                            <button
                                onClick={() => setActiveTab('events')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                                    activeTab === 'events'
                                        ? 'bg-[#4318ff] text-white'
                                        : `${theme.button}`
                                }`}
                            >
                                <Calendar className="w-4 h-4" />
                                Events
                            </button>
                        )}
                        {lastSnapshotDate && (
                            <span className={`px-3 py-2 text-xs ${theme.textMuted} flex items-center gap-1`}>
                                Last snapshot: {formatDate(lastSnapshotDate)}
                            </span>
                        )}
                    </div>

                    {/* Tag Filter - Global */}
                    {availableTags.length > 0 && (
                        <div className="flex items-center gap-3 mt-4">
                            <span className={`text-xs ${theme.textMuted}`}>Filter:</span>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setTagFilter(null)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                        !tagFilter
                                            ? 'bg-[#4318ff] text-white'
                                            : `${theme.button}`
                                    }`}
                                >
                                    All ({roster.length})
                                </button>
                                {availableTags.map(tag => {
                                    const count = roster.filter(m => m.tags?.includes(tag)).length;
                                    const tagConfig = {
                                        'angmar-og': { label: 'Angmar Core', activeClass: 'bg-amber-500 text-black', inactiveClass: 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' },
                                        'inactive': { label: 'Inactive', activeClass: 'bg-gray-500 text-white', inactiveClass: 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30' },
                                        'quit': { label: 'Quit', activeClass: 'bg-red-500 text-white', inactiveClass: 'bg-red-500/20 text-red-400 hover:bg-red-500/30' },
                                    }[tag] || { label: tag, activeClass: 'bg-blue-500 text-white', inactiveClass: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' };
                                    return (
                                        <button
                                            key={tag}
                                            onClick={() => setTagFilter(tag)}
                                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                                                tagFilter === tag ? tagConfig.activeClass : tagConfig.inactiveClass
                                            }`}
                                        >
                                            {tagConfig.label} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Snapshot Status */}
                    {snapshotStatus && (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-[#4318ff]/20 text-[#9f7aea] text-sm">
                            {snapshotStatus}
                        </div>
                    )}
                </div>
            </header>

            {/* Password Modal */}
            {showPasswordPrompt && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className={`${theme.card} border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl`}>
                        <h2 className="text-lg font-semibold mb-4">Enter Password</h2>
                        <input
                            type="password"
                            value={editorPassword}
                            onChange={(e) => setEditorPassword(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                            placeholder="Password"
                            className={`w-full px-3 py-2 rounded-lg border ${theme.input} mb-4 focus:outline-none focus:ring-2 focus:ring-[#4318ff]`}
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button onClick={handlePasswordSubmit} className={`flex-1 py-2 rounded-lg font-medium ${theme.buttonPrimary}`}>
                                Submit
                            </button>
                            <button onClick={() => setShowPasswordPrompt(false)} className={`flex-1 py-2 rounded-lg font-medium ${theme.button}`}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Mode Banner */}
            {isEditor && (
                <div className="bg-[#4318ff]/10 border-b border-[#4318ff]/30">
                    <div className="max-w-6xl mx-auto px-4 md:px-6 py-3">
                        <div className="flex items-start gap-3">
                            <Edit2 className="w-5 h-5 text-[#9f7aea] flex-shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-medium text-[#9f7aea] text-sm">Edit Mode Active</h3>
                                <p className={`text-xs ${theme.textMuted} mt-1`}>
                                    <strong>Roster tab:</strong> Click any row to edit KP and notes •
                                    <strong> Analytics tab:</strong> Adjust activity score weights •
                                    <strong> Events tab:</strong> Record AoO teams and Mobilization scores
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Panel */}
            {showImport && isEditor && (
                <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4">
                    <div className={`${theme.card} border rounded-xl p-4`}>
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            Import Roster from CSV
                        </h3>
                        <p className={`text-sm ${theme.textMuted} mb-3`}>
                            CSV should have columns: name, power, kills (optional), rank/role (optional), notes (optional)
                        </p>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => e.target.files?.[0] && handleImportCSV(e.target.files[0])}
                            className={`w-full px-3 py-2 rounded-lg border ${theme.input}`}
                        />
                        {importStatus && (
                            <p className={`mt-2 text-sm ${importStatus.includes('Error') ? 'text-red-500' : 'text-[#01b574]'}`}>
                                {importStatus}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto p-4 md:p-6">
                {/* Roster Tab */}
                {activeTab === 'roster' && (
                    <>
                {/* Stats Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className={`${theme.card} border rounded-xl p-4 text-center`}>
                        <Users className="w-6 h-6 mx-auto mb-2 text-[#9f7aea]" />
                        <p className={`text-xs ${theme.textMuted}`}>Members</p>
                        <p className="text-2xl font-bold">{roster.length}</p>
                    </div>
                    <div className={`${theme.card} border rounded-xl p-4 text-center`}>
                        <p className={`text-xs ${theme.textMuted}`}>Total Power</p>
                        <p className="text-2xl font-bold text-[#01b574]">{formatPower(totalPower)}</p>
                    </div>
                    <div className={`${theme.card} border rounded-xl p-4 text-center`}>
                        <p className={`text-xs ${theme.textMuted}`}>Total Kill Points</p>
                        <p className="text-2xl font-bold text-[#f56565]">{formatPower(totalKills)}</p>
                    </div>
                    <div className={`${theme.card} border rounded-xl p-4 text-center`}>
                        <p className={`text-xs ${theme.textMuted}`}>Avg Power</p>
                        <p className="text-2xl font-bold text-[#4318ff]">{formatPower(Math.round(totalPower / roster.length))}</p>
                    </div>
                </div>

                {/* Search and Sort Controls */}
                <div className={`${theme.card} border rounded-xl p-4 mb-6`}>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${theme.textMuted}`} />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name..."
                                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff]`}
                            />
                        </div>
                        {sortField !== 'default' && (
                            <button
                                onClick={resetToDefaultSort}
                                className={`px-4 py-2 rounded-lg text-sm font-medium ${theme.button} whitespace-nowrap`}
                                title="Reset to default sort (Rank → Power → Name)"
                            >
                                Reset Sort
                            </button>
                        )}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500">
                        {error}
                    </div>
                )}

                {/* Roster Table */}
                <div className={`${theme.card} border rounded-xl overflow-hidden`}>
                    {/* Table hint for non-editors */}
                    {!isEditor && (
                        <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between">
                            <span className={`text-xs ${theme.textMuted}`}>
                                Click column headers to sort
                            </span>
                            <button
                                onClick={() => setShowPasswordPrompt(true)}
                                className={`text-xs ${theme.textMuted} hover:text-[#9f7aea] transition-colors flex items-center gap-1`}
                            >
                                <Edit2 className="w-3 h-3" />
                                Edit KP & notes
                            </button>
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    <th className="text-left px-4 py-3">
                                        <ColumnTooltip text={COLUMN_TOOLTIPS.name}>
                                            <button
                                                onClick={() => handleSort('name')}
                                                className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white`}
                                            >
                                                Name <SortIcon field="name" />
                                            </button>
                                        </ColumnTooltip>
                                    </th>
                                    <th className="text-right px-4 py-3">
                                        <ColumnTooltip text={COLUMN_TOOLTIPS.power}>
                                            <button
                                                onClick={() => handleSort('power')}
                                                className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white ml-auto`}
                                            >
                                                Power <SortIcon field="power" />
                                            </button>
                                        </ColumnTooltip>
                                    </th>
                                    <th className="text-right px-4 py-3">
                                        <ColumnTooltip text={COLUMN_TOOLTIPS.kp}>
                                            <button
                                                onClick={() => handleSort('kills')}
                                                className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white ml-auto`}
                                            >
                                                KP <SortIcon field="kills" />
                                            </button>
                                        </ColumnTooltip>
                                    </th>
                                    <th className="text-right px-4 py-3">
                                        <ColumnTooltip text={COLUMN_TOOLTIPS.t4t5}>
                                            <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                T4/T5 KP
                                            </span>
                                        </ColumnTooltip>
                                    </th>
                                    <th className="text-center px-4 py-3">
                                        <ColumnTooltip text={COLUMN_TOOLTIPS.aoo}>
                                            <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                AoO
                                            </span>
                                        </ColumnTooltip>
                                    </th>
                                    <th className="text-center px-4 py-3">
                                        <ColumnTooltip text={COLUMN_TOOLTIPS.mob}>
                                            <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                Mob
                                            </span>
                                        </ColumnTooltip>
                                    </th>
                                    <th className="text-center px-4 py-3">
                                        <ColumnTooltip text={COLUMN_TOOLTIPS.rank}>
                                            <button
                                                onClick={() => handleSort('role')}
                                                className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white mx-auto`}
                                            >
                                                Rank <SortIcon field="role" />
                                            </button>
                                        </ColumnTooltip>
                                    </th>
                                    {isEditor && (
                                        <th className="text-left px-4 py-3">
                                            <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                Notes
                                            </span>
                                        </th>
                                    )}
                                    {isEditor && (
                                        <th className="text-center px-4 py-3">
                                            <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                Actions
                                            </span>
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRoster.map((member, idx) => (
                                    <tr
                                        key={member.id}
                                        className={`border-b border-[var(--border)] ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''} hover:bg-[var(--background-secondary)]/50`}
                                    >
                                        <td className="px-4 py-3">
                                            <span className="font-medium">{member.name}</span>
                                            {member.tags?.includes('angmar-og') && (
                                                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-500/20 text-amber-400" title="Angmar Core">ANG</span>
                                            )}
                                            {member.tags?.includes('inactive') && (
                                                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-gray-500/20 text-gray-400" title="Inactive">AFK</span>
                                            )}
                                            {member.tags?.includes('quit') && (
                                                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-500/20 text-red-400" title="Quit">QUIT</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="text-[#01b574]">{formatPower(member.power)}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {editingId === member.id ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={editValues.killsM}
                                                        onChange={(e) => setEditValues({ ...editValues, killsM: e.target.value })}
                                                        className={`w-20 px-2 py-1 rounded border ${theme.input} text-right`}
                                                        placeholder="0.0"
                                                    />
                                                    <span className={`text-xs ${theme.textMuted}`}>M</span>
                                                </div>
                                            ) : (
                                                <span className={member.kills ? 'text-[#f56565]' : theme.textMuted}>
                                                    {member.kills ? formatPower(member.kills) : '-'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {editingId === member.id ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <input
                                                        type="text"
                                                        value={editValues.t4t5KillsM}
                                                        onChange={(e) => setEditValues({ ...editValues, t4t5KillsM: e.target.value })}
                                                        className={`w-24 px-2 py-1 rounded border ${theme.input} text-right`}
                                                        placeholder="T4/T5"
                                                    />
                                                    <span className={`text-xs ${theme.textMuted}`}>M</span>
                                                </div>
                                            ) : (
                                                <span className={(member.t4_kills || member.t5_kills) ? 'text-[#ed8936]' : theme.textMuted}>
                                                    {(member.t4_kills || member.t5_kills)
                                                        ? `${formatPower(member.t4_kills || 0)} / ${formatPower(member.t5_kills || 0)}`
                                                        : '-'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {(() => {
                                                const stats = eventStats.get(member.name);
                                                if (!stats || stats.aoo.totalAssigned === 0) {
                                                    return <span className={theme.textMuted}>-</span>;
                                                }
                                                const teamLabel = stats.aoo.lastTeam === 'Team 1' ? 'T1' : stats.aoo.lastTeam === 'Team 2' ? 'T2' : '-';
                                                return (
                                                    <span className="text-[#4318ff]">
                                                        {teamLabel} ({stats.aoo.participatedCount}/{stats.aoo.totalAssigned})
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {(() => {
                                                const stats = eventStats.get(member.name);
                                                if (!stats || stats.mobilization.lastScore === null) {
                                                    return <span className={theme.textMuted}>-</span>;
                                                }
                                                const turnedIn = stats.mobilization.lastTurnedIn;
                                                const accepted = stats.mobilization.lastAccepted;
                                                return (
                                                    <span className="text-[#01b574]">
                                                        {formatPower(stats.mobilization.lastScore)}
                                                        {turnedIn !== null && accepted !== null && (
                                                            <span className="text-[var(--text-muted)] text-xs ml-1">
                                                                ({turnedIn}/{accepted})
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {member.role && (
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                    member.role === 'R5' ? 'bg-amber-500/20 text-amber-500' :
                                                    member.role === 'R4' ? 'bg-purple-500/20 text-purple-500' :
                                                    member.role === 'R3' ? 'bg-blue-500/20 text-blue-500' :
                                                    member.role === 'R2' ? 'bg-green-500/20 text-green-500' :
                                                    'bg-[var(--background-secondary)] text-[var(--text-muted)]'
                                                }`}>
                                                    {member.role}
                                                </span>
                                            )}
                                        </td>
                                        {isEditor && (
                                            <td className="px-4 py-3">
                                                {editingId === member.id ? (
                                                    <input
                                                        type="text"
                                                        value={editValues.notes}
                                                        onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                                                        className={`w-full px-2 py-1 rounded border ${theme.input}`}
                                                        placeholder="Add notes..."
                                                    />
                                                ) : (
                                                    <span className={`text-sm ${member.notes ? theme.text : theme.textMuted}`}>
                                                        {member.notes || '-'}
                                                    </span>
                                                )}
                                            </td>
                                        )}
                                        {isEditor && (
                                            <td className="px-4 py-3 text-center">
                                                {editingId === member.id ? (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={saveEditing}
                                                            className="p-1.5 rounded hover:bg-green-500/20 text-green-500"
                                                            title="Save"
                                                        >
                                                            <Save className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={cancelEditing}
                                                            className="p-1.5 rounded hover:bg-red-500/20 text-red-500"
                                                            title="Cancel"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => startEditing(member)}
                                                        className={`p-1.5 rounded hover:bg-[var(--background-secondary)] ${theme.textMuted}`}
                                                        title="Edit"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredRoster.length === 0 && (
                        <div className="py-12 text-center">
                            <p className={theme.textMuted}>No members found</p>
                        </div>
                    )}
                </div>
                    </>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                    <div className="space-y-6">
                        {historyLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-5 h-5 border-2 border-[#4318ff] border-t-transparent rounded-full animate-spin"></div>
                                <span className={`ml-3 ${theme.textMuted}`}>Loading history...</span>
                            </div>
                        ) : dailyTotals.length === 0 ? (
                            <div className={`${theme.card} border rounded-xl p-8 text-center`}>
                                <History className="w-12 h-12 mx-auto mb-4 text-[#4318ff]/50" />
                                <h3 className="text-lg font-semibold mb-2">No Historical Data Yet</h3>
                                <p className={`text-sm ${theme.textMuted} mb-4`}>
                                    Start tracking by importing roster data or clicking "Lock Today" to create your first snapshot.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Power & KP Charts - Simple Bar Visualization */}
                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* Total Power Over Time */}
                                    <div className={`${theme.card} border rounded-xl p-4`}>
                                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-[#01b574]" />
                                            Total Power Over Time
                                        </h3>
                                        <div className="space-y-2">
                                            {dailyTotals.slice(-10).map((day, idx) => {
                                                const maxPower = Math.max(...dailyTotals.map(d => d.total_power));
                                                const pct = (day.total_power / maxPower) * 100;
                                                return (
                                                    <div key={day.snapshot_date} className="flex items-center gap-2">
                                                        <span className={`text-xs ${theme.textMuted} w-16`}>{formatDate(day.snapshot_date)}</span>
                                                        <div className="flex-1 h-6 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-[#01b574] to-[#01b574]/50 rounded"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-sm font-medium w-16 text-right">{formatPower(day.total_power)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Total KP Over Time */}
                                    <div className={`${theme.card} border rounded-xl p-4`}>
                                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-[#f56565]" />
                                            Total Kill Points Over Time
                                        </h3>
                                        <div className="space-y-2">
                                            {dailyTotals.slice(-10).map((day, idx) => {
                                                const maxKills = Math.max(...dailyTotals.map(d => d.total_kills || 1));
                                                const pct = ((day.total_kills || 0) / maxKills) * 100;
                                                return (
                                                    <div key={day.snapshot_date} className="flex items-center gap-2">
                                                        <span className={`text-xs ${theme.textMuted} w-16`}>{formatDate(day.snapshot_date)}</span>
                                                        <div className="flex-1 h-6 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-[#f56565] to-[#f56565]/50 rounded"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-sm font-medium w-16 text-right">{formatPower(day.total_kills || 0)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Member Count Over Time */}
                                <div className={`${theme.card} border rounded-xl p-4`}>
                                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-[#9f7aea]" />
                                        Member Count Over Time
                                    </h3>
                                    <div className="flex flex-wrap gap-3">
                                        {dailyTotals.slice(-15).map((day) => (
                                            <div key={day.snapshot_date} className="text-center">
                                                <div className="text-2xl font-bold text-[#9f7aea]">{day.member_count}</div>
                                                <div className={`text-xs ${theme.textMuted}`}>{formatDate(day.snapshot_date)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Alliance Mobilization Event Growth */}
                                {(() => {
                                    const membersWithGrowth = roster
                                        .filter(m => !tagFilter || (m.tags && m.tags.includes(tagFilter)))
                                        .map(m => {
                                            const stats = eventStats.get(m.name);
                                            return {
                                                name: m.name,
                                                tags: m.tags,
                                                growth: stats?.mobilization.growth ?? null,
                                                growthPercent: stats?.mobilization.growthPercent ?? null,
                                                lastScore: stats?.mobilization.lastScore ?? null,
                                                previousScore: stats?.mobilization.previousScore ?? null,
                                                lastTurnedIn: stats?.mobilization.lastTurnedIn ?? null,
                                                lastAccepted: stats?.mobilization.lastAccepted ?? null,
                                                lastDate: stats?.mobilization.lastDate ?? null,
                                                previousDate: stats?.mobilization.previousDate ?? null,
                                            };
                                        })
                                        .filter(m => m.growth !== null)
                                        .sort((a, b) => {
                                            const { field, direction } = growthSort;
                                            const multiplier = direction === 'asc' ? 1 : -1;
                                            if (field === 'name') {
                                                return multiplier * a.name.localeCompare(b.name);
                                            }
                                            const aVal = a[field] ?? 0;
                                            const bVal = b[field] ?? 0;
                                            return multiplier * (aVal - bVal);
                                        });

                                    if (membersWithGrowth.length === 0) return null;

                                    const displayMembers = showAllGrowth ? membersWithGrowth : membersWithGrowth.slice(0, 10);
                                    const date1 = membersWithGrowth[0]?.previousDate ? formatDate(membersWithGrowth[0].previousDate) : 'T1';
                                    const date2 = membersWithGrowth[0]?.lastDate ? formatDate(membersWithGrowth[0].lastDate) : 'T2';

                                    const handleGrowthSort = (field: typeof growthSort.field) => {
                                        setGrowthSort(prev => ({
                                            field,
                                            direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
                                        }));
                                    };

                                    const GrowthSortIcon = ({ field }: { field: typeof growthSort.field }) => {
                                        if (growthSort.field !== field) return <span className="opacity-30">↕</span>;
                                        return growthSort.direction === 'asc' ? <span>↑</span> : <span>↓</span>;
                                    };

                                    return (
                                        <div className={`${theme.card} border rounded-xl p-4`}>
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="font-semibold flex items-center gap-2">
                                                    <TrendingUp className="w-4 h-4 text-green-400" />
                                                    Alliance Mobilization Event Growth
                                                </h3>
                                                <button
                                                    onClick={() => setShowAllGrowth(!showAllGrowth)}
                                                    className={`text-xs ${theme.textMuted} hover:text-white transition-colors`}
                                                >
                                                    {showAllGrowth ? 'Show Top 10' : `Show All (${membersWithGrowth.length})`}
                                                </button>
                                            </div>
                                            <div className={`overflow-x-auto ${showAllGrowth ? 'max-h-[500px] overflow-y-auto' : ''}`}>
                                                <table className="w-full text-sm">
                                                    <thead className="sticky top-0 bg-[var(--background-card)]">
                                                        <tr className="border-b border-[var(--border)]">
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>#</th>
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleGrowthSort('name')} className="flex items-center gap-1 hover:text-white">
                                                                    Name <GrowthSortIcon field="name" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleGrowthSort('previousScore')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    <div className="text-right">
                                                                        <div>{date1}</div>
                                                                        <div className="text-[10px] font-normal">Score</div>
                                                                    </div>
                                                                    <GrowthSortIcon field="previousScore" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleGrowthSort('lastScore')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    <div className="text-right">
                                                                        <div>{date2}</div>
                                                                        <div className="text-[10px] font-normal">Score (Tasks)</div>
                                                                    </div>
                                                                    <GrowthSortIcon field="lastScore" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleGrowthSort('growth')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    Growth <GrowthSortIcon field="growth" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleGrowthSort('growthPercent')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    % <GrowthSortIcon field="growthPercent" />
                                                                </button>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {displayMembers.map((member, idx) => (
                                                            <tr key={member.name} className={`border-b border-[var(--border)]/50 ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                                <td className={`px-2 py-2 ${theme.textMuted}`}>{idx + 1}</td>
                                                                <td className="px-2 py-2 font-medium">
                                                                    {member.name}
                                                                    {member.tags?.includes('angmar-og') && (
                                                                        <span className="ml-1.5 px-1 py-0.5 text-[9px] font-semibold rounded bg-amber-500/20 text-amber-400">ANG</span>
                                                                    )}
                                                                    {member.tags?.includes('inactive') && (
                                                                        <span className="ml-1 px-1 py-0.5 text-[9px] font-semibold rounded bg-gray-500/20 text-gray-400">AFK</span>
                                                                    )}
                                                                    {member.tags?.includes('quit') && (
                                                                        <span className="ml-1 px-1 py-0.5 text-[9px] font-semibold rounded bg-red-500/20 text-red-400">QUIT</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-2 py-2 text-right text-[#9f7aea]">
                                                                    {member.previousScore !== null ? formatPower(member.previousScore) : '-'}
                                                                </td>
                                                                <td className="px-2 py-2 text-right text-[#01b574]">
                                                                    {member.lastScore !== null ? formatPower(member.lastScore) : '-'}
                                                                    {member.lastTurnedIn !== null && member.lastAccepted !== null && (
                                                                        <span className={`text-xs ${theme.textMuted} ml-1`}>
                                                                            ({member.lastTurnedIn}/{member.lastAccepted})
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className={`px-2 py-2 text-right font-medium ${(member.growth ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                    {(member.growth ?? 0) >= 0 ? '+' : ''}{formatPower(member.growth ?? 0)}
                                                                </td>
                                                                <td className={`px-2 py-2 text-right ${(member.growthPercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                    {(member.growthPercent ?? 0) >= 0 ? '+' : ''}{member.growthPercent}%
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Member Changes */}
                                {memberChanges.length > 0 && (
                                    <div className={`${theme.card} border rounded-xl p-4`}>
                                        <h3 className="font-semibold mb-4">Member Changes</h3>
                                        <div className="space-y-2">
                                            {memberChanges.map((change, idx) => (
                                                <div key={idx} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                                                    {change.type === 'joined' ? (
                                                        <UserPlus className="w-4 h-4 text-[#01b574]" />
                                                    ) : (
                                                        <UserMinus className="w-4 h-4 text-[#f56565]" />
                                                    )}
                                                    <span className="font-medium">{change.name}</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                                        change.type === 'joined' ? 'bg-[#01b574]/20 text-[#01b574]' : 'bg-[#f56565]/20 text-[#f56565]'
                                                    }`}>
                                                        {change.type}
                                                    </span>
                                                    {change.power && (
                                                        <span className={`text-sm ${theme.textMuted}`}>{formatPower(change.power)}</span>
                                                    )}
                                                    <span className={`text-xs ${theme.textMuted} ml-auto`}>{formatDate(change.date)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Snapshot Dates */}
                                <div className={`${theme.card} border rounded-xl p-4`}>
                                    <h3 className="font-semibold mb-4">Available Snapshots</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {dailyTotals.map((day) => (
                                            <span
                                                key={day.snapshot_date}
                                                className={`px-3 py-1 rounded-full text-xs ${theme.button}`}
                                            >
                                                {formatDate(day.snapshot_date)} ({day.member_count} members)
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Events Tab */}
                {activeTab === 'events' && isEditor && (
                    <div className="space-y-6">
                        <div className={`${theme.card} border rounded-xl p-4`}>
                            <div className="flex flex-wrap items-center gap-4 mb-6">
                                <div>
                                    <label className={`text-xs ${theme.textMuted} block mb-1`}>Event Type</label>
                                    <select
                                        value={eventType}
                                        onChange={(e) => setEventType(e.target.value as 'aoo' | 'mobilization')}
                                        className={`px-3 py-2 rounded-lg border ${theme.input} cursor-pointer`}
                                    >
                                        <option value="aoo">Ark of Osiris (AoO)</option>
                                        <option value="mobilization">Mobilization</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={`text-xs ${theme.textMuted} block mb-1`}>Event Date</label>
                                    <input
                                        type="date"
                                        value={eventDate}
                                        onChange={(e) => setEventDate(e.target.value)}
                                        className={`px-3 py-2 rounded-lg border ${theme.input}`}
                                    />
                                </div>
                                <div className="ml-auto">
                                    <button
                                        onClick={handleSaveEventData}
                                        disabled={eventSaving}
                                        className={`px-4 py-2 rounded-lg font-medium ${theme.buttonPrimary} disabled:opacity-50 flex items-center gap-2`}
                                    >
                                        {eventSaving ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" />
                                                Save Event Data
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* AoO Bulk Assign */}
                            {eventType === 'aoo' && (
                                <div className="mb-4 flex flex-wrap gap-2">
                                    <button
                                        onClick={() => {
                                            const updated = new Map(eventEntries);
                                            roster.forEach(m => {
                                                const entry = updated.get(m.name);
                                                if (entry) {
                                                    updated.set(m.name, { ...entry, team: 'Team 1', participated: true });
                                                }
                                            });
                                            setEventEntries(updated);
                                        }}
                                        className={`px-3 py-1.5 rounded text-xs font-medium ${theme.button}`}
                                    >
                                        All Team 1
                                    </button>
                                    <button
                                        onClick={() => {
                                            const updated = new Map(eventEntries);
                                            roster.forEach(m => {
                                                const entry = updated.get(m.name);
                                                if (entry) {
                                                    updated.set(m.name, { ...entry, team: 'Team 2', participated: true });
                                                }
                                            });
                                            setEventEntries(updated);
                                        }}
                                        className={`px-3 py-1.5 rounded text-xs font-medium ${theme.button}`}
                                    >
                                        All Team 2
                                    </button>
                                    <button
                                        onClick={() => {
                                            const updated = new Map(eventEntries);
                                            roster.forEach(m => {
                                                updated.set(m.name, { team: null, participated: false, score: '' });
                                            });
                                            setEventEntries(updated);
                                        }}
                                        className={`px-3 py-1.5 rounded text-xs font-medium ${theme.button}`}
                                    >
                                        Clear All
                                    </button>
                                </div>
                            )}

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-[var(--border)]">
                                            <th className={`text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>Name</th>
                                            <th className={`text-center px-4 py-2 text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>Power</th>
                                            {eventType === 'aoo' ? (
                                                <>
                                                    <th className={`text-center px-4 py-2 text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>Team</th>
                                                    <th className={`text-center px-4 py-2 text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>Participated</th>
                                                </>
                                            ) : (
                                                <th className={`text-center px-4 py-2 text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>Score (K)</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {roster.map((member, idx) => {
                                            const entry = eventEntries.get(member.name) || { team: null, participated: false, score: '' };
                                            return (
                                                <tr key={member.id} className={`border-b border-[var(--border)] ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                    <td className="px-4 py-2 font-medium">{member.name}</td>
                                                    <td className="px-4 py-2 text-center text-[#01b574]">{formatPower(member.power)}</td>
                                                    {eventType === 'aoo' ? (
                                                        <>
                                                            <td className="px-4 py-2 text-center">
                                                                <select
                                                                    value={entry.team || ''}
                                                                    onChange={(e) => {
                                                                        const updated = new Map(eventEntries);
                                                                        const teamVal = e.target.value as 'Team 1' | 'Team 2' | '';
                                                                        updated.set(member.name, {
                                                                            ...entry,
                                                                            team: teamVal === '' ? null : teamVal,
                                                                            participated: teamVal !== '' ? true : false,
                                                                        });
                                                                        setEventEntries(updated);
                                                                    }}
                                                                    className={`px-2 py-1 rounded border ${theme.input} text-sm cursor-pointer`}
                                                                >
                                                                    <option value="">--</option>
                                                                    <option value="Team 1">Team 1</option>
                                                                    <option value="Team 2">Team 2</option>
                                                                </select>
                                                            </td>
                                                            <td className="px-4 py-2 text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={entry.participated}
                                                                    disabled={!entry.team}
                                                                    onChange={(e) => {
                                                                        const updated = new Map(eventEntries);
                                                                        updated.set(member.name, { ...entry, participated: e.target.checked });
                                                                        setEventEntries(updated);
                                                                    }}
                                                                    className="w-4 h-4 rounded border-[var(--border)] cursor-pointer"
                                                                />
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <td className="px-4 py-2 text-center">
                                                            <input
                                                                type="number"
                                                                value={entry.score}
                                                                onChange={(e) => {
                                                                    const updated = new Map(eventEntries);
                                                                    updated.set(member.name, { ...entry, score: e.target.value });
                                                                    setEventEntries(updated);
                                                                }}
                                                                className={`w-24 px-2 py-1 rounded border ${theme.input} text-center`}
                                                                placeholder="0"
                                                            />
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Analytics Tab */}
                {activeTab === 'analytics' && (
                    <div className="space-y-6">
                        {(() => {
                            // Apply tag filter to roster for analytics
                            const analyticsRoster = roster.filter(m => !tagFilter || (m.tags && m.tags.includes(tagFilter)));

                            // Calculate activity scores
                            const activityScores = calculateActivityScores(analyticsRoster, eventStats, activityWeights);
                            const scoresArray = Array.from(activityScores.entries())
                                .map(([name, data]) => ({ name, tags: analyticsRoster.find(m => m.name === name)?.tags, ...data }))
                                .sort((a, b) => b.score - a.score);

                            // Summary statistics
                            const membersWithAoO = analyticsRoster.filter(m => {
                                const stats = eventStats.get(m.name);
                                return stats?.aoo.totalAssigned && stats.aoo.totalAssigned > 0;
                            });
                            const avgAoORate = membersWithAoO.length > 0
                                ? membersWithAoO.reduce((sum, m) => {
                                    const stats = eventStats.get(m.name);
                                    return sum + (stats?.aoo.participatedCount || 0) / (stats?.aoo.totalAssigned || 1) * 100;
                                }, 0) / membersWithAoO.length
                                : 0;

                            const membersWithMob = analyticsRoster.filter(m => {
                                const stats = eventStats.get(m.name);
                                return stats?.mobilization.lastScore && stats.mobilization.lastScore > 0;
                            });
                            const avgMobScore = membersWithMob.length > 0
                                ? membersWithMob.reduce((sum, m) => {
                                    const stats = eventStats.get(m.name);
                                    return sum + (stats?.mobilization.lastScore || 0);
                                }, 0) / membersWithMob.length
                                : 0;

                            const activeMembers = scoresArray.filter(s => s.score >= 30).length;

                            // Participation distribution
                            const aooDistribution = [
                                { label: '100%', count: 0, color: '#01b574' },
                                { label: '80-99%', count: 0, color: '#4ade80' },
                                { label: '60-79%', count: 0, color: '#fbbf24' },
                                { label: '40-59%', count: 0, color: '#fb923c' },
                                { label: '<40%', count: 0, color: '#f56565' },
                            ];
                            membersWithAoO.forEach(m => {
                                const stats = eventStats.get(m.name);
                                const rate = (stats?.aoo.participatedCount || 0) / (stats?.aoo.totalAssigned || 1) * 100;
                                if (rate === 100) aooDistribution[0].count++;
                                else if (rate >= 80) aooDistribution[1].count++;
                                else if (rate >= 60) aooDistribution[2].count++;
                                else if (rate >= 40) aooDistribution[3].count++;
                                else aooDistribution[4].count++;
                            });
                            const maxAoOCount = Math.max(...aooDistribution.map(d => d.count), 1);

                            // Mobilization score distribution
                            const mobDistribution = [
                                { label: '5K+', count: 0, color: '#01b574' },
                                { label: '2-5K', count: 0, color: '#4ade80' },
                                { label: '1-2K', count: 0, color: '#fbbf24' },
                                { label: '<1K', count: 0, color: '#fb923c' },
                            ];
                            membersWithMob.forEach(m => {
                                const stats = eventStats.get(m.name);
                                const score = stats?.mobilization.lastScore || 0;
                                if (score >= 5000) mobDistribution[0].count++;
                                else if (score >= 2000) mobDistribution[1].count++;
                                else if (score >= 1000) mobDistribution[2].count++;
                                else mobDistribution[3].count++;
                            });
                            const maxMobCount = Math.max(...mobDistribution.map(d => d.count), 1);

                            // Low activity members (score < 30)
                            const lowActivityMembers = scoresArray.filter(s => s.score < 30).slice(0, 15);

                            return (
                                <>
                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className={`${theme.card} border rounded-xl p-4`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Users className="w-5 h-5 text-[#4318ff]" />
                                                <span className={`text-sm ${theme.textMuted}`}>Active Members</span>
                                            </div>
                                            <div className="text-2xl font-bold">{activeMembers}/{analyticsRoster.length}</div>
                                            <div className={`text-xs ${theme.textMuted}`}>
                                                {((activeMembers / analyticsRoster.length) * 100).toFixed(1)}% of {tagFilter ? 'filtered' : 'roster'} (score ≥30)
                                            </div>
                                        </div>
                                        <div className={`${theme.card} border rounded-xl p-4`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Trophy className="w-5 h-5 text-[#01b574]" />
                                                <span className={`text-sm ${theme.textMuted}`}>Avg AoO Rate</span>
                                            </div>
                                            <div className="text-2xl font-bold text-[#01b574]">{avgAoORate.toFixed(0)}%</div>
                                            <div className={`text-xs ${theme.textMuted}`}>
                                                across {membersWithAoO.length} assigned members
                                            </div>
                                        </div>
                                        <div className={`${theme.card} border rounded-xl p-4`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <TrendingUp className="w-5 h-5 text-[#9f7aea]" />
                                                <span className={`text-sm ${theme.textMuted}`}>Avg Mob Score</span>
                                            </div>
                                            <div className="text-2xl font-bold text-[#9f7aea]">{formatPower(avgMobScore)}</div>
                                            <div className={`text-xs ${theme.textMuted}`}>
                                                per participating member
                                            </div>
                                        </div>
                                    </div>

                                    {/* Score Calculation Explanation */}
                                    <div className={`${theme.card} border rounded-xl p-4`}>
                                        <h3 className="font-semibold mb-3 flex items-center justify-between">
                                            <span className="flex items-center gap-2">
                                                <BarChart3 className="w-4 h-4 text-[#9f7aea]" />
                                                How Activity Score is Calculated
                                                {isEditor && (
                                                    <span className="text-xs font-normal text-[#9f7aea] ml-2">(Editing weights)</span>
                                                )}
                                            </span>
                                            {!isEditor && (
                                                <button
                                                    onClick={() => setShowPasswordPrompt(true)}
                                                    className={`text-xs font-normal ${theme.textMuted} hover:text-[#9f7aea] transition-colors flex items-center gap-1`}
                                                >
                                                    <Edit2 className="w-3 h-3" />
                                                    Adjust weights
                                                </button>
                                            )}
                                        </h3>
                                        <p className={`text-sm ${theme.textMuted} mb-3`}>
                                            The activity score (0-100) combines multiple metrics to measure overall engagement:
                                            {isEditor && (
                                                <span className={`block mt-1 text-xs ${
                                                    (activityWeights.kp + activityWeights.power + activityWeights.aoo + activityWeights.mob) === 100
                                                        ? 'text-[#01b574]'
                                                        : 'text-[#f56565]'
                                                }`}>
                                                    Total: {activityWeights.kp + activityWeights.power + activityWeights.aoo + activityWeights.mob}%
                                                    {(activityWeights.kp + activityWeights.power + activityWeights.aoo + activityWeights.mob) !== 100 && ' (must equal 100%)'}
                                                </span>
                                            )}
                                        </p>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="p-3 rounded-lg bg-[var(--background-secondary)]">
                                                {isEditor ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={activityWeights.kp}
                                                            onChange={(e) => setActivityWeights(prev => ({
                                                                ...prev,
                                                                kp: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                            }))}
                                                            className="w-14 text-lg font-bold text-[#f56565] bg-transparent border border-[#f56565]/30 rounded px-1 text-center"
                                                        />
                                                        <span className="text-lg font-bold text-[#f56565]">%</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-lg font-bold text-[#f56565]">{activityWeights.kp}%</div>
                                                )}
                                                <div className={`text-xs ${theme.textMuted}`}>Kill Points</div>
                                                <div className={`text-[10px] ${theme.textMuted} mt-1`}>Percentile vs other members</div>
                                            </div>
                                            <div className="p-3 rounded-lg bg-[var(--background-secondary)]">
                                                {isEditor ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={activityWeights.power}
                                                            onChange={(e) => setActivityWeights(prev => ({
                                                                ...prev,
                                                                power: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                            }))}
                                                            className="w-14 text-lg font-bold text-[#4318ff] bg-transparent border border-[#4318ff]/30 rounded px-1 text-center"
                                                        />
                                                        <span className="text-lg font-bold text-[#4318ff]">%</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-lg font-bold text-[#4318ff]">{activityWeights.power}%</div>
                                                )}
                                                <div className={`text-xs ${theme.textMuted}`}>Power Level</div>
                                                <div className={`text-[10px] ${theme.textMuted} mt-1`}>Percentile vs other members</div>
                                            </div>
                                            <div className="p-3 rounded-lg bg-[var(--background-secondary)]">
                                                {isEditor ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={activityWeights.aoo}
                                                            onChange={(e) => setActivityWeights(prev => ({
                                                                ...prev,
                                                                aoo: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                            }))}
                                                            className="w-14 text-lg font-bold text-[#01b574] bg-transparent border border-[#01b574]/30 rounded px-1 text-center"
                                                        />
                                                        <span className="text-lg font-bold text-[#01b574]">%</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-lg font-bold text-[#01b574]">{activityWeights.aoo}%</div>
                                                )}
                                                <div className={`text-xs ${theme.textMuted}`}>AoO Participation</div>
                                                <div className={`text-[10px] ${theme.textMuted} mt-1`}>% of assigned events attended</div>
                                            </div>
                                            <div className="p-3 rounded-lg bg-[var(--background-secondary)]">
                                                {isEditor ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={activityWeights.mob}
                                                            onChange={(e) => setActivityWeights(prev => ({
                                                                ...prev,
                                                                mob: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                            }))}
                                                            className="w-14 text-lg font-bold text-[#9f7aea] bg-transparent border border-[#9f7aea]/30 rounded px-1 text-center"
                                                        />
                                                        <span className="text-lg font-bold text-[#9f7aea]">%</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-lg font-bold text-[#9f7aea]">{activityWeights.mob}%</div>
                                                )}
                                                <div className={`text-xs ${theme.textMuted}`}>Mobilization Score</div>
                                                <div className={`text-[10px] ${theme.textMuted} mt-1`}>Percentile vs other members</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Activity Leaderboard */}
                                    <div className={`${theme.card} border rounded-xl p-4`}>
                                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                                            <BarChart3 className="w-4 h-4 text-[#4318ff]" />
                                            Activity Leaderboard (Top 20)
                                        </h3>
                                        <div className="space-y-2">
                                            {scoresArray.slice(0, 20).map((member, idx) => (
                                                <div key={member.name} className="flex items-center gap-2">
                                                    <span className={`text-xs ${theme.textMuted} w-6 text-right`}>{idx + 1}.</span>
                                                    <span className="w-40 truncate text-sm font-medium">
                                                        {member.name}
                                                        {member.tags?.includes('angmar-og') && (
                                                            <span className="ml-1 px-1 py-0.5 text-[8px] font-semibold rounded bg-amber-500/20 text-amber-400">ANG</span>
                                                        )}
                                                        {member.tags?.includes('inactive') && (
                                                            <span className="ml-0.5 px-1 py-0.5 text-[8px] font-semibold rounded bg-gray-500/20 text-gray-400">AFK</span>
                                                        )}
                                                        {member.tags?.includes('quit') && (
                                                            <span className="ml-0.5 px-1 py-0.5 text-[8px] font-semibold rounded bg-red-500/20 text-red-400">QUIT</span>
                                                        )}
                                                    </span>
                                                    <div className="flex-1 h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                        <div
                                                            className="h-full rounded transition-all"
                                                            style={{
                                                                width: `${member.score}%`,
                                                                background: member.score >= 70
                                                                    ? 'linear-gradient(90deg, #01b574, #4ade80)'
                                                                    : member.score >= 40
                                                                        ? 'linear-gradient(90deg, #fbbf24, #fb923c)'
                                                                        : 'linear-gradient(90deg, #f56565, #ef4444)'
                                                            }}
                                                        />
                                                    </div>
                                                    <span className={`text-sm font-medium w-8 text-right ${
                                                        member.score >= 70 ? 'text-[#01b574]' :
                                                            member.score >= 40 ? 'text-[#fbbf24]' : 'text-[#f56565]'
                                                    }`}>{member.score}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Participation Breakdown */}
                                    <div className="grid md:grid-cols-2 gap-6">
                                        {/* AoO Participation Distribution */}
                                        <div className={`${theme.card} border rounded-xl p-4`}>
                                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                                <Trophy className="w-4 h-4 text-[#01b574]" />
                                                AoO Participation Rates
                                            </h3>
                                            {membersWithAoO.length === 0 ? (
                                                <p className={`text-sm ${theme.textMuted}`}>No AoO data yet</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {aooDistribution.map(bucket => (
                                                        <div key={bucket.label} className="flex items-center gap-2">
                                                            <span className={`text-xs ${theme.textMuted} w-16`}>{bucket.label}</span>
                                                            <div className="flex-1 h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                                <div
                                                                    className="h-full rounded"
                                                                    style={{
                                                                        width: `${(bucket.count / maxAoOCount) * 100}%`,
                                                                        backgroundColor: bucket.color,
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-sm font-medium w-16 text-right">{bucket.count} members</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Mobilization Score Distribution */}
                                        <div className={`${theme.card} border rounded-xl p-4`}>
                                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                                <TrendingUp className="w-4 h-4 text-[#9f7aea]" />
                                                Mobilization Rankings
                                            </h3>
                                            {membersWithMob.length === 0 ? (
                                                <p className={`text-sm ${theme.textMuted}`}>No mobilization data yet</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {mobDistribution.map(bucket => (
                                                        <div key={bucket.label} className="flex items-center gap-2">
                                                            <span className={`text-xs ${theme.textMuted} w-16`}>{bucket.label}</span>
                                                            <div className="flex-1 h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                                <div
                                                                    className="h-full rounded"
                                                                    style={{
                                                                        width: `${(bucket.count / maxMobCount) * 100}%`,
                                                                        backgroundColor: bucket.color,
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-sm font-medium w-16 text-right">{bucket.count} members</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Low Activity Warning */}
                                    {lowActivityMembers.length > 0 && (
                                        <div className={`${theme.card} border border-[#f56565]/30 rounded-xl p-4`}>
                                            <h3 className="font-semibold mb-4 flex items-center gap-2 text-[#f56565]">
                                                <AlertTriangle className="w-4 h-4" />
                                                Low Activity Warning (Score &lt; 30)
                                            </h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead>
                                                        <tr className="border-b border-[var(--border)]">
                                                            <th className={`text-left px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>Name</th>
                                                            <th className={`text-center px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>AoO Rate</th>
                                                            <th className={`text-center px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>Last Mob</th>
                                                            <th className={`text-center px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>Score</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {lowActivityMembers.map((member, idx) => {
                                                            const stats = eventStats.get(member.name);
                                                            const aooRate = stats?.aoo.totalAssigned
                                                                ? Math.round((stats.aoo.participatedCount / stats.aoo.totalAssigned) * 100)
                                                                : null;
                                                            const mobScore = stats?.mobilization.lastScore;
                                                            return (
                                                                <tr key={member.name} className={`border-b border-[var(--border)] ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                                    <td className="px-3 py-2 font-medium">
                                                                        {member.name}
                                                                        {member.tags?.includes('angmar-og') && (
                                                                            <span className="ml-1 px-1 py-0.5 text-[8px] font-semibold rounded bg-amber-500/20 text-amber-400">ANG</span>
                                                                        )}
                                                                        {member.tags?.includes('inactive') && (
                                                                            <span className="ml-0.5 px-1 py-0.5 text-[8px] font-semibold rounded bg-gray-500/20 text-gray-400">AFK</span>
                                                                        )}
                                                                        {member.tags?.includes('quit') && (
                                                                            <span className="ml-0.5 px-1 py-0.5 text-[8px] font-semibold rounded bg-red-500/20 text-red-400">QUIT</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-center">
                                                                        {aooRate !== null ? `${aooRate}%` : <span className={theme.textMuted}>--</span>}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-center">
                                                                        {mobScore ? formatPower(mobScore) : <span className={theme.textMuted}>Never</span>}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-center text-[#f56565] font-medium">{member.score}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {scoresArray.filter(s => s.score < 30).length > 15 && (
                                                <p className={`text-xs ${theme.textMuted} mt-2 text-center`}>
                                                    Showing 15 of {scoresArray.filter(s => s.score < 30).length} low activity members
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                )}

                <footer className={`mt-8 pt-4 border-t ${theme.border} text-center`}>
                    <p className={`text-xs ${theme.textMuted}`}>Angmar Nazgul Guards - Rise of Kingdoms</p>
                    <p className={`text-[10px] ${theme.textMuted} mt-1 opacity-50`}>
                        Use CSV import to update roster data
                    </p>
                </footer>
            </div>
        </div>
    );
}
