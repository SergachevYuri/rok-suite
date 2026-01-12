'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatPower } from '@/lib/supabase/use-alliance-roster';
import { createSnapshot, useRosterSnapshots, formatDate, getKpGrowth, getPowerGrowth, type DailyTotals, type MemberChange, type KpGrowth, type PowerGrowth } from '@/lib/supabase/use-roster-snapshots';
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
    honor_points: number;
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
    honor: 'Honor points earned in Ark of Osiris',
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
    honorPercentile: number; // 0-100 percentile
}

interface MemberActivityScore {
    score: number;
    breakdown: ActivityBreakdown;
}

// Activity weights interface
interface ActivityWeights {
    kp: number;
    power: number;
    honor: number;
    aoo: number;
    mob: number;
}

// Calculate activity scores for all members
function calculateActivityScores(
    roster: RosterMember[],
    eventStats: Map<string, MemberEventStats>,
    weights: ActivityWeights = { kp: 50, power: 20, honor: 10, aoo: 10, mob: 10 }
): Map<string, MemberActivityScore> {
    const scores = new Map<string, MemberActivityScore>();

    // Get sorted arrays for percentile calculations
    const mobScores = roster
        .map(m => eventStats.get(m.name)?.mobilization.lastScore ?? 0)
        .sort((a, b) => a - b);
    const kpValues = roster.map(m => m.kills || 0).sort((a, b) => a - b);
    const powerValues = roster.map(m => m.power).sort((a, b) => a - b);
    const honorValues = roster.map(m => m.honor_points || 0).sort((a, b) => a - b);

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
        honor: weights.honor / 100,
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

        // Honor points percentile
        const honorPercentile = getPercentile(member.honor_points || 0, honorValues);

        // Calculate weighted score
        const score = Math.round(
            w.aoo * aooRate +
            w.mob * mobPercentile +
            w.kp * kpPercentile +
            w.power * powerPercentile +
            w.honor * honorPercentile
        );

        scores.set(member.name, {
            score,
            breakdown: {
                aooRate,
                mobPercentile,
                kpPercentile,
                powerPercentile,
                honorPercentile,
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

    // Editing state - kills/power stored as string for decimal input (millions)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<{ powerM: string; killsM: string; t4t5KillsM: string; honor: string; notes: string }>({ powerM: '', killsM: '', t4t5KillsM: '', honor: '', notes: '' });

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
    const [activityWeights, setActivityWeights] = useState({ kp: 50, power: 20, honor: 10, aoo: 10, mob: 10 });

    // Mobilization growth expanded state
    const [showAllGrowth, setShowAllGrowth] = useState(false);
    // Growth table sorting
    const [growthSort, setGrowthSort] = useState<{ field: 'name' | 'previousScore' | 'lastScore' | 'growth' | 'growthPercent'; direction: 'asc' | 'desc' }>({ field: 'growth', direction: 'desc' });
    // KP growth expanded state and sorting
    const [showAllKpGrowth, setShowAllKpGrowth] = useState(false);
    const [kpGrowthSort, setKpGrowthSort] = useState<{ field: 'name' | 'kpGrowth' | 't4Growth' | 't5Growth'; direction: 'asc' | 'desc' }>({ field: 'kpGrowth', direction: 'desc' });
    const [kpGrowthData, setKpGrowthData] = useState<KpGrowth[]>([]);
    const [powerGrowthData, setPowerGrowthData] = useState<PowerGrowth[]>([]);

    // Hover card state
    const [hoveredMember, setHoveredMember] = useState<string | null>(null);
    const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    // Analytics chart hover state
    const [hoveredBucket, setHoveredBucket] = useState<{ type: 'aoo' | 'mob'; label: string } | null>(null);
    const [bucketHoverPosition, setBucketHoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

    // Fetch KP growth data when roster loads
    useEffect(() => {
        if (roster.length > 0) {
            getKpGrowth(roster).then(setKpGrowthData).catch(console.error);
            getPowerGrowth(roster).then(setPowerGrowthData).catch(console.error);
        }
    }, [roster]);

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
        // Convert power to millions for display (e.g., 18543993 -> "18.5")
        const powerM = member.power ? (member.power / 1000000).toFixed(1) : '';
        // Convert kills to millions for display (e.g., 18543993 -> "18.5")
        const killsM = member.kills ? (member.kills / 1000000).toFixed(1) : '';
        // Format T4/T5 as "X/Y" (e.g., "5.2/3.1")
        const t4M = member.t4_kills ? (member.t4_kills / 1000000).toFixed(1) : '0';
        const t5M = member.t5_kills ? (member.t5_kills / 1000000).toFixed(1) : '0';
        const t4t5KillsM = (member.t4_kills || member.t5_kills) ? `${t4M}/${t5M}` : '';
        // Honor points as raw number
        const honor = member.honor_points ? member.honor_points.toString() : '';
        setEditValues({ powerM, killsM, t4t5KillsM, honor, notes: member.notes || '' });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditValues({ powerM: '', killsM: '', t4t5KillsM: '', honor: '', notes: '' });
    };

    const saveEditing = async () => {
        if (!editingId) return;

        try {
            // Convert millions input back to raw number (e.g., "18.5" -> 18500000)
            const powerRaw = editValues.powerM ? Math.round(parseFloat(editValues.powerM) * 1000000) : 0;
            const killsRaw = editValues.killsM ? Math.round(parseFloat(editValues.killsM) * 1000000) : 0;

            // Parse T4/T5 from "X/Y" format (e.g., "5.2/3.1" -> t4=5200000, t5=3100000)
            let t4KillsRaw = 0;
            let t5KillsRaw = 0;
            if (editValues.t4t5KillsM) {
                const parts = editValues.t4t5KillsM.split('/');
                t4KillsRaw = parts[0] ? Math.round(parseFloat(parts[0]) * 1000000) : 0;
                t5KillsRaw = parts[1] ? Math.round(parseFloat(parts[1]) * 1000000) : 0;
            }

            // Honor points as raw number
            const honorRaw = editValues.honor ? parseInt(editValues.honor, 10) || 0 : 0;

            const { error } = await supabase
                .from('alliance_roster')
                .update({
                    power: powerRaw,
                    kills: killsRaw,
                    t4_kills: t4KillsRaw,
                    t5_kills: t5KillsRaw,
                    honor_points: honorRaw,
                    notes: editValues.notes || null
                })
                .eq('id', editingId);

            if (error) throw error;

            setRoster(roster.map(m =>
                m.id === editingId
                    ? { ...m, power: powerRaw, kills: killsRaw, t4_kills: t4KillsRaw, t5_kills: t5KillsRaw, honor_points: honorRaw, notes: editValues.notes || null }
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
                    honor_points: (r as { honor_points?: number }).honor_points || 0,
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
                t4_kills: m.t4_kills || 0,
                t5_kills: m.t5_kills || 0,
                honor_points: m.honor_points || 0,
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

    // Calculate rankings for hover card
    const memberRankings = useMemo(() => {
        const rankings = new Map<string, {
            powerRank: number;
            kpRank: number;
            t4Rank: number;
            t5Rank: number;
            honorRank: number;
            kpGrowthRank: number | null;
            kpGrowthValue: number | null;
            t4GrowthValue: number | null;
            t5GrowthValue: number | null;
            powerGrowthRank: number | null;
            powerGrowthValue: number | null;
        }>();

        // Sort by each metric to get rankings
        const byPower = [...roster].sort((a, b) => b.power - a.power);
        const byKp = [...roster].sort((a, b) => (b.kills || 0) - (a.kills || 0));
        const byT4 = [...roster].sort((a, b) => (b.t4_kills || 0) - (a.t4_kills || 0));
        const byT5 = [...roster].sort((a, b) => (b.t5_kills || 0) - (a.t5_kills || 0));
        const byHonor = [...roster].sort((a, b) => (b.honor_points || 0) - (a.honor_points || 0));

        // Sort KP growth data
        const sortedKpGrowth = [...kpGrowthData].sort((a, b) => b.kpGrowth - a.kpGrowth);
        const kpGrowthMap = new Map(sortedKpGrowth.map((g, i) => [g.name, { rank: i + 1, growth: g.kpGrowth, t4Growth: g.t4Growth, t5Growth: g.t5Growth }]));

        // Sort Power growth data
        const sortedPowerGrowth = [...powerGrowthData].sort((a, b) => b.powerGrowth - a.powerGrowth);
        const powerGrowthMap = new Map(sortedPowerGrowth.map((g, i) => [g.name, { rank: i + 1, growth: g.powerGrowth }]));

        roster.forEach(member => {
            const kpGrowthInfo = kpGrowthMap.get(member.name);
            const powerGrowthInfo = powerGrowthMap.get(member.name);
            rankings.set(member.name, {
                powerRank: byPower.findIndex(m => m.name === member.name) + 1,
                kpRank: byKp.findIndex(m => m.name === member.name) + 1,
                t4Rank: byT4.findIndex(m => m.name === member.name) + 1,
                t5Rank: byT5.findIndex(m => m.name === member.name) + 1,
                honorRank: byHonor.findIndex(m => m.name === member.name) + 1,
                kpGrowthRank: kpGrowthInfo?.rank ?? null,
                kpGrowthValue: kpGrowthInfo?.growth ?? null,
                t4GrowthValue: kpGrowthInfo?.t4Growth ?? null,
                t5GrowthValue: kpGrowthInfo?.t5Growth ?? null,
                powerGrowthRank: powerGrowthInfo?.rank ?? null,
                powerGrowthValue: powerGrowthInfo?.growth ?? null,
            });
        });

        return rankings;
    }, [roster, kpGrowthData, powerGrowthData]);

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
                                                    t4_kills: m.t4_kills || 0,
                                                    t5_kills: m.t5_kills || 0,
                                                    honor_points: m.honor_points || 0,
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
                                    <th className="text-center px-2 py-3 w-10">
                                        <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>#</span>
                                    </th>
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
                                    <th className="text-right px-4 py-3">
                                        <ColumnTooltip text={COLUMN_TOOLTIPS.honor}>
                                            <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                Honor
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
                                        <td className={`text-center px-2 py-3 text-sm ${theme.textMuted}`}>{idx + 1}</td>
                                        <td className="px-4 py-3 relative">
                                            <span
                                                className="font-medium cursor-pointer hover:text-[#9f7aea] transition-colors"
                                                onMouseEnter={(e) => {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setHoverPosition({ x: rect.right + 10, y: rect.top });
                                                    setHoveredMember(member.name);
                                                }}
                                                onMouseLeave={() => setHoveredMember(null)}
                                            >
                                                {member.name}
                                            </span>
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
                                            {editingId === member.id ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={editValues.powerM}
                                                        onChange={(e) => setEditValues({ ...editValues, powerM: e.target.value })}
                                                        className={`w-20 px-2 py-1 rounded border ${theme.input} text-right`}
                                                        placeholder="0.0"
                                                    />
                                                    <span className={`text-xs ${theme.textMuted}`}>M</span>
                                                </div>
                                            ) : (
                                                <span className="text-[#01b574]">{formatPower(member.power)}</span>
                                            )}
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
                                        <td className="px-4 py-3 text-right">
                                            {editingId === member.id ? (
                                                <input
                                                    type="number"
                                                    value={editValues.honor}
                                                    onChange={(e) => setEditValues({ ...editValues, honor: e.target.value })}
                                                    className={`w-20 px-2 py-1 rounded border ${theme.input} text-right`}
                                                    placeholder="0"
                                                />
                                            ) : (
                                                <span className={member.honor_points ? 'text-[#f6ad55]' : theme.textMuted}>
                                                    {member.honor_points ? member.honor_points.toLocaleString() : '-'}
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

                                    {/* Total Honor Over Time */}
                                    <div className={`${theme.card} border rounded-xl p-4`}>
                                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                                            <Trophy className="w-4 h-4 text-[#fbbf24]" />
                                            Total Honor Points Over Time
                                        </h3>
                                        <div className="space-y-2">
                                            {dailyTotals.slice(-10).map((day) => {
                                                const maxHonor = Math.max(...dailyTotals.map(d => d.total_honor || 1));
                                                const pct = ((day.total_honor || 0) / maxHonor) * 100;
                                                return (
                                                    <div key={day.snapshot_date} className="flex items-center gap-2">
                                                        <span className={`text-xs ${theme.textMuted} w-16`}>{formatDate(day.snapshot_date)}</span>
                                                        <div className="flex-1 h-6 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-[#fbbf24] to-[#fbbf24]/50 rounded"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-sm font-medium w-20 text-right">{(day.total_honor || 0).toLocaleString()}</span>
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
                                                                <td className="px-2 py-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                            {(() => {
                                                                                const maxGrowth = Math.max(...membersWithGrowth.map(m => Math.abs(m.growth ?? 0)));
                                                                                const pct = maxGrowth > 0 ? (Math.abs(member.growth ?? 0) / maxGrowth) * 100 : 0;
                                                                                const isPositive = (member.growth ?? 0) >= 0;
                                                                                return (
                                                                                    <div
                                                                                        className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-green-500 to-green-400' : 'bg-gradient-to-r from-red-500 to-red-400'}`}
                                                                                        style={{ width: `${pct}%` }}
                                                                                    />
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        <span className={`text-right font-medium min-w-[50px] ${(member.growth ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                            {(member.growth ?? 0) >= 0 ? '+' : ''}{formatPower(member.growth ?? 0)}
                                                                        </span>
                                                                    </div>
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

                                {/* KP Growth Table */}
                                {(() => {
                                    if (kpGrowthData.length === 0) return null;

                                    const sortedKpGrowth = [...kpGrowthData]
                                        .filter(m => !tagFilter || roster.find(r => r.name === m.name)?.tags?.includes(tagFilter))
                                        .sort((a, b) => {
                                            const { field, direction } = kpGrowthSort;
                                            const multiplier = direction === 'asc' ? 1 : -1;
                                            if (field === 'name') {
                                                return multiplier * a.name.localeCompare(b.name);
                                            }
                                            return multiplier * ((a[field] ?? 0) - (b[field] ?? 0));
                                        });

                                    const displayKpMembers = showAllKpGrowth ? sortedKpGrowth : sortedKpGrowth.slice(0, 10);
                                    const date1 = kpGrowthData[0]?.previousDate ? formatDate(kpGrowthData[0].previousDate) : 'Previous';
                                    const date2 = kpGrowthData[0]?.currentDate ? formatDate(kpGrowthData[0].currentDate) : 'Current';

                                    const handleKpSort = (field: typeof kpGrowthSort.field) => {
                                        setKpGrowthSort(prev => ({
                                            field,
                                            direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
                                        }));
                                    };

                                    const KpSortIcon = ({ field }: { field: typeof kpGrowthSort.field }) => {
                                        if (kpGrowthSort.field !== field) return <span className="opacity-30">↕</span>;
                                        return kpGrowthSort.direction === 'asc' ? <span>↑</span> : <span>↓</span>;
                                    };

                                    return (
                                        <div className={`${theme.card} border rounded-xl p-4`}>
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="font-semibold flex items-center gap-2">
                                                    <TrendingUp className="w-4 h-4 text-[#f56565]" />
                                                    Kill Points Growth
                                                </h3>
                                                <button
                                                    onClick={() => setShowAllKpGrowth(!showAllKpGrowth)}
                                                    className={`text-xs ${theme.textMuted} hover:text-white transition-colors`}
                                                >
                                                    {showAllKpGrowth ? 'Show Top 10' : `Show All (${sortedKpGrowth.length})`}
                                                </button>
                                            </div>
                                            <div className={`overflow-x-auto ${showAllKpGrowth ? 'max-h-[500px] overflow-y-auto' : ''}`}>
                                                <table className="w-full text-sm">
                                                    <thead className="sticky top-0 bg-[var(--background-card)]">
                                                        <tr className="border-b border-[var(--border)]">
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>#</th>
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleKpSort('name')} className="flex items-center gap-1 hover:text-white">
                                                                    Name <KpSortIcon field="name" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                {date1} KP
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                {date2} KP
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleKpSort('kpGrowth')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    KP Growth <KpSortIcon field="kpGrowth" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleKpSort('t4Growth')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    T4 Growth <KpSortIcon field="t4Growth" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleKpSort('t5Growth')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    T5 Growth <KpSortIcon field="t5Growth" />
                                                                </button>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {displayKpMembers.map((member, idx) => {
                                                            const rosterMember = roster.find(r => r.name === member.name);
                                                            return (
                                                                <tr key={member.name} className={`border-b border-[var(--border)]/50 ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                                    <td className={`px-2 py-2 ${theme.textMuted}`}>{idx + 1}</td>
                                                                    <td className="px-2 py-2 font-medium">
                                                                        {member.name}
                                                                        {rosterMember?.tags?.includes('angmar-og') && (
                                                                            <span className="ml-1.5 px-1 py-0.5 text-[9px] font-semibold rounded bg-amber-500/20 text-amber-400">ANG</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#9f7aea]">
                                                                        {formatPower(member.previousKp)}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#01b574]">
                                                                        {formatPower(member.currentKp)}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                {(() => {
                                                                                    const maxGrowth = Math.max(...sortedKpGrowth.map(m => Math.abs(m.kpGrowth)));
                                                                                    const pct = maxGrowth > 0 ? (Math.abs(member.kpGrowth) / maxGrowth) * 100 : 0;
                                                                                    const isPositive = member.kpGrowth >= 0;
                                                                                    return (
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#f56565] to-[#f56565]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                            <span className={`text-right font-medium min-w-[50px] ${member.kpGrowth >= 0 ? 'text-[#f56565]' : 'text-gray-400'}`}>
                                                                                {member.kpGrowth >= 0 ? '+' : ''}{formatPower(member.kpGrowth)}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right">
                                                                        <span className={member.t4Growth > 0 ? 'text-[#fbbf24]' : 'text-gray-400'}>
                                                                            {member.t4Growth > 0 ? '+' : ''}{formatPower(member.t4Growth)}
                                                                        </span>
                                                                        <span className={`text-xs ${theme.textMuted} ml-1`}>
                                                                            ({formatPower(member.currentT4)})
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right">
                                                                        <span className={member.t5Growth > 0 ? 'text-[#f97316]' : 'text-gray-400'}>
                                                                            {member.t5Growth > 0 ? '+' : ''}{formatPower(member.t5Growth)}
                                                                        </span>
                                                                        <span className={`text-xs ${theme.textMuted} ml-1`}>
                                                                            ({formatPower(member.currentT5)})
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
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

                            // Participation distribution with member names
                            const aooDistribution: { label: string; count: number; color: string; members: { name: string; rate: number }[] }[] = [
                                { label: '100%', count: 0, color: '#01b574', members: [] },
                                { label: '80-99%', count: 0, color: '#4ade80', members: [] },
                                { label: '60-79%', count: 0, color: '#fbbf24', members: [] },
                                { label: '40-59%', count: 0, color: '#fb923c', members: [] },
                                { label: '<40%', count: 0, color: '#f56565', members: [] },
                            ];
                            membersWithAoO.forEach(m => {
                                const stats = eventStats.get(m.name);
                                const rate = (stats?.aoo.participatedCount || 0) / (stats?.aoo.totalAssigned || 1) * 100;
                                const memberInfo = { name: m.name, rate: Math.round(rate) };
                                if (rate === 100) { aooDistribution[0].count++; aooDistribution[0].members.push(memberInfo); }
                                else if (rate >= 80) { aooDistribution[1].count++; aooDistribution[1].members.push(memberInfo); }
                                else if (rate >= 60) { aooDistribution[2].count++; aooDistribution[2].members.push(memberInfo); }
                                else if (rate >= 40) { aooDistribution[3].count++; aooDistribution[3].members.push(memberInfo); }
                                else { aooDistribution[4].count++; aooDistribution[4].members.push(memberInfo); }
                            });
                            // Sort members by rate descending within each bucket
                            aooDistribution.forEach(bucket => bucket.members.sort((a, b) => b.rate - a.rate));
                            const maxAoOCount = Math.max(...aooDistribution.map(d => d.count), 1);

                            // Mobilization score distribution with member names
                            const mobDistribution: { label: string; count: number; color: string; members: { name: string; score: number }[] }[] = [
                                { label: '5K+', count: 0, color: '#01b574', members: [] },
                                { label: '2-5K', count: 0, color: '#4ade80', members: [] },
                                { label: '1-2K', count: 0, color: '#fbbf24', members: [] },
                                { label: '<1K', count: 0, color: '#fb923c', members: [] },
                            ];
                            membersWithMob.forEach(m => {
                                const stats = eventStats.get(m.name);
                                const score = stats?.mobilization.lastScore || 0;
                                const memberInfo = { name: m.name, score };
                                if (score >= 5000) { mobDistribution[0].count++; mobDistribution[0].members.push(memberInfo); }
                                else if (score >= 2000) { mobDistribution[1].count++; mobDistribution[1].members.push(memberInfo); }
                                else if (score >= 1000) { mobDistribution[2].count++; mobDistribution[2].members.push(memberInfo); }
                                else { mobDistribution[3].count++; mobDistribution[3].members.push(memberInfo); }
                            });
                            // Sort members by score descending within each bucket
                            mobDistribution.forEach(bucket => bucket.members.sort((a, b) => b.score - a.score));
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
                                                    (activityWeights.kp + activityWeights.power + activityWeights.honor + activityWeights.aoo + activityWeights.mob) === 100
                                                        ? 'text-[#01b574]'
                                                        : 'text-[#f56565]'
                                                }`}>
                                                    Total: {activityWeights.kp + activityWeights.power + activityWeights.honor + activityWeights.aoo + activityWeights.mob}%
                                                    {(activityWeights.kp + activityWeights.power + activityWeights.honor + activityWeights.aoo + activityWeights.mob) !== 100 && ' (must equal 100%)'}
                                                </span>
                                            )}
                                        </p>
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                                                            value={activityWeights.honor}
                                                            onChange={(e) => setActivityWeights(prev => ({
                                                                ...prev,
                                                                honor: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                            }))}
                                                            className="w-14 text-lg font-bold text-[#f6ad55] bg-transparent border border-[#f6ad55]/30 rounded px-1 text-center"
                                                        />
                                                        <span className="text-lg font-bold text-[#f6ad55]">%</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-lg font-bold text-[#f6ad55]">{activityWeights.honor}%</div>
                                                )}
                                                <div className={`text-xs ${theme.textMuted}`}>Honor Points</div>
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

                                    {/* Activity Leaderboard with Stacked Bars */}
                                    <div className={`${theme.card} border rounded-xl p-4`}>
                                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                                            <BarChart3 className="w-4 h-4 text-[#4318ff]" />
                                            Activity Leaderboard (Top 20)
                                        </h3>
                                        <div className={`text-xs ${theme.textMuted} mb-4 flex items-center gap-4 flex-wrap`}>
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{backgroundColor: '#f56565'}}></span> KP</span>
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{backgroundColor: '#4318ff'}}></span> Power</span>
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{backgroundColor: '#f6ad55'}}></span> Honor</span>
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{backgroundColor: '#01b574'}}></span> AoO</span>
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{backgroundColor: '#9f7aea'}}></span> Mob</span>
                                        </div>
                                        <div className="space-y-2">
                                            {scoresArray.slice(0, 20).map((member, idx) => {
                                                // Calculate each segment width based on weighted contribution
                                                const b = member.breakdown;
                                                const kpContrib = (b.kpPercentile * activityWeights.kp) / 100;
                                                const powerContrib = (b.powerPercentile * activityWeights.power) / 100;
                                                const honorContrib = (b.honorPercentile * activityWeights.honor) / 100;
                                                const aooContrib = (b.aooRate * activityWeights.aoo) / 100;
                                                const mobContrib = (b.mobPercentile * activityWeights.mob) / 100;

                                                return (
                                                    <div
                                                        key={member.name}
                                                        className="flex items-center gap-2 group relative"
                                                    >
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
                                                        <div className="flex-1 h-5 bg-[var(--background-secondary)] rounded overflow-hidden flex">
                                                            {/* Stacked bar segments */}
                                                            <div
                                                                className="h-full transition-all"
                                                                style={{ width: `${kpContrib}%`, backgroundColor: '#f56565' }}
                                                                title={`KP: ${b.kpPercentile.toFixed(0)}%`}
                                                            />
                                                            <div
                                                                className="h-full transition-all"
                                                                style={{ width: `${powerContrib}%`, backgroundColor: '#4318ff' }}
                                                                title={`Power: ${b.powerPercentile.toFixed(0)}%`}
                                                            />
                                                            <div
                                                                className="h-full transition-all"
                                                                style={{ width: `${honorContrib}%`, backgroundColor: '#f6ad55' }}
                                                                title={`Honor: ${b.honorPercentile.toFixed(0)}%`}
                                                            />
                                                            <div
                                                                className="h-full transition-all"
                                                                style={{ width: `${aooContrib}%`, backgroundColor: '#01b574' }}
                                                                title={`AoO: ${b.aooRate.toFixed(0)}%`}
                                                            />
                                                            <div
                                                                className="h-full transition-all"
                                                                style={{ width: `${mobContrib}%`, backgroundColor: '#9f7aea' }}
                                                                title={`Mob: ${b.mobPercentile.toFixed(0)}%`}
                                                            />
                                                        </div>
                                                        <span className={`text-sm font-medium w-8 text-right ${
                                                            member.score >= 70 ? 'text-[#01b574]' :
                                                                member.score >= 40 ? 'text-[#fbbf24]' : 'text-[#f56565]'
                                                        }`}>{member.score}</span>

                                                        {/* Hover tooltip */}
                                                        <div className="absolute left-48 top-full mt-1 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                                                            <div className={`${theme.card} border border-[#4318ff]/30 rounded-lg p-3 shadow-xl w-48`}>
                                                                <div className="font-semibold text-sm mb-2">{member.name}</div>
                                                                <div className="space-y-1 text-xs">
                                                                    <div className="flex justify-between">
                                                                        <span className="flex items-center gap-1">
                                                                            <span className="w-2 h-2 rounded" style={{backgroundColor: '#f56565'}}></span> KP
                                                                        </span>
                                                                        <span className="font-medium">{b.kpPercentile.toFixed(0)}% <span className={theme.textMuted}>({kpContrib.toFixed(1)}pts)</span></span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="flex items-center gap-1">
                                                                            <span className="w-2 h-2 rounded" style={{backgroundColor: '#4318ff'}}></span> Power
                                                                        </span>
                                                                        <span className="font-medium">{b.powerPercentile.toFixed(0)}% <span className={theme.textMuted}>({powerContrib.toFixed(1)}pts)</span></span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="flex items-center gap-1">
                                                                            <span className="w-2 h-2 rounded" style={{backgroundColor: '#f6ad55'}}></span> Honor
                                                                        </span>
                                                                        <span className="font-medium">{b.honorPercentile.toFixed(0)}% <span className={theme.textMuted}>({honorContrib.toFixed(1)}pts)</span></span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="flex items-center gap-1">
                                                                            <span className="w-2 h-2 rounded" style={{backgroundColor: '#01b574'}}></span> AoO
                                                                        </span>
                                                                        <span className="font-medium">{b.aooRate.toFixed(0)}% <span className={theme.textMuted}>({aooContrib.toFixed(1)}pts)</span></span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="flex items-center gap-1">
                                                                            <span className="w-2 h-2 rounded" style={{backgroundColor: '#9f7aea'}}></span> Mob
                                                                        </span>
                                                                        <span className="font-medium">{b.mobPercentile.toFixed(0)}% <span className={theme.textMuted}>({mobContrib.toFixed(1)}pts)</span></span>
                                                                    </div>
                                                                    <div className="border-t border-[var(--border)] pt-1 mt-1 flex justify-between font-semibold">
                                                                        <span>Total</span>
                                                                        <span>{member.score} pts</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Participation Breakdown */}
                                    <div className="grid md:grid-cols-2 gap-6">
                                        {/* AoO Participation Distribution */}
                                        <div className={`${theme.card} border rounded-xl p-4 relative`}>
                                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                                <Trophy className="w-4 h-4 text-[#01b574]" />
                                                AoO Participation Rates
                                            </h3>
                                            {membersWithAoO.length === 0 ? (
                                                <p className={`text-sm ${theme.textMuted}`}>No AoO data yet</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {aooDistribution.map(bucket => (
                                                        <div
                                                            key={bucket.label}
                                                            className="flex items-center gap-2 cursor-pointer group"
                                                            onMouseEnter={(e) => {
                                                                if (bucket.count > 0) {
                                                                    setHoveredBucket({ type: 'aoo', label: bucket.label });
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setBucketHoverPosition({ x: rect.right + 10, y: rect.top });
                                                                }
                                                            }}
                                                            onMouseLeave={() => setHoveredBucket(null)}
                                                        >
                                                            <span className={`text-xs ${theme.textMuted} w-16`}>{bucket.label}</span>
                                                            <div className="flex-1 h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded transition-all ${bucket.count > 0 ? 'group-hover:opacity-80' : ''}`}
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

                                            {/* AoO Hover Card */}
                                            {hoveredBucket?.type === 'aoo' && (() => {
                                                const bucket = aooDistribution.find(b => b.label === hoveredBucket.label);
                                                if (!bucket || bucket.members.length === 0) return null;
                                                // Adjust position to stay within viewport
                                                const cardWidth = 224; // w-56 = 14rem = 224px
                                                const cardHeight = Math.min(bucket.members.length * 24 + 60, 256);
                                                let x = bucketHoverPosition.x;
                                                let y = bucketHoverPosition.y;
                                                if (typeof window !== 'undefined') {
                                                    if (x + cardWidth > window.innerWidth - 20) {
                                                        x = bucketHoverPosition.x - cardWidth - 20;
                                                    }
                                                    if (y + cardHeight > window.innerHeight - 20) {
                                                        y = window.innerHeight - cardHeight - 20;
                                                    }
                                                }
                                                return (
                                                    <div
                                                        className="fixed z-50 pointer-events-none"
                                                        style={{ left: x, top: y }}
                                                    >
                                                        <div className={`${theme.card} border border-[#01b574]/30 rounded-xl p-3 shadow-2xl shadow-[#01b574]/10 w-56 max-h-64 overflow-y-auto`}>
                                                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[var(--border)]">
                                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bucket.color }} />
                                                                <span className="font-semibold text-sm">{bucket.label} Participation</span>
                                                            </div>
                                                            <div className="space-y-1">
                                                                {bucket.members.map(m => (
                                                                    <div key={m.name} className="flex justify-between text-xs">
                                                                        <span className="truncate flex-1">{m.name}</span>
                                                                        <span className={`ml-2 font-medium`} style={{ color: bucket.color }}>{m.rate}%</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Mobilization Score Distribution */}
                                        <div className={`${theme.card} border rounded-xl p-4 relative`}>
                                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                                <TrendingUp className="w-4 h-4 text-[#9f7aea]" />
                                                Mobilization Rankings
                                            </h3>
                                            {membersWithMob.length === 0 ? (
                                                <p className={`text-sm ${theme.textMuted}`}>No mobilization data yet</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {mobDistribution.map(bucket => (
                                                        <div
                                                            key={bucket.label}
                                                            className="flex items-center gap-2 cursor-pointer group"
                                                            onMouseEnter={(e) => {
                                                                if (bucket.count > 0) {
                                                                    setHoveredBucket({ type: 'mob', label: bucket.label });
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setBucketHoverPosition({ x: rect.right + 10, y: rect.top });
                                                                }
                                                            }}
                                                            onMouseLeave={() => setHoveredBucket(null)}
                                                        >
                                                            <span className={`text-xs ${theme.textMuted} w-16`}>{bucket.label}</span>
                                                            <div className="flex-1 h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded transition-all ${bucket.count > 0 ? 'group-hover:opacity-80' : ''}`}
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

                                            {/* Mobilization Hover Card */}
                                            {hoveredBucket?.type === 'mob' && (() => {
                                                const bucket = mobDistribution.find(b => b.label === hoveredBucket.label);
                                                if (!bucket || bucket.members.length === 0) return null;
                                                // Adjust position to stay within viewport
                                                const cardWidth = 224;
                                                const cardHeight = Math.min(bucket.members.length * 24 + 60, 256);
                                                let x = bucketHoverPosition.x;
                                                let y = bucketHoverPosition.y;
                                                if (typeof window !== 'undefined') {
                                                    if (x + cardWidth > window.innerWidth - 20) {
                                                        x = bucketHoverPosition.x - cardWidth - 20;
                                                    }
                                                    if (y + cardHeight > window.innerHeight - 20) {
                                                        y = window.innerHeight - cardHeight - 20;
                                                    }
                                                }
                                                return (
                                                    <div
                                                        className="fixed z-50 pointer-events-none"
                                                        style={{ left: x, top: y }}
                                                    >
                                                        <div className={`${theme.card} border border-[#9f7aea]/30 rounded-xl p-3 shadow-2xl shadow-[#9f7aea]/10 w-56 max-h-64 overflow-y-auto`}>
                                                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[var(--border)]">
                                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bucket.color }} />
                                                                <span className="font-semibold text-sm">{bucket.label} Score</span>
                                                            </div>
                                                            <div className="space-y-1">
                                                                {bucket.members.map(m => (
                                                                    <div key={m.name} className="flex justify-between text-xs">
                                                                        <span className="truncate flex-1">{m.name}</span>
                                                                        <span className={`ml-2 font-medium`} style={{ color: bucket.color }}>{formatPower(m.score)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
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

            {/* Member Hover Card */}
            {hoveredMember && (() => {
                const member = roster.find(m => m.name === hoveredMember);
                const rankings = memberRankings.get(hoveredMember);
                const stats = eventStats.get(hoveredMember);
                if (!member || !rankings) return null;

                // Adjust position to stay on screen
                const cardWidth = 320;
                const cardHeight = 350;
                let x = hoverPosition.x;
                let y = hoverPosition.y;

                // Keep card within viewport
                if (x + cardWidth > window.innerWidth) {
                    x = hoverPosition.x - cardWidth - 20;
                }
                if (y + cardHeight > window.innerHeight) {
                    y = window.innerHeight - cardHeight - 20;
                }
                if (y < 10) y = 10;

                return (
                    <div
                        className="fixed z-50 pointer-events-none"
                        style={{ left: x, top: y }}
                    >
                        <div className={`${theme.card} border border-[#9f7aea]/30 rounded-xl p-4 shadow-2xl shadow-[#9f7aea]/10 w-80`}>
                            {/* Header */}
                            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[var(--border)]">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#9f7aea] to-[#4318ff] flex items-center justify-center text-white font-bold">
                                    {member.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">{member.name}</h3>
                                    <p className={`text-xs ${theme.textMuted}`}>{member.role || 'Member'}</p>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-[var(--background-secondary)]/50 rounded-lg p-2">
                                    <div className={`text-xs ${theme.textMuted} mb-1`}>Power</div>
                                    <div className="text-[#01b574] font-semibold">{formatPower(member.power)}</div>
                                    <div className={`text-xs ${theme.textMuted}`}>Rank #{rankings.powerRank} of {roster.length}</div>
                                </div>
                                <div className="bg-[var(--background-secondary)]/50 rounded-lg p-2">
                                    <div className={`text-xs ${theme.textMuted} mb-1`}>Kill Points</div>
                                    <div className="text-[#f56565] font-semibold">{formatPower(member.kills || 0)}</div>
                                    <div className={`text-xs ${theme.textMuted}`}>Rank #{rankings.kpRank} of {roster.length}</div>
                                </div>
                                <div className="bg-[var(--background-secondary)]/50 rounded-lg p-2">
                                    <div className={`text-xs ${theme.textMuted} mb-1`}>T4 KP</div>
                                    <div className="text-[#fbbf24] font-semibold">{formatPower(member.t4_kills || 0)}</div>
                                    <div className={`text-xs ${theme.textMuted}`}>Rank #{rankings.t4Rank}</div>
                                </div>
                                <div className="bg-[var(--background-secondary)]/50 rounded-lg p-2">
                                    <div className={`text-xs ${theme.textMuted} mb-1`}>T5 KP</div>
                                    <div className="text-[#f97316] font-semibold">{formatPower(member.t5_kills || 0)}</div>
                                    <div className={`text-xs ${theme.textMuted}`}>Rank #{rankings.t5Rank}</div>
                                </div>
                            </div>

                            {/* Honor */}
                            <div className="bg-[var(--background-secondary)]/50 rounded-lg p-2 mb-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className={`text-xs ${theme.textMuted} mb-1`}>Honor Points</div>
                                        <div className="text-[#fbbf24] font-semibold">{(member.honor_points || 0).toLocaleString()}</div>
                                    </div>
                                    <div className={`text-xs ${theme.textMuted}`}>Rank #{rankings.honorRank}</div>
                                </div>
                            </div>

                            {/* Growth Stats */}
                            {(rankings.kpGrowthValue !== null || rankings.powerGrowthValue !== null) && (
                                <div className="border-t border-[var(--border)] pt-3">
                                    <div className={`text-xs ${theme.textMuted} mb-2`}>Recent Growth</div>
                                    <div className="grid grid-cols-2 gap-2 text-center mb-2">
                                        {rankings.powerGrowthValue !== null && (
                                            <div className="bg-[var(--background-secondary)]/50 rounded-lg p-2">
                                                <div className={`text-sm font-medium ${rankings.powerGrowthValue > 0 ? 'text-[#01b574]' : 'text-gray-400'}`}>
                                                    {rankings.powerGrowthValue > 0 ? '+' : ''}{formatPower(rankings.powerGrowthValue)}
                                                </div>
                                                <div className={`text-[10px] ${theme.textMuted}`}>Power #{rankings.powerGrowthRank}</div>
                                            </div>
                                        )}
                                        {rankings.kpGrowthValue !== null && (
                                            <div className="bg-[var(--background-secondary)]/50 rounded-lg p-2">
                                                <div className={`text-sm font-medium ${rankings.kpGrowthValue > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                                                    {rankings.kpGrowthValue > 0 ? '+' : ''}{formatPower(rankings.kpGrowthValue)}
                                                </div>
                                                <div className={`text-[10px] ${theme.textMuted}`}>KP #{rankings.kpGrowthRank}</div>
                                            </div>
                                        )}
                                    </div>
                                    {rankings.kpGrowthValue !== null && (
                                        <div className="grid grid-cols-2 gap-2 text-center">
                                            <div>
                                                <div className={`text-sm font-medium ${(rankings.t4GrowthValue || 0) > 0 ? 'text-[#fbbf24]' : 'text-gray-400'}`}>
                                                    {(rankings.t4GrowthValue || 0) > 0 ? '+' : ''}{formatPower(rankings.t4GrowthValue || 0)}
                                                </div>
                                                <div className={`text-[10px] ${theme.textMuted}`}>T4 Growth</div>
                                            </div>
                                            <div>
                                                <div className={`text-sm font-medium ${(rankings.t5GrowthValue || 0) > 0 ? 'text-[#f97316]' : 'text-gray-400'}`}>
                                                    {(rankings.t5GrowthValue || 0) > 0 ? '+' : ''}{formatPower(rankings.t5GrowthValue || 0)}
                                                </div>
                                                <div className={`text-[10px] ${theme.textMuted}`}>T5 Growth</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* AoO Stats */}
                            {stats && stats.aoo.totalAssigned > 0 && (
                                <div className="border-t border-[var(--border)] pt-3 mt-3">
                                    <div className="flex justify-between items-center">
                                        <div className={`text-xs ${theme.textMuted}`}>AoO Participation</div>
                                        {(() => {
                                            const rate = Math.round((stats.aoo.participatedCount / stats.aoo.totalAssigned) * 100);
                                            return (
                                                <div className={`text-sm font-medium ${rate >= 80 ? 'text-green-400' : rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                    {rate}% ({stats.aoo.participatedCount}/{stats.aoo.totalAssigned})
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
