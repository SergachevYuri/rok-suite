'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatPower } from '@/lib/supabase/use-alliance-roster';
import { createSnapshot, updateMemberSnapshot, useRosterSnapshots, formatDate, getKpGrowth, getPowerGrowth, getHonorGrowth, getMemberHistory, getLatestValuesForAllMembers, type DailyTotals, type MemberChange, type KpGrowth, type PowerGrowth, type HonorGrowth, type RosterSnapshot } from '@/lib/supabase/use-roster-snapshots';
import { getAllMemberStats, getMemberEventHistory, recordEvent, deleteEvent, bulkRecordAoO, bulkRecordMobilization, type MemberEventStats, type EventParticipation } from '@/lib/supabase/use-event-participation';
import { ArrowLeft, Search, ChevronUp, ChevronDown, Edit2, Save, X, Upload, Users, History, Lock, TrendingUp, UserPlus, UserMinus, Calendar, Trophy, BarChart3, AlertTriangle, Eye, Settings2, Check, ExternalLink, Info, GitMerge, Copy } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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
    // New ROKstats fields
    governor_id: number | null;
    kingdom: string | null;
    camp: string | null;
    alliance: string | null;
    highest_power: number;
    t1_kills: number;
    t2_kills: number;
    t3_kills: number;
    victories: number;
    defeats: number;
    scout_times: number;
    troops_healed: number;
    gathered: number;
    assistance: number;
    helps: number;
    acclaim: number;
    kvk_points: number;
    trades: number;
    castle_hall: number | null;
    civilization: string | null;
}

type SortField = 'default' | 'name' | 'power' | 'kills' | 'role' | 'aoo';

// Column descriptions for tooltips
const COLUMN_TOOLTIPS: Record<string, string> = {
    name: 'In-game governor name',
    power: 'Total account power',
    kp: 'Kill points (total kills)',
    t4t5: 'T4 and T5 troop kill points',
    t1t2t3: 'T1, T2 and T3 troop kill points',
    honor: 'Honor points earned in Ark of Osiris',
    aoo: 'Ark of Osiris: Last team assignment and participation rate',
    mob: 'Mobilization: Individual points and resources turned in/accepted',
    rank: 'Alliance rank (R1-R5)',
    alliance: 'Player\'s home alliance',
    deads: 'Total troop deaths',
    healed: 'Troops healed',
    acclaim: 'Acclaim points from KvK',
    kvkPts: 'KvK contribution points',
    highestPower: 'Highest recorded power',
    ch: 'Castle Hall level',
    civilization: 'In-game civilization',
};

// Column configuration for View Options
type ColumnId = 'power' | 'kp' | 't4t5' | 't1t2t3' | 'deads' | 'healed' | 'honor' | 'aoo' | 'mob' | 'rank' | 'alliance' | 'acclaim' | 'kvkPts' | 'highestPower' | 'ch' | 'civilization';

interface ColumnConfig {
    id: ColumnId;
    label: string;
    tooltip: string;
    defaultVisible: boolean;
    category: 'core' | 'combat' | 'support' | 'events' | 'profile';
}

const COLUMN_CONFIG: ColumnConfig[] = [
    // Core columns
    { id: 'power', label: 'Power', tooltip: COLUMN_TOOLTIPS.power, defaultVisible: true, category: 'core' },
    { id: 'kp', label: 'Kill Points', tooltip: COLUMN_TOOLTIPS.kp, defaultVisible: true, category: 'core' },
    { id: 'rank', label: 'Rank', tooltip: COLUMN_TOOLTIPS.rank, defaultVisible: true, category: 'core' },
    { id: 'alliance', label: 'Alliance', tooltip: COLUMN_TOOLTIPS.alliance, defaultVisible: true, category: 'core' },
    // Combat columns
    { id: 't4t5', label: 'T4/T5 KP', tooltip: COLUMN_TOOLTIPS.t4t5, defaultVisible: true, category: 'combat' },
    { id: 't1t2t3', label: 'T1/T2/T3 KP', tooltip: COLUMN_TOOLTIPS.t1t2t3, defaultVisible: false, category: 'combat' },
    { id: 'deads', label: 'Deaths', tooltip: COLUMN_TOOLTIPS.deads, defaultVisible: false, category: 'combat' },
    { id: 'healed', label: 'Healed', tooltip: COLUMN_TOOLTIPS.healed, defaultVisible: false, category: 'combat' },
    // Events columns
    { id: 'honor', label: 'Honor', tooltip: COLUMN_TOOLTIPS.honor, defaultVisible: true, category: 'events' },
    { id: 'aoo', label: 'AoO', tooltip: COLUMN_TOOLTIPS.aoo, defaultVisible: true, category: 'events' },
    { id: 'mob', label: 'Mob', tooltip: COLUMN_TOOLTIPS.mob, defaultVisible: true, category: 'events' },
    { id: 'acclaim', label: 'Acclaim', tooltip: COLUMN_TOOLTIPS.acclaim, defaultVisible: false, category: 'events' },
    { id: 'kvkPts', label: 'KvK Pts', tooltip: COLUMN_TOOLTIPS.kvkPts, defaultVisible: false, category: 'events' },
    // Profile columns
    { id: 'highestPower', label: 'Peak Power', tooltip: COLUMN_TOOLTIPS.highestPower, defaultVisible: false, category: 'profile' },
    { id: 'ch', label: 'CH', tooltip: COLUMN_TOOLTIPS.ch, defaultVisible: false, category: 'profile' },
    { id: 'civilization', label: 'Civ', tooltip: COLUMN_TOOLTIPS.civilization, defaultVisible: false, category: 'profile' },
];

const DEFAULT_VISIBLE_COLUMNS = COLUMN_CONFIG.filter(c => c.defaultVisible).map(c => c.id);

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
    const [allianceFilter, setAllianceFilter] = useState<string | null>(null);
    const [rankFilter, setRankFilter] = useState<string | null>(null);
    const [aooFilter, setAooFilter] = useState<'all' | 'assigned' | 'unassigned' | 'participated' | 'missed'>('all');
    const [sortField, setSortField] = useState<SortField>('default'); // Default: rank → power → name
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Editor mode
    const [isEditor, setIsEditor] = useState(false);
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [editorPassword, setEditorPassword] = useState('');

    // Editing state - kills/power stored as string for decimal input (millions)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<{ powerM: string; killsM: string; t4t5KillsM: string; honor: string; notes: string }>({ powerM: '', killsM: '', t4t5KillsM: '', honor: '', notes: '' });
    const firstEditInputRef = useRef<HTMLInputElement>(null);

    // CSV Import
    const [showImport, setShowImport] = useState(false);
    const [importStatus, setImportStatus] = useState<string | null>(null);

    // Duplicate Detection
    const [showDuplicates, setShowDuplicates] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<{ key: string; members: RosterMember[] }[]>([]);
    const [mergingGroup, setMergingGroup] = useState<string | null>(null);
    const [mergeStatus, setMergeStatus] = useState<string | null>(null);

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
    // KP growth pagination and sorting
    const [kpGrowthPage, setKpGrowthPage] = useState(0);
    const [kpGrowthRowsPerPage, setKpGrowthRowsPerPage] = useState(10);
    const [kpGrowthSort, setKpGrowthSort] = useState<{ field: 'name' | 'kpGrowth' | 't4Growth' | 't5Growth'; direction: 'asc' | 'desc' }>({ field: 'kpGrowth', direction: 'desc' });
    const [kpGrowthData, setKpGrowthData] = useState<KpGrowth[]>([]);
    const [powerGrowthData, setPowerGrowthData] = useState<PowerGrowth[]>([]);
    const [honorGrowthData, setHonorGrowthData] = useState<HonorGrowth[]>([]);
    // Honor growth pagination and sorting
    const [honorGrowthPage, setHonorGrowthPage] = useState(0);
    const [honorGrowthRowsPerPage, setHonorGrowthRowsPerPage] = useState(10);
    const [honorGrowthSort, setHonorGrowthSort] = useState<{ field: 'name' | 'honorGrowth'; direction: 'asc' | 'desc' }>({ field: 'honorGrowth', direction: 'desc' });

    // Growth tab charts toggle
    const [showCharts, setShowCharts] = useState(false);
    const [chartMetric, setChartMetric] = useState<'all' | 'kp' | 'power' | 'honor' | 'members'>('all');
    const [chartMode, setChartMode] = useState<'alliance' | 'individual'>('alliance');
    const [selectedPlayer, setSelectedPlayer] = useState<string>('');
    const [playerHistory, setPlayerHistory] = useState<RosterSnapshot[]>([]);

    // Pagination state
    const [rowsPerPage, setRowsPerPage] = useState<number>(25);
    const [currentPage, setCurrentPage] = useState(0);

    // Expanded row state for snapshot history
    const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
    const [memberSnapshots, setMemberSnapshots] = useState<RosterSnapshot[]>([]);
    const [loadingSnapshots, setLoadingSnapshots] = useState(false);

    // Hover card state
    const [hoveredMember, setHoveredMember] = useState<string | null>(null);
    const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [pinnedMember, setPinnedMember] = useState<string | null>(null);
    const [pinnedPosition, setPinnedPosition] = useState<{ x: number; y: number }>({ x: 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const memberHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Analytics chart hover state
    const [hoveredBucket, setHoveredBucket] = useState<{ type: 'aoo' | 'mob'; label: string } | null>(null);
    const [bucketHoverPosition, setBucketHoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [pinnedBucket, setPinnedBucket] = useState<{ type: 'aoo' | 'mob'; label: string } | null>(null);
    const [pinnedBucketPosition, setPinnedBucketPosition] = useState<{ x: number; y: number }>({ x: 100, y: 100 });
    const [isDraggingBucket, setIsDraggingBucket] = useState(false);
    const [bucketDragOffset, setBucketDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const bucketHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isOverHoverCardRef = useRef(false);

    // Activity leaderboard hover state
    const [hoveredActivityMember, setHoveredActivityMember] = useState<string | null>(null);
    const [activityHoverPosition, setActivityHoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [pinnedActivityMember, setPinnedActivityMember] = useState<string | null>(null);
    const [pinnedActivityPosition, setPinnedActivityPosition] = useState<{ x: number; y: number }>({ x: 100, y: 100 });
    const [isDraggingActivity, setIsDraggingActivity] = useState(false);
    const [activityDragOffset, setActivityDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const activityHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Column visibility state
    const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(() => {
        // Try to load from localStorage
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('roster-visible-columns');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch {
                    return DEFAULT_VISIBLE_COLUMNS;
                }
            }
        }
        return DEFAULT_VISIBLE_COLUMNS;
    });
    const [showViewOptions, setShowViewOptions] = useState(false);

    // Save column visibility to localStorage when it changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('roster-visible-columns', JSON.stringify(visibleColumns));
        }
    }, [visibleColumns]);

    // Close View Options dropdown when clicking outside
    useEffect(() => {
        if (!showViewOptions) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-view-options]')) {
                setShowViewOptions(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [showViewOptions]);

    const toggleColumn = (columnId: ColumnId) => {
        setVisibleColumns(prev =>
            prev.includes(columnId)
                ? prev.filter(id => id !== columnId)
                : [...prev, columnId]
        );
    };

    const resetColumns = () => {
        setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
    };

    const isColumnVisible = (columnId: ColumnId) => visibleColumns.includes(columnId);

    // History data from hook
    const { dailyTotals, allSnapshots, memberChanges, lastSnapshotDate, loading: historyLoading, refetch: refetchHistory } = useRosterSnapshots();

    const fetchRoster = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch current roster and latest snapshot values in parallel
            const [rosterResult, latestValues] = await Promise.all([
                supabase
                    .from('alliance_roster')
                    .select('*')
                    .eq('is_active', true)
                    .order('power', { ascending: false }),
                getLatestValuesForAllMembers(),
            ]);

            if (rosterResult.error) throw rosterResult.error;

            // Merge roster with latest snapshot values for missing fields
            const enhancedRoster = (rosterResult.data || []).map(member => {
                const snapshotValues = latestValues.get(member.name);
                if (!snapshotValues) return member;

                return {
                    ...member,
                    // Use snapshot value if current is 0/null and snapshot has data
                    kills: (member.kills || 0) > 0 ? member.kills : (snapshotValues.kills || member.kills),
                    t4_kills: (member.t4_kills || 0) > 0 ? member.t4_kills : (snapshotValues.t4_kills || member.t4_kills),
                    t5_kills: (member.t5_kills || 0) > 0 ? member.t5_kills : (snapshotValues.t5_kills || member.t5_kills),
                    honor_points: (member.honor_points || 0) > 0 ? member.honor_points : (snapshotValues.honor_points || member.honor_points),
                };
            });

            setRoster(enhancedRoster);
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

    // Fetch KP, Power, and Honor growth data when roster loads
    useEffect(() => {
        if (roster.length > 0) {
            getKpGrowth(roster).then(setKpGrowthData).catch(console.error);
            getPowerGrowth(roster).then(setPowerGrowthData).catch(console.error);
            getHonorGrowth(roster).then(setHonorGrowthData).catch(console.error);
        }
    }, [roster]);

    // Fetch individual player history when selected
    useEffect(() => {
        if (selectedPlayer && chartMode === 'individual') {
            getMemberHistory(selectedPlayer, 30).then(setPlayerHistory).catch(console.error);
        } else {
            setPlayerHistory([]);
        }
    }, [selectedPlayer, chartMode]);

    // Reset to first page when filters/sort change
    useEffect(() => {
        setCurrentPage(0);
    }, [search, tagFilter, allianceFilter, rankFilter, aooFilter, sortField, sortDirection]);

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
        setRankFilter(null);
        setAooFilter('all');
    };

    const startEditing = (member: RosterMember) => {
        setEditingId(member.id);
        // Convert power to millions for display (e.g., 18543993 -> "18.5")
        const powerM = member.power ? (member.power / 1000000).toFixed(1) : '';
        // Convert kills to millions for display (e.g., 18543993 -> "18.5")
        const killsM = member.kills ? (member.kills / 1000000).toFixed(1) : '';
        // Format T4/T5 as "X/Y" (e.g., "5.2/3.1")
        const t4M = member.t4_kills ? (member.t4_kills / 1000000).toFixed(1) : '';
        const t5M = member.t5_kills ? (member.t5_kills / 1000000).toFixed(1) : '';
        const t4t5KillsM = (member.t4_kills || member.t5_kills) ? `${t4M}/${t5M}` : '';
        // Honor points as raw number
        const honor = member.honor_points ? member.honor_points.toString() : '';
        setEditValues({ powerM, killsM, t4t5KillsM, honor, notes: member.notes || '' });
        // Focus the first input after state update
        setTimeout(() => firstEditInputRef.current?.focus(), 50);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditValues({ powerM: '', killsM: '', t4t5KillsM: '', honor: '', notes: '' });
    };

    const saveEditing = async (): Promise<boolean> => {
        if (!editingId) return false;

        // Find the member being edited to get their name and role
        const member = roster.find(m => m.id === editingId);
        if (!member) return false;

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

            // Also update today's snapshot for this member
            await updateMemberSnapshot({
                name: member.name,
                power: powerRaw,
                kills: killsRaw,
                t4_kills: t4KillsRaw,
                t5_kills: t5KillsRaw,
                honor_points: honorRaw,
                role: member.role,
                is_active: member.is_active,
            });

            setRoster(roster.map(m =>
                m.id === editingId
                    ? { ...m, power: powerRaw, kills: killsRaw, t4_kills: t4KillsRaw, t5_kills: t5KillsRaw, honor_points: honorRaw, notes: editValues.notes || null }
                    : m
            ));
            setEditingId(null);
            return true;
        } catch (err) {
            console.error('Error saving:', err);
            alert('Failed to save changes');
            return false;
        }
    };

    // Save current row and move to next row for editing
    const saveAndEditNext = async () => {
        if (!editingId) return;

        // Find current member's index in filteredRoster
        const currentIdx = filteredRoster.findIndex(m => m.id === editingId);
        const saved = await saveEditing();

        if (saved && currentIdx >= 0 && currentIdx < filteredRoster.length - 1) {
            // Move to next row
            const nextMember = filteredRoster[currentIdx + 1];
            if (nextMember) {
                startEditing(nextMember);
            }
        }
    };

    // Handle keyboard events for edit inputs
    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveAndEditNext();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEditing();
        }
    };

    // Handle expanding a row to show snapshot history
    const handleExpandRow = async (memberId: string, memberName: string) => {
        if (expandedMemberId === memberId) {
            // Collapse if already expanded
            setExpandedMemberId(null);
            setMemberSnapshots([]);
            return;
        }

        setExpandedMemberId(memberId);
        setLoadingSnapshots(true);
        setMemberSnapshots([]);

        try {
            const history = await getMemberHistory(memberName, 50);
            setMemberSnapshots(history);
        } catch (error) {
            console.error('Error fetching member history:', error);
        } finally {
            setLoadingSnapshots(false);
        }
    };

    // Duplicate detection - normalize names to find potential matches
    // Includes all known clan/guild tag prefixes found in ROKstats exports
    const CLAN_TAGS = [
        // Angmar tags
        'ᵃⁿᵍ', 'ang',
        // KK variants
        'ᵏᵏ', 'кк', 'К҉к҉', 'K҉k҉', 'ккк', 'ᵏᵏᵏ', 'ᴷᴷ',
        // Other guild tags found in CSV
        'ᴿᵁ', 'ᴵᴸ', 'ᶦˢ', 'ᴳᴸ', 'ᴬᶜ', 'ᴬ ',
        // Special characters used as prefixes
        '๛', '҉', '屮', 'ㆍ',
    ];

    const stripTagsFromName = (name: string): string => {
        let clean = name;
        for (const tag of CLAN_TAGS) {
            clean = clean.replaceAll(tag, '');
        }
        // Normalize unicode and strip diacritics
        clean = clean.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
        // Also remove common special characters that vary between names
        clean = clean.replace(/[✖乄⚔ツ]/g, '');
        return clean.trim().toLowerCase();
    };

    const findDuplicates = () => {
        // Group by normalized name
        const groups = new Map<string, RosterMember[]>();

        for (const member of roster) {
            // Skip already merged records
            if (!member.is_active) continue;

            const key = stripTagsFromName(member.name);
            if (!key || key.length < 2) continue;

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(member);
        }

        // Find groups with multiple entries
        const duplicates = Array.from(groups.entries())
            .filter(([_, members]) => members.length > 1)
            .map(([key, members]) => ({
                key,
                members: members.sort((a, b) => b.power - a.power)
            }));

        setDuplicateGroups(duplicates);
        setShowDuplicates(true);
    };

    const hasTag = (name: string): boolean => {
        return CLAN_TAGS.some(tag => name.includes(tag));
    };

    const mergeDuplicateGroup = async (group: { key: string; members: RosterMember[] }) => {
        if (group.members.length < 2) return;

        setMergingGroup(group.key);
        setMergeStatus('Merging...');

        try {
            // Prefer the entry with clan tag, otherwise the one with more power
            const tagged = group.members.filter(m => hasTag(m.name));
            const untagged = group.members.filter(m => !hasTag(m.name));

            let primary: RosterMember;
            let toMerge: RosterMember[];

            if (tagged.length > 0) {
                primary = tagged[0];
                toMerge = [...tagged.slice(1), ...untagged];
            } else {
                primary = group.members[0]; // Already sorted by power
                toMerge = group.members.slice(1);
            }

            // Collect all alternate names
            const allAlternateNames = new Set<string>();
            for (const m of toMerge) {
                allAlternateNames.add(m.name);
            }

            // Merge stats: take max of numeric fields
            const merged = {
                power: Math.max(primary.power, ...toMerge.map(m => m.power || 0)),
                kills: Math.max(primary.kills || 0, ...toMerge.map(m => m.kills || 0)),
                t4_kills: Math.max(primary.t4_kills || 0, ...toMerge.map(m => m.t4_kills || 0)),
                t5_kills: Math.max(primary.t5_kills || 0, ...toMerge.map(m => m.t5_kills || 0)),
                deads: Math.max(primary.deads || 0, ...toMerge.map(m => m.deads || 0)),
                honor_points: Math.max(primary.honor_points || 0, ...toMerge.map(m => m.honor_points || 0)),
                troops_healed: Math.max(primary.troops_healed || 0, ...toMerge.map(m => m.troops_healed || 0)),
                acclaim: Math.max(primary.acclaim || 0, ...toMerge.map(m => m.acclaim || 0)),
                kvk_points: Math.max(primary.kvk_points || 0, ...toMerge.map(m => m.kvk_points || 0)),
                highest_power: Math.max(primary.highest_power || 0, ...toMerge.map(m => m.highest_power || 0)),
                alternate_names: Array.from(allAlternateNames),
            };

            // Update primary with merged data
            const { error: updateError } = await supabase
                .from('alliance_roster')
                .update(merged)
                .eq('id', primary.id);

            if (updateError) throw updateError;

            // Mark duplicates as inactive and link to primary
            for (const m of toMerge) {
                const { error: mergeError } = await supabase
                    .from('alliance_roster')
                    .update({
                        is_active: false,
                        merged_into: primary.id,
                    })
                    .eq('id', m.id);

                if (mergeError) throw mergeError;
            }

            // Update local state
            setRoster(roster.map(m => {
                if (m.id === primary.id) {
                    return { ...m, ...merged };
                }
                if (toMerge.some(tm => tm.id === m.id)) {
                    return { ...m, is_active: false };
                }
                return m;
            }));

            // Remove this group from duplicates
            setDuplicateGroups(duplicateGroups.filter(g => g.key !== group.key));
            setMergeStatus(`Merged ${toMerge.length} record(s) into "${primary.name}"`);

            setTimeout(() => setMergeStatus(null), 3000);
        } catch (err) {
            console.error('Error merging:', err);
            setMergeStatus('Failed to merge records');
        } finally {
            setMergingGroup(null);
        }
    };

    // Parse a single CSV line handling quoted fields
    const parseCSVLine = (line: string): string[] => {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;

        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        return values;
    };

    // ROKstats CSV column mapping
    const ROKSTATS_COLUMN_MAP: Record<string, string> = {
        '#': 'rank',
        'governor id': 'governor_id',
        'governor name': 'name',
        'camp': 'camp',
        'kd': 'kingdom',
        'power': 'power',
        'kp': 'kills',
        't4': 't4_kills',
        't5': 't5_kills',
        'dead': 'deads',
        'acclaim': 'acclaim',
        'healed': 'troops_healed',
        'pts': 'kvk_points',
        'trades': 'trades',
    };

    const handleImportCSV = async (file: File) => {
        setImportStatus('Reading file...');

        try {
            const content = await file.text();
            const lines = content.trim().split('\n');

            if (lines.length < 2) {
                throw new Error('CSV must have a header row and at least one data row');
            }

            // Parse header row
            const headerLine = lines[0];
            const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().trim());

            // Check if this is a ROKstats format CSV (has "governor name" or "governor id")
            const isRokstatsFormat = headers.includes('governor name') || headers.includes('governor id');

            // Build column index map
            const columnIndices: Record<string, number> = {};

            if (isRokstatsFormat) {
                // ROKstats format - use the column mapping
                for (const [csvHeader, field] of Object.entries(ROKSTATS_COLUMN_MAP)) {
                    const idx = headers.indexOf(csvHeader);
                    if (idx !== -1) {
                        columnIndices[field] = idx;
                    }
                }
                setImportStatus(`ROKstats format detected. Found columns: ${Object.keys(columnIndices).join(', ')}`);
            } else {
                // Simple format - look for standard column names
                const simpleMap: Record<string, string[]> = {
                    'name': ['name'],
                    'power': ['power'],
                    'kills': ['kills', 'kp'],
                    'role': ['role', 'rank'],
                    'notes': ['notes'],
                };
                for (const [field, possibleHeaders] of Object.entries(simpleMap)) {
                    for (const h of possibleHeaders) {
                        const idx = headers.indexOf(h);
                        if (idx !== -1) {
                            columnIndices[field] = idx;
                            break;
                        }
                    }
                }
            }

            if (columnIndices['name'] === undefined) {
                throw new Error('CSV must have a "name" or "governor name" column');
            }

            // Fetch existing roster to match by governor_id or alternate_names
            // Also fetch current kills to avoid overwriting manual entries with lower CSV values
            setImportStatus('Checking for existing members...');
            const { data: existingRoster } = await supabase
                .from('alliance_roster')
                .select('id, name, governor_id, alternate_names, is_active, kills, t4_kills, t5_kills, deads')
                .eq('is_active', true);

            // Build lookup maps for matching
            const govIdToId = new Map<number, string>();
            const nameToId = new Map<string, string>();
            const altNameToId = new Map<string, string>();
            const normalizedNameToId = new Map<string, string>();
            // Track current kills to only update if CSV has HIGHER value (manual entry is truth)
            const idToCurrentKills = new Map<string, { kills: number; t4_kills: number; t5_kills: number; deads: number }>();

            for (const member of existingRoster || []) {
                if (member.governor_id) {
                    govIdToId.set(member.governor_id, member.id);
                }
                nameToId.set(member.name.toLowerCase(), member.id);
                // Also index by normalized name (stripped of clan tags)
                normalizedNameToId.set(stripTagsFromName(member.name), member.id);
                // Also index alternate names
                if (member.alternate_names) {
                    for (const altName of member.alternate_names) {
                        altNameToId.set(altName.toLowerCase(), member.id);
                        normalizedNameToId.set(stripTagsFromName(altName), member.id);
                    }
                }
                // Store current kill values
                idToCurrentKills.set(member.id, {
                    kills: member.kills || 0,
                    t4_kills: member.t4_kills || 0,
                    t5_kills: member.t5_kills || 0,
                    deads: member.deads || 0,
                });
            }

            const rowsToInsert: Partial<RosterMember>[] = [];
            const rowsToUpdate: { id: string; data: Partial<RosterMember> }[] = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const values = parseCSVLine(line);

                const getValue = (field: string): string => {
                    const idx = columnIndices[field];
                    return idx !== undefined ? (values[idx] || '') : '';
                };

                const getNumValue = (field: string): number => {
                    const val = getValue(field);
                    return parseInt(val.replace(/,/g, ''), 10) || 0;
                };

                const name = getValue('name');
                if (!name) continue;

                const row: Partial<RosterMember> = {
                    name,
                    power: getNumValue('power'),
                    is_active: true,
                };

                // Parse CSV kill values (will compare against existing later)
                const csvKills = getNumValue('kills');
                let csvT4 = 0, csvT5 = 0, csvDeads = 0;

                // Add ROKstats fields if available
                let govId: number | null = null;
                if (isRokstatsFormat) {
                    govId = getNumValue('governor_id') || null;
                    if (govId) row.governor_id = govId;

                    const camp = getValue('camp');
                    if (camp) row.camp = camp;

                    const kingdom = getValue('kingdom');
                    if (kingdom) row.kingdom = kingdom;

                    csvT4 = getNumValue('t4_kills');
                    csvT5 = getNumValue('t5_kills');
                    csvDeads = getNumValue('deads');

                    // These can always be updated (not manually entered)
                    row.acclaim = getNumValue('acclaim');
                    row.troops_healed = getNumValue('troops_healed');
                    row.kvk_points = getNumValue('kvk_points');
                    row.trades = getNumValue('trades');
                } else {
                    // Simple format
                    const role = getValue('role');
                    if (role) row.role = role;

                    const notes = getValue('notes');
                    if (notes) row.notes = notes;
                }

                // Try to match to existing member:
                // 1. By governor_id (most reliable)
                // 2. By exact name match
                // 3. By alternate name match
                // 4. By normalized name match (strips clan tags like ᵃⁿᵍ, ᵏᵏ, кк, etc.)
                let existingId: string | undefined;
                const normalizedCsvName = stripTagsFromName(name);

                if (govId && govIdToId.has(govId)) {
                    existingId = govIdToId.get(govId);
                } else if (nameToId.has(name.toLowerCase())) {
                    existingId = nameToId.get(name.toLowerCase());
                } else if (altNameToId.has(name.toLowerCase())) {
                    existingId = altNameToId.get(name.toLowerCase());
                } else if (normalizedCsvName.length >= 2 && normalizedNameToId.has(normalizedCsvName)) {
                    // Match by normalized name (e.g., "ᵃⁿᵍNECO" matches "NECO")
                    existingId = normalizedNameToId.get(normalizedCsvName);
                }

                if (existingId) {
                    // Update existing member - don't change the name (keep our canonical name)
                    const updateData = { ...row };
                    delete updateData.name; // Don't overwrite name
                    delete updateData.is_active; // Don't change active status

                    // Only update kill stats if CSV value is HIGHER than existing
                    // Manual entries are source of truth - CSV should never overwrite with lower values
                    const currentKills = idToCurrentKills.get(existingId);
                    if (currentKills) {
                        if (csvKills > currentKills.kills) {
                            updateData.kills = csvKills;
                        }
                        if (csvT4 > currentKills.t4_kills) {
                            updateData.t4_kills = csvT4;
                        }
                        if (csvT5 > currentKills.t5_kills) {
                            updateData.t5_kills = csvT5;
                        }
                        if (csvDeads > currentKills.deads) {
                            updateData.deads = csvDeads;
                        }
                    } else {
                        // No existing data - use CSV values if non-zero
                        if (csvKills > 0) updateData.kills = csvKills;
                        if (csvT4 > 0) updateData.t4_kills = csvT4;
                        if (csvT5 > 0) updateData.t5_kills = csvT5;
                        if (csvDeads > 0) updateData.deads = csvDeads;
                    }

                    rowsToUpdate.push({ id: existingId, data: updateData });
                } else {
                    // New member - use CSV values if non-zero
                    if (csvKills > 0) row.kills = csvKills;
                    if (csvT4 > 0) row.t4_kills = csvT4;
                    if (csvT5 > 0) row.t5_kills = csvT5;
                    if (csvDeads > 0) row.deads = csvDeads;
                    rowsToInsert.push(row);
                }
            }

            setImportStatus(`Updating ${rowsToUpdate.length} existing, adding ${rowsToInsert.length} new...`);

            // Batch update existing members
            for (const { id, data } of rowsToUpdate) {
                const { error } = await supabase
                    .from('alliance_roster')
                    .update(data)
                    .eq('id', id);
                if (error) console.error('Update error for', id, error);
            }

            // Insert new members
            if (rowsToInsert.length > 0) {
                const { error } = await supabase
                    .from('alliance_roster')
                    .upsert(rowsToInsert, { onConflict: 'name' });
                if (error) throw error;
            }

            const totalProcessed = rowsToUpdate.length + rowsToInsert.length;
            setImportStatus(`Processed ${totalProcessed} members. Creating snapshot...`);

            // Auto-create snapshot after import - use current roster state
            try {
                const { data: updatedRoster } = await supabase
                    .from('alliance_roster')
                    .select('name, power, kills, t4_kills, t5_kills, honor_points, role, is_active')
                    .eq('is_active', true);

                if (updatedRoster) {
                    const snapshotData = updatedRoster.map(r => ({
                        name: r.name,
                        power: r.power || 0,
                        kills: r.kills || 0,
                        t4_kills: r.t4_kills || 0,
                        t5_kills: r.t5_kills || 0,
                        honor_points: r.honor_points || 0,
                        role: r.role || null,
                        is_active: true,
                    }));
                    await createSnapshot(snapshotData);
                    setImportStatus(`Updated ${rowsToUpdate.length}, added ${rowsToInsert.length} members. Snapshot saved!`);
                    refetchHistory();
                }
            } catch {
                setImportStatus(`Updated ${rowsToUpdate.length}, added ${rowsToInsert.length} (snapshot failed)`);
            }

            setTimeout(() => {
                setImportStatus(null);
                setShowImport(false);
            }, 3000);

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

    // Get unique alliances for filter dropdown
    const alliances = useMemo(() => {
        const allianceSet = new Set<string>();
        roster.forEach(m => {
            if (m.alliance) allianceSet.add(m.alliance);
        });
        return Array.from(allianceSet).sort();
    }, [roster]);

    // Helper to get AoO participation rate for a member
    const getAooRate = (memberName: string): number => {
        const stats = eventStats.get(memberName);
        if (!stats || !stats.aoo.totalAssigned || stats.aoo.totalAssigned === 0) return -1; // -1 means no data
        return (stats.aoo.participatedCount / stats.aoo.totalAssigned) * 100;
    };

    // Filter and sort roster
    // Only show members with tags (excludes CSV-imported members without tags)
    const filteredRoster = roster
        .filter(m => m.tags && m.tags.length > 0) // Only show tagged members
        .filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
        .filter(m => !tagFilter || (m.tags && m.tags.includes(tagFilter)))
        .filter(m => !allianceFilter || m.alliance === allianceFilter)
        .filter(m => !rankFilter || m.role === rankFilter)
        .filter(m => {
            if (aooFilter === 'all') return true;
            const stats = eventStats.get(m.name);
            const hasAssignment = stats && stats.aoo.totalAssigned > 0;
            const participated = stats && stats.aoo.participatedCount > 0;
            const missedAny = stats && stats.aoo.totalAssigned > stats.aoo.participatedCount;

            switch (aooFilter) {
                case 'assigned': return hasAssignment;
                case 'unassigned': return !hasAssignment;
                case 'participated': return participated;
                case 'missed': return hasAssignment && missedAny;
                default: return true;
            }
        })
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
                case 'aoo':
                    // Sort by AoO participation rate; unassigned members go to the end
                    aVal = getAooRate(a.name);
                    bVal = getAooRate(b.name);
                    // Put unassigned (-1) at the end regardless of sort direction
                    if (aVal === -1 && bVal === -1) return 0;
                    if (aVal === -1) return 1;
                    if (bVal === -1) return -1;
                    break;
            }

            if (sortDirection === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        });

    // Pagination logic
    const totalPages = rowsPerPage === -1 ? 1 : Math.ceil(filteredRoster.length / rowsPerPage);
    const paginatedRoster = rowsPerPage === -1
        ? filteredRoster
        : filteredRoster.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);

    // Only count tagged members for stats (excludes CSV-imported members without tags)
    const displayRoster = roster.filter(m => m.tags && m.tags.length > 0);
    const totalPower = displayRoster.reduce((sum, m) => sum + m.power, 0);
    const totalKills = displayRoster.reduce((sum, m) => sum + (m.kills || 0), 0);

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
            <AppSidebar>
                <div className={`min-h-screen ${theme.bg} ${theme.text} flex items-center justify-center`}>
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-[#4318ff] border-t-transparent rounded-full animate-spin"></div>
                        <span className={theme.textMuted}>Loading roster...</span>
                    </div>
                </div>
            </AppSidebar>
        );
    }

    return (
        <AppSidebar>
        <div className={`min-h-screen ${theme.bg} ${theme.text}`}>
            {/* Header */}
            <header className="bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] sticky top-14 lg:top-0 z-30">
                <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight truncate">Alliance Roster</h1>
                                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#4318ff]/20 text-[#9f7aea] flex-shrink-0">
                                        {displayRoster.length} members
                                    </span>
                                </div>
                                <p className={`text-xs sm:text-sm ${theme.textMuted} hidden sm:block`}>Member stats, power rankings, and event tracking</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                            {isEditor && (
                                <>
                                    <button
                                        onClick={() => setShowImport(!showImport)}
                                        className={`p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-medium ${theme.button} flex items-center gap-2`}
                                        title="Import CSV"
                                    >
                                        <Upload className="w-4 h-4" />
                                        <span className="hidden sm:inline">Import</span>
                                    </button>
                                    <button
                                        onClick={handleCreateSnapshot}
                                        className={`p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-medium ${theme.button} flex items-center gap-2`}
                                        title="Save today's roster data for historical tracking"
                                    >
                                        <Lock className="w-4 h-4" />
                                        <span className="hidden sm:inline">Lock</span>
                                    </button>
                                </>
                            )}
                            {!isEditor ? (
                                <button
                                    onClick={() => setShowPasswordPrompt(true)}
                                    className={`p-2 sm:px-4 sm:py-2 rounded-lg text-sm font-medium ${theme.button} flex items-center gap-1`}
                                    title="Edit Mode"
                                >
                                    <Edit2 className="w-4 h-4 sm:hidden" />
                                    <span className="hidden sm:inline">Edit Mode</span>
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
                                    className="p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-medium bg-[#4318ff] text-white hover:bg-[#4318ff]/80 transition-colors flex items-center gap-1"
                                >
                                    <X className="w-4 h-4 sm:hidden" />
                                    <span className="hidden sm:inline">Exit Edit</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs - More prominent design - Sticky */}
                    <div className="flex items-center gap-2 mt-4 sm:mt-5 border-b border-[var(--border)] pb-0 overflow-x-auto hide-scrollbar sticky top-0 z-20 bg-[var(--background)] pt-2 -mt-2">
                        <button
                            onClick={() => setActiveTab('roster')}
                            className={`px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 border-b-2 -mb-[1px] ${
                                activeTab === 'roster'
                                    ? 'text-[#4318ff] border-[#4318ff] bg-[#4318ff]/5'
                                    : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]'
                            }`}
                        >
                            <Users className="w-4 h-4" />
                            Roster
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 border-b-2 -mb-[1px] ${
                                activeTab === 'history'
                                    ? 'text-[#4318ff] border-[#4318ff] bg-[#4318ff]/5'
                                    : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]'
                            }`}
                        >
                            <TrendingUp className="w-4 h-4" />
                            Growth
                        </button>
                        <button
                            onClick={() => setActiveTab('analytics')}
                            className={`px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 border-b-2 -mb-[1px] ${
                                activeTab === 'analytics'
                                    ? 'text-[#4318ff] border-[#4318ff] bg-[#4318ff]/5'
                                    : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]'
                            }`}
                        >
                            <BarChart3 className="w-4 h-4" />
                            Analytics
                        </button>
                        {isEditor && (
                            <button
                                onClick={() => setActiveTab('events')}
                                className={`px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 border-b-2 -mb-[1px] ${
                                    activeTab === 'events'
                                        ? 'text-[#4318ff] border-[#4318ff] bg-[#4318ff]/5'
                                        : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]'
                                }`}
                            >
                                <Calendar className="w-4 h-4" />
                                Events
                            </button>
                        )}
                        <div className="flex-1" />
                        {lastSnapshotDate && (
                            <span className={`px-3 py-2 text-xs ${theme.textMuted} flex items-center gap-1.5 whitespace-nowrap flex-shrink-0`}>
                                <Lock className="w-3 h-3" />
                                <span className="hidden sm:inline">Snapshot:</span> {formatDate(lastSnapshotDate)}
                            </span>
                        )}
                    </div>

                    {/* Tag Filter - Global - Scrollable on mobile */}
                    {availableTags.length > 0 && (
                        <div className="flex items-center gap-2 sm:gap-3 mt-3 sm:mt-4">
                            <span className={`text-[10px] sm:text-xs ${theme.textMuted} flex-shrink-0`}>Filter:</span>
                            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto hide-scrollbar pb-1">
                                <button
                                    onClick={() => setTagFilter(null)}
                                    className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                                        !tagFilter
                                            ? 'bg-[#4318ff] text-white'
                                            : `${theme.button}`
                                    }`}
                                >
                                    All ({displayRoster.length})
                                </button>
                                {availableTags.map(tag => {
                                    const count = displayRoster.filter(m => m.tags?.includes(tag)).length;
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
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
                            <button
                                onClick={findDuplicates}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${theme.button} hover:bg-[#4318ff]/20 transition-colors whitespace-nowrap`}
                            >
                                <Copy className="w-3.5 h-3.5" />
                                Find Duplicates
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Panel */}
            {showImport && isEditor && (
                <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4">
                    <div className={`${theme.card} border rounded-xl p-5`}>
                        <h3 className="font-semibold mb-4 flex items-center gap-2 text-lg">
                            <Upload className="w-5 h-5 text-[#4318ff]" />
                            Import Roster from ROKstats
                        </h3>

                        {/* Step by step instructions */}
                        <div className={`${theme.bg} rounded-lg p-4 mb-4 border border-[var(--border)]`}>
                            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                                <Info className="w-4 h-4 text-[#4318ff]" />
                                How to export from ROKstats:
                            </h4>
                            <ol className="space-y-2 text-sm">
                                <li className="flex items-start gap-2">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#4318ff] text-white text-xs flex items-center justify-center font-bold">1</span>
                                    <span>Go to <a href="https://app.rokstats.online/kvk/dashboard/S11400" target="_blank" rel="noopener noreferrer" className="text-[#4318ff] hover:underline inline-flex items-center gap-1">app.rokstats.online/kvk/dashboard/S11400 <ExternalLink className="w-3 h-3" /></a></span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#4318ff] text-white text-xs flex items-center justify-center font-bold">2</span>
                                    <span>Filter by kingdom <strong className="text-[var(--foreground)]">3923</strong> using the filter options</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#4318ff] text-white text-xs flex items-center justify-center font-bold">3</span>
                                    <span>Click the <strong className="text-[var(--foreground)]">Export CSV</strong> button to download</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#4318ff] text-white text-xs flex items-center justify-center font-bold">4</span>
                                    <span>Upload the downloaded CSV file below</span>
                                </li>
                            </ol>
                        </div>

                        <div className={`text-xs ${theme.textMuted} mb-3 space-y-1`}>
                            <p>✓ Supports ROKstats columns: Governor ID, Name, Power, KP, T4, T5, Deaths, Acclaim, Healed, PTS, Trades</p>
                            <p>✓ Also accepts simple CSV format with: name, power, kills, rank/role, notes</p>
                            <p className="text-[#01b574]">✓ A snapshot will be automatically created after import for historical tracking</p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 items-start">
                            <label className="flex-1 relative">
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => e.target.files?.[0] && handleImportCSV(e.target.files[0])}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className={`w-full px-4 py-3 rounded-lg border-2 border-dashed border-[var(--border)] hover:border-[#4318ff] transition-colors ${theme.bg} text-center cursor-pointer`}>
                                    <Upload className="w-5 h-5 mx-auto mb-1 text-[var(--text-muted)]" />
                                    <p className="text-sm font-medium">Choose CSV file or drag & drop</p>
                                    <p className={`text-xs ${theme.textMuted}`}>ROKstats export or custom CSV</p>
                                </div>
                            </label>
                        </div>

                        {importStatus && (
                            <div className={`mt-3 p-3 rounded-lg text-sm ${importStatus.includes('Error') ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-[#01b574]/10 text-[#01b574] border border-[#01b574]/20'}`}>
                                {importStatus}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Duplicates Panel */}
            {showDuplicates && isEditor && (
                <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4">
                    <div className={`${theme.card} border rounded-xl p-5`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold flex items-center gap-2 text-lg">
                                <GitMerge className="w-5 h-5 text-[#f59e0b]" />
                                Potential Duplicates
                            </h3>
                            <button
                                onClick={() => setShowDuplicates(false)}
                                className={`p-1.5 rounded-lg ${theme.button}`}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {duplicateGroups.length === 0 ? (
                            <div className={`text-center py-8 ${theme.textMuted}`}>
                                <Check className="w-12 h-12 mx-auto mb-3 text-[#01b574]" />
                                <p className="font-medium text-[#01b574]">No duplicates found!</p>
                                <p className="text-sm mt-1">All roster entries appear to be unique.</p>
                            </div>
                        ) : (
                            <>
                                <p className={`text-sm ${theme.textMuted} mb-4`}>
                                    Found {duplicateGroups.length} potential duplicate group(s). Names are matched after removing clan tags (ᵃⁿᵍ, ᵏᵏ, etc.).
                                </p>

                                {mergeStatus && (
                                    <div className={`mb-4 p-3 rounded-lg text-sm ${mergeStatus.includes('Failed') ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-[#01b574]/10 text-[#01b574] border border-[#01b574]/20'}`}>
                                        {mergeStatus}
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {duplicateGroups.map((group) => (
                                        <div key={group.key} className={`${theme.bg} rounded-lg p-4 border border-[var(--border)]`}>
                                            <div className="flex items-center justify-between mb-3">
                                                <span className={`text-xs font-mono ${theme.textMuted}`}>Normalized: &quot;{group.key}&quot;</span>
                                                <button
                                                    onClick={() => mergeDuplicateGroup(group)}
                                                    disabled={mergingGroup === group.key}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#f59e0b]/20 text-[#f59e0b] hover:bg-[#f59e0b]/30 transition-colors disabled:opacity-50`}
                                                >
                                                    {mergingGroup === group.key ? (
                                                        <>Merging...</>
                                                    ) : (
                                                        <>
                                                            <GitMerge className="w-3.5 h-3.5" />
                                                            Merge Records
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {group.members.map((member, idx) => {
                                                    const isTagged = hasTag(member.name);
                                                    const isPrimary = idx === 0 || isTagged;
                                                    return (
                                                        <div
                                                            key={member.id}
                                                            className={`flex items-center justify-between p-2 rounded ${isPrimary ? 'bg-[#01b574]/10 border border-[#01b574]/30' : 'bg-[var(--background-hover)]'}`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {isPrimary && (
                                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#01b574]/20 text-[#01b574] uppercase">Primary</span>
                                                                )}
                                                                <span className="font-medium text-sm">{member.name}</span>
                                                                {isTagged && (
                                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#4318ff]/20 text-[#9f7aea]">Tagged</span>
                                                                )}
                                                            </div>
                                                            <div className={`text-xs ${theme.textMuted}`}>
                                                                {formatPower(member.power)} power • {formatPower(member.kills)} KP
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <p className={`text-xs ${theme.textMuted} mt-2`}>
                                                Merge will keep the Primary record and mark others as inactive with alternate_names reference.
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </>
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
                        <p className="text-2xl font-bold">{displayRoster.length}</p>
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
                        <p className="text-2xl font-bold text-[#4318ff]">{formatPower(Math.round(totalPower / (displayRoster.length || 1)))}</p>
                    </div>
                </div>

                {/* Search and Sort Controls */}
                <div className={`${theme.card} border rounded-xl p-4 mb-6 ${showViewOptions ? 'relative z-[100]' : ''}`}>
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
                        <div className="flex gap-2 flex-wrap">
                            {/* Alliance Filter */}
                            {alliances.length > 0 && (
                                <select
                                    value={allianceFilter || ''}
                                    onChange={(e) => setAllianceFilter(e.target.value || null)}
                                    className={`px-3 py-2 rounded-lg text-sm border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff]`}
                                >
                                    <option value="">All Alliances</option>
                                    {alliances.map(a => (
                                        <option key={a} value={a}>{a}</option>
                                    ))}
                                </select>
                            )}
                            {/* Rank Filter */}
                            <select
                                value={rankFilter || ''}
                                onChange={(e) => setRankFilter(e.target.value || null)}
                                className={`px-3 py-2 rounded-lg text-sm border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff]`}
                            >
                                <option value="">All Ranks</option>
                                <option value="R5">R5</option>
                                <option value="R4">R4</option>
                                <option value="R3">R3</option>
                                <option value="R2">R2</option>
                                <option value="R1">R1</option>
                            </select>
                            {/* AoO Filter */}
                            <select
                                value={aooFilter}
                                onChange={(e) => setAooFilter(e.target.value as typeof aooFilter)}
                                className={`px-3 py-2 rounded-lg text-sm border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff]`}
                            >
                                <option value="all">All AoO</option>
                                <option value="assigned">AoO Assigned</option>
                                <option value="unassigned">AoO Unassigned</option>
                                <option value="participated">AoO Participated</option>
                                <option value="missed">AoO Missed</option>
                            </select>
                            {(sortField !== 'default' || rankFilter || aooFilter !== 'all') && (
                                <button
                                    onClick={resetToDefaultSort}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium ${theme.button} whitespace-nowrap`}
                                    title="Reset filters and sort to default"
                                >
                                    Reset
                                </button>
                            )}
                            {/* View Options Button */}
                            <div className="relative" data-view-options>
                                <button
                                    onClick={() => setShowViewOptions(!showViewOptions)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium ${theme.button} flex items-center gap-2 ${showViewOptions ? 'ring-2 ring-[#4318ff]' : ''}`}
                                    title="View Options"
                                >
                                    <Eye className="w-4 h-4" />
                                    <span className="hidden sm:inline">View</span>
                                    <ChevronDown className={`w-4 h-4 transition-transform ${showViewOptions ? 'rotate-180' : ''}`} />
                                </button>
                                {/* View Options Dropdown - using z-[9999] to ensure it's above everything */}
                                {showViewOptions && (
                                    <div className={`absolute right-0 top-full mt-2 w-72 ${theme.card} border rounded-xl shadow-2xl z-[9999]`}>
                                        <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
                                            <span className="text-sm font-semibold">Visible Columns</span>
                                            <button
                                                onClick={resetColumns}
                                                className={`text-xs ${theme.textMuted} hover:text-white`}
                                            >
                                                Reset
                                            </button>
                                        </div>
                                        <div className="max-h-80 overflow-y-auto p-2">
                                            {(['core', 'combat', 'events', 'profile'] as const).map(category => (
                                                <div key={category} className="mb-3">
                                                    <div className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted} px-2 py-1`}>
                                                        {category}
                                                    </div>
                                                    {COLUMN_CONFIG.filter(c => c.category === category).map(col => (
                                                        <button
                                                            key={col.id}
                                                            onClick={() => toggleColumn(col.id)}
                                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--background-secondary)] transition-colors`}
                                                        >
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${isColumnVisible(col.id) ? 'bg-[#4318ff] border-[#4318ff]' : 'border-[var(--border)]'}`}>
                                                                {isColumnVisible(col.id) && <Check className="w-3 h-3 text-white" />}
                                                            </div>
                                                            <span className="text-sm">{col.label}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500">
                        {error}
                    </div>
                )}

                {/* Roster Table */}
                <div className={`${theme.card} border rounded-xl`}>
                    {/* Table hint for non-editors */}
                    {!isEditor && (
                        <div className="px-3 sm:px-4 py-2 border-b border-[var(--border)] flex items-center justify-between">
                            <span className={`text-[10px] sm:text-xs ${theme.textMuted}`}>
                                <span className="hidden sm:inline">Click column headers to sort •</span> Tap name for details
                            </span>
                            <button
                                onClick={() => setShowPasswordPrompt(true)}
                                className={`text-[10px] sm:text-xs ${theme.textMuted} hover:text-[#9f7aea] transition-colors flex items-center gap-1`}
                            >
                                <Edit2 className="w-3 h-3" />
                                <span className="hidden sm:inline">Edit KP & notes</span>
                                <span className="sm:hidden">Edit</span>
                            </button>
                        </div>
                    )}
                    <div className="overflow-auto mobile-scroll max-h-[70vh]">
                        <table className="w-full min-w-[320px]">
                            <thead className="sticky top-0 z-10 bg-[var(--background-card)]">
                                <tr className="border-b border-[var(--border)]">
                                    <th className="w-6 sm:w-8"></th>
                                    <th className="text-center px-1 sm:px-2 py-2 sm:py-3 w-8 sm:w-10">
                                        <span className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>#</span>
                                    </th>
                                    <th className="text-left px-2 sm:px-4 py-2 sm:py-3">
                                        <ColumnTooltip text={COLUMN_TOOLTIPS.name}>
                                            <button
                                                onClick={() => handleSort('name')}
                                                className={`flex items-center gap-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white`}
                                            >
                                                Name <SortIcon field="name" />
                                            </button>
                                        </ColumnTooltip>
                                    </th>
                                    {isColumnVisible('power') && (
                                        <th className="text-right px-2 sm:px-4 py-2 sm:py-3">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.power}>
                                                <button
                                                    onClick={() => handleSort('power')}
                                                    className={`flex items-center gap-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white ml-auto`}
                                                >
                                                    <span className="hidden sm:inline">Power</span>
                                                    <span className="sm:hidden">Pwr</span>
                                                    <SortIcon field="power" />
                                                </button>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('kp') && (
                                        <th className="text-right px-2 sm:px-4 py-2 sm:py-3">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.kp}>
                                                <button
                                                    onClick={() => handleSort('kills')}
                                                    className={`flex items-center gap-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white ml-auto`}
                                                >
                                                    KP <SortIcon field="kills" />
                                                </button>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('t4t5') && (
                                        <th className="text-right px-4 py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.t4t5}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    T4/T5 KP
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('t1t2t3') && (
                                        <th className="text-right px-4 py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.t1t2t3}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    T1/T2/T3
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('deads') && (
                                        <th className="text-right px-4 py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.deads}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    Deaths
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('healed') && (
                                        <th className="text-right px-4 py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.healed}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    Healed
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('honor') && (
                                        <th className="text-right px-4 py-3 hidden lg:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.honor}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    Honor
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('aoo') && (
                                        <th className="text-center px-4 py-3 hidden lg:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.aoo}>
                                                <button
                                                    onClick={() => handleSort('aoo')}
                                                    className={`flex items-center gap-1 mx-auto text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-[var(--foreground)] transition-colors`}
                                                >
                                                    AoO
                                                    <SortIcon field="aoo" />
                                                </button>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('mob') && (
                                        <th className="text-center px-4 py-3 hidden lg:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.mob}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    Mob
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('acclaim') && (
                                        <th className="text-right px-4 py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.acclaim}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    Acclaim
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('kvkPts') && (
                                        <th className="text-right px-4 py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.kvkPts}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    KvK Pts
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('highestPower') && (
                                        <th className="text-right px-4 py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.highestPower}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    Peak Pwr
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('ch') && (
                                        <th className="text-center px-4 py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.ch}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    CH
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('civilization') && (
                                        <th className="text-center px-4 py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.civilization}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    Civ
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('rank') && (
                                        <th className="text-center px-2 sm:px-4 py-2 sm:py-3">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.rank}>
                                                <button
                                                    onClick={() => handleSort('role')}
                                                    className={`flex items-center gap-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white mx-auto`}
                                                >
                                                    <span className="hidden sm:inline">Rank</span>
                                                    <span className="sm:hidden">R</span>
                                                    <SortIcon field="role" />
                                                </button>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('alliance') && (
                                        <th className="text-left px-4 py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.alliance}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    Alliance
                                                </span>
                                            </ColumnTooltip>
                                        </th>
                                    )}
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
                                {paginatedRoster.map((member, idx) => {
                                    const globalIdx = rowsPerPage === -1 ? idx : currentPage * rowsPerPage + idx;
                                    const isExpanded = expandedMemberId === member.id;
                                    return (
                                    <React.Fragment key={member.id}>
                                    <tr
                                        className={`border-b border-[var(--border)] ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''} hover:bg-[var(--background-secondary)]/50 active:bg-[var(--background-secondary)]/70`}
                                    >
                                        <td className="px-1 py-2 sm:py-3">
                                            <button
                                                onClick={() => handleExpandRow(member.id, member.name)}
                                                className={`p-0.5 rounded hover:bg-[var(--background-secondary)] ${theme.textMuted} transition-transform`}
                                                title={isExpanded ? 'Collapse' : 'Show snapshot history'}
                                            >
                                                <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                        </td>
                                        <td className={`text-center px-1 sm:px-2 py-2 sm:py-3 text-xs sm:text-sm ${theme.textMuted}`}>{globalIdx + 1}</td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 relative">
                                            {/* Recent update indicator - green dot for updates within 24h */}
                                            {member.updated_at && (Date.now() - new Date(member.updated_at).getTime()) < 86400000 && (
                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 align-middle" title={`Updated ${new Date(member.updated_at).toLocaleString()}`} />
                                            )}
                                            <span
                                                className="font-medium cursor-pointer hover:text-[#9f7aea] active:text-[#9f7aea] transition-colors text-sm sm:text-base"
                                                onMouseEnter={(e) => {
                                                    if (memberHoverTimeoutRef.current) {
                                                        clearTimeout(memberHoverTimeoutRef.current);
                                                        memberHoverTimeoutRef.current = null;
                                                    }
                                                    setHoverPosition({ x: e.clientX + 15, y: e.clientY + 15 });
                                                    setHoveredMember(member.name);
                                                }}
                                                onMouseMove={(e) => {
                                                    if (hoveredMember === member.name && !pinnedMember) {
                                                        setHoverPosition({ x: e.clientX + 15, y: e.clientY + 15 });
                                                    }
                                                }}
                                                onMouseLeave={() => {
                                                    memberHoverTimeoutRef.current = setTimeout(() => {
                                                        setHoveredMember(null);
                                                    }, 100);
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // On mobile, center the card on screen
                                                    const isMobile = window.innerWidth < 640;
                                                    if (pinnedMember === member.name) {
                                                        setPinnedMember(null);
                                                    } else {
                                                        // Clear any hover state first
                                                        setHoveredMember(null);
                                                        setPinnedMember(member.name);
                                                        if (isMobile) {
                                                            // Center on mobile - account for card width (280px on mobile)
                                                            setPinnedPosition({ x: Math.max(10, (window.innerWidth - 280) / 2), y: 80 });
                                                        } else {
                                                            setPinnedPosition({ x: hoverPosition.x, y: hoverPosition.y });
                                                        }
                                                    }
                                                }}
                                            >
                                                {member.name}
                                            </span>
                                            {member.tags?.includes('angmar-og') && (
                                                <span className="ml-1 sm:ml-2 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[10px] font-semibold rounded bg-amber-500/20 text-amber-400" title="Angmar Core">ANG</span>
                                            )}
                                            {member.tags?.includes('inactive') && (
                                                <span className="ml-0.5 sm:ml-1 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[10px] font-semibold rounded bg-gray-500/20 text-gray-400" title="Inactive">AFK</span>
                                            )}
                                            {member.tags?.includes('quit') && (
                                                <span className="ml-0.5 sm:ml-1 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[10px] font-semibold rounded bg-red-500/20 text-red-400" title="Quit">QUIT</span>
                                            )}
                                        </td>
                                        {isColumnVisible('power') && (
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                                                {editingId === member.id ? (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <input
                                                            ref={firstEditInputRef}
                                                            type="number"
                                                            step="0.1"
                                                            value={editValues.powerM}
                                                            onChange={(e) => setEditValues({ ...editValues, powerM: e.target.value })}
                                                            onKeyDown={handleEditKeyDown}
                                                            className={`w-16 sm:w-20 px-2 py-1 rounded border ${theme.input} text-right text-sm`}
                                                            placeholder="0.0"
                                                        />
                                                        <span className={`text-xs ${theme.textMuted}`}>M</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[#01b574] text-sm sm:text-base">{formatPower(member.power)}</span>
                                                )}
                                            </td>
                                        )}
                                        {isColumnVisible('kp') && (
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                                                {editingId === member.id ? (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={editValues.killsM}
                                                            onChange={(e) => setEditValues({ ...editValues, killsM: e.target.value })}
                                                            onKeyDown={handleEditKeyDown}
                                                            className={`w-16 sm:w-20 px-2 py-1 rounded border ${theme.input} text-right text-sm`}
                                                            placeholder="0.0"
                                                        />
                                                        <span className={`text-xs ${theme.textMuted}`}>M</span>
                                                    </div>
                                                ) : (
                                                    <span className={`text-sm sm:text-base ${member.kills ? 'text-[#f56565]' : theme.textMuted}`}>
                                                        {member.kills ? formatPower(member.kills) : '-'}
                                                    </span>
                                                )}
                                            </td>
                                        )}
                                        {isColumnVisible('t4t5') && (
                                            <td className="px-4 py-3 text-right hidden md:table-cell">
                                                {editingId === member.id ? (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <input
                                                            type="text"
                                                            value={editValues.t4t5KillsM}
                                                            onChange={(e) => setEditValues({ ...editValues, t4t5KillsM: e.target.value })}
                                                            onKeyDown={handleEditKeyDown}
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
                                        )}
                                        {isColumnVisible('t1t2t3') && (
                                            <td className="px-4 py-3 text-right hidden md:table-cell">
                                                <span className={(member.t1_kills || member.t2_kills || member.t3_kills) ? 'text-[#48bb78]' : theme.textMuted}>
                                                    {(member.t1_kills || member.t2_kills || member.t3_kills)
                                                        ? `${formatPower(member.t1_kills || 0)}/${formatPower(member.t2_kills || 0)}/${formatPower(member.t3_kills || 0)}`
                                                        : '-'}
                                                </span>
                                            </td>
                                        )}
                                        {isColumnVisible('deads') && (
                                            <td className="px-4 py-3 text-right hidden md:table-cell">
                                                <span className={member.deads ? 'text-[#fc8181]' : theme.textMuted}>
                                                    {member.deads ? formatPower(member.deads) : '-'}
                                                </span>
                                            </td>
                                        )}
                                        {isColumnVisible('healed') && (
                                            <td className="px-4 py-3 text-right hidden md:table-cell">
                                                <span className={member.troops_healed ? 'text-[#68d391]' : theme.textMuted}>
                                                    {member.troops_healed ? formatPower(member.troops_healed) : '-'}
                                                </span>
                                            </td>
                                        )}
                                        {isColumnVisible('honor') && (
                                            <td className="px-4 py-3 text-right hidden lg:table-cell">
                                                {editingId === member.id ? (
                                                    <input
                                                        type="number"
                                                        value={editValues.honor}
                                                        onChange={(e) => setEditValues({ ...editValues, honor: e.target.value })}
                                                        onKeyDown={handleEditKeyDown}
                                                        className={`w-20 px-2 py-1 rounded border ${theme.input} text-right`}
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <span className={member.honor_points ? 'text-[#f6ad55]' : theme.textMuted}>
                                                        {member.honor_points ? member.honor_points.toLocaleString() : '-'}
                                                    </span>
                                                )}
                                            </td>
                                        )}
                                        {isColumnVisible('aoo') && (
                                            <td className="px-4 py-3 text-center hidden lg:table-cell">
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
                                        )}
                                        {isColumnVisible('mob') && (
                                            <td className="px-4 py-3 text-center hidden lg:table-cell">
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
                                        )}
                                        {isColumnVisible('acclaim') && (
                                            <td className="px-4 py-3 text-right hidden md:table-cell">
                                                <span className={member.acclaim ? 'text-[#9f7aea]' : theme.textMuted}>
                                                    {member.acclaim ? member.acclaim.toLocaleString() : '-'}
                                                </span>
                                            </td>
                                        )}
                                        {isColumnVisible('kvkPts') && (
                                            <td className="px-4 py-3 text-right hidden md:table-cell">
                                                <span className={member.kvk_points ? 'text-[#4fd1c5]' : theme.textMuted}>
                                                    {member.kvk_points ? formatPower(member.kvk_points) : '-'}
                                                </span>
                                            </td>
                                        )}
                                        {isColumnVisible('highestPower') && (
                                            <td className="px-4 py-3 text-right hidden md:table-cell">
                                                <span className={member.highest_power ? 'text-[#01b574]' : theme.textMuted}>
                                                    {member.highest_power ? formatPower(member.highest_power) : '-'}
                                                </span>
                                            </td>
                                        )}
                                        {isColumnVisible('ch') && (
                                            <td className="px-4 py-3 text-center hidden md:table-cell">
                                                <span className={member.castle_hall ? '' : theme.textMuted}>
                                                    {member.castle_hall || '-'}
                                                </span>
                                            </td>
                                        )}
                                        {isColumnVisible('civilization') && (
                                            <td className="px-4 py-3 text-center hidden md:table-cell">
                                                <span className={member.civilization ? '' : theme.textMuted}>
                                                    {member.civilization || '-'}
                                                </span>
                                            </td>
                                        )}
                                        {isColumnVisible('rank') && (
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
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
                                        )}
                                        {isColumnVisible('alliance') && (
                                            <td className="px-4 py-3 hidden md:table-cell">
                                                <span
                                                    className={`text-sm ${member.alliance ? 'text-[#9f7aea] cursor-pointer hover:underline' : theme.textMuted}`}
                                                    onClick={() => member.alliance && setAllianceFilter(member.alliance)}
                                                >
                                                    {member.alliance || '-'}
                                                </span>
                                            </td>
                                        )}
                                        {isEditor && (
                                            <td className="px-4 py-3">
                                                {editingId === member.id ? (
                                                    <input
                                                        type="text"
                                                        value={editValues.notes}
                                                        onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                                                        onKeyDown={handleEditKeyDown}
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
                                    {/* Expandable snapshot history row */}
                                    {isExpanded && (
                                        <tr className="bg-[var(--background-secondary)]/50">
                                            <td colSpan={100} className="px-4 py-3">
                                                <div className="ml-6">
                                                    <h4 className={`text-sm font-semibold mb-2 ${theme.textMuted}`}>
                                                        Snapshot History for {member.name}
                                                    </h4>
                                                    {loadingSnapshots ? (
                                                        <div className={`text-sm ${theme.textMuted}`}>Loading...</div>
                                                    ) : memberSnapshots.length === 0 ? (
                                                        <div className={`text-sm ${theme.textMuted}`}>No snapshot history found</div>
                                                    ) : (
                                                        <div className="overflow-x-auto">
                                                            <table className="text-xs sm:text-sm">
                                                                <thead>
                                                                    <tr className={`border-b border-[var(--border)] ${theme.textMuted}`}>
                                                                        <th className="text-left px-2 py-1">Date</th>
                                                                        <th className="text-right px-2 py-1">Power</th>
                                                                        <th className="text-right px-2 py-1">KP</th>
                                                                        <th className="text-right px-2 py-1">T4</th>
                                                                        <th className="text-right px-2 py-1">T5</th>
                                                                        <th className="text-right px-2 py-1">Honor</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {memberSnapshots.map((snap, snapIdx) => {
                                                                        // Compare with previous snapshot to detect carryovers
                                                                        const prevSnap = snapIdx > 0 ? memberSnapshots[snapIdx - 1] : null;
                                                                        const isCarryover = (current: number | undefined, prev: number | undefined) =>
                                                                            prevSnap && current === prev;

                                                                        const carryoverClass = "opacity-40 italic";
                                                                        const powerCarry = isCarryover(snap.power, prevSnap?.power);
                                                                        const killsCarry = isCarryover(snap.kills, prevSnap?.kills);
                                                                        const t4Carry = isCarryover(snap.t4_kills, prevSnap?.t4_kills);
                                                                        const t5Carry = isCarryover(snap.t5_kills, prevSnap?.t5_kills);
                                                                        const honorCarry = isCarryover(snap.honor_points, prevSnap?.honor_points);

                                                                        return (
                                                                            <tr key={snap.id || snapIdx} className="border-b border-[var(--border)]/30">
                                                                                <td className="px-2 py-1 text-[#9f7aea]">
                                                                                    {formatDate(snap.snapshot_date)}
                                                                                </td>
                                                                                <td className={`px-2 py-1 text-right text-[#01b574] ${powerCarry ? carryoverClass : ''}`}>
                                                                                    {formatPower(snap.power)}
                                                                                </td>
                                                                                <td className={`px-2 py-1 text-right text-[#f56565] ${killsCarry ? carryoverClass : ''}`}>
                                                                                    {formatPower(snap.kills)}
                                                                                </td>
                                                                                <td className={`px-2 py-1 text-right text-[#fbbf24] ${t4Carry ? carryoverClass : ''}`}>
                                                                                    {formatPower(snap.t4_kills)}
                                                                                </td>
                                                                                <td className={`px-2 py-1 text-right text-[#f97316] ${t5Carry ? carryoverClass : ''}`}>
                                                                                    {formatPower(snap.t5_kills)}
                                                                                </td>
                                                                                <td className={`px-2 py-1 text-right text-[#fbbf24] ${honorCarry ? carryoverClass : ''}`}>
                                                                                    {snap.honor_points?.toLocaleString() || '-'}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                            <div className={`text-[10px] ${theme.textMuted} mt-2 italic`}>
                                                                Dimmed values are unchanged from previous snapshot
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {filteredRoster.length > 0 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-[var(--border)] gap-2">
                            <div className="flex items-center gap-2 text-sm">
                                <span className={theme.textMuted}>Rows per page:</span>
                                <select
                                    value={rowsPerPage}
                                    onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(0); }}
                                    className={`${theme.input} px-2 py-1 rounded text-sm border`}
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={-1}>All</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                                <span className={theme.textMuted}>
                                    {rowsPerPage === -1
                                        ? `Showing all ${filteredRoster.length} members`
                                        : `Showing ${Math.min(currentPage * rowsPerPage + 1, filteredRoster.length)}-${Math.min((currentPage + 1) * rowsPerPage, filteredRoster.length)} of ${filteredRoster.length}`
                                    }
                                </span>
                                {rowsPerPage !== -1 && totalPages > 1 && (
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                                            disabled={currentPage === 0}
                                            className={`px-3 py-1 rounded ${theme.button} disabled:opacity-50`}
                                        >
                                            Prev
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                                            disabled={currentPage >= totalPages - 1}
                                            className={`px-3 py-1 rounded ${theme.button} disabled:opacity-50`}
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {filteredRoster.length === 0 && (
                        <div className="py-12 text-center">
                            <p className={theme.textMuted}>No members found</p>
                        </div>
                    )}
                </div>
                    </>
                )}

                {/* Growth Tab */}
                {activeTab === 'history' && (
                    <div className="space-y-6">
                        {/* Show Charts Toggle */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <button
                                onClick={() => setShowCharts(!showCharts)}
                                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                    showCharts
                                        ? 'bg-[#4318ff] text-white'
                                        : `${theme.button}`
                                }`}
                            >
                                <TrendingUp className="w-3.5 h-3.5" />
                                {showCharts ? 'Hide Charts' : 'Show Charts'}
                            </button>

                            {/* Chart Controls - Only show when charts visible */}
                            {showCharts && (
                                <div className="flex flex-wrap items-center gap-3">
                                    {/* Alliance/Individual Toggle */}
                                    <div className="flex items-center gap-1 bg-[var(--background-secondary)] rounded-lg p-0.5">
                                        <button
                                            onClick={() => setChartMode('alliance')}
                                            className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                                                chartMode === 'alliance'
                                                    ? 'bg-[#4318ff] text-white'
                                                    : `${theme.textMuted} hover:text-[var(--foreground)]`
                                            }`}
                                        >
                                            Alliance
                                        </button>
                                        <button
                                            onClick={() => setChartMode('individual')}
                                            className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                                                chartMode === 'individual'
                                                    ? 'bg-[#4318ff] text-white'
                                                    : `${theme.textMuted} hover:text-[var(--foreground)]`
                                            }`}
                                        >
                                            Individual
                                        </button>
                                    </div>

                                    {/* Player Selector - Only for individual mode */}
                                    {chartMode === 'individual' && (
                                        <select
                                            value={selectedPlayer}
                                            onChange={(e) => setSelectedPlayer(e.target.value)}
                                            className={`${theme.input} px-2 py-1 rounded text-xs max-w-[180px]`}
                                        >
                                            <option value="">Select player...</option>
                                            {displayRoster
                                                .sort((a, b) => a.name.localeCompare(b.name))
                                                .map(m => (
                                                    <option key={m.id} value={m.name}>{m.name}</option>
                                                ))
                                            }
                                        </select>
                                    )}

                                    {/* Metric Toggles - Only for alliance mode */}
                                    {chartMode === 'alliance' && (
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs ${theme.textMuted}`}>View:</span>
                                            <div className="flex gap-1">
                                                {[
                                                    { key: 'all', label: 'All', color: '#4318ff' },
                                                    { key: 'kp', label: 'KP', color: '#f56565' },
                                                    { key: 'power', label: 'Power', color: '#01b574' },
                                                    { key: 'honor', label: 'Honor', color: '#fbbf24' },
                                                    { key: 'members', label: 'Members', color: '#9f7aea' },
                                                ].map(metric => (
                                                    <button
                                                        key={metric.key}
                                                        onClick={() => setChartMetric(metric.key as 'all' | 'kp' | 'power' | 'honor' | 'members')}
                                                        className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                                                            chartMetric === metric.key
                                                                ? 'text-white'
                                                                : `${theme.textMuted} hover:text-[var(--foreground)] bg-[var(--background-secondary)]`
                                                        }`}
                                                        style={chartMetric === metric.key ? { backgroundColor: metric.color } : {}}
                                                    >
                                                        {metric.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {historyLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-5 h-5 border-2 border-[#4318ff] border-t-transparent rounded-full animate-spin"></div>
                                <span className={`ml-3 ${theme.textMuted}`}>Loading growth data...</span>
                            </div>
                        ) : dailyTotals.length === 0 ? (
                            <div className={`${theme.card} border rounded-xl p-8 text-center`}>
                                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-[#4318ff]/50" />
                                <h3 className="text-lg font-semibold mb-2">No Growth Data Yet</h3>
                                <p className={`text-sm ${theme.textMuted} mb-4`}>
                                    Start tracking by importing roster data or clicking "Lock Today" to create your first snapshot.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Compute filtered data based on tag filter - used by both charts and overview */}
                                {(() => {
                                    // Get filtered member names based on tag filter
                                    const filteredMemberNames = new Set(
                                        roster
                                            .filter(m => !tagFilter || m.tags?.includes(tagFilter))
                                            .map(m => m.name)
                                    );

                                    // Compute totals from allSnapshots filtered by tag
                                    const snapshotsByDate = new Map<string, { kills: number; power: number; honor: number; count: number; date: string }>();

                                    for (const snap of allSnapshots) {
                                        // Only include members that match the current tag filter
                                        if (!filteredMemberNames.has(snap.member_name)) continue;

                                        const existing = snapshotsByDate.get(snap.snapshot_date) || { kills: 0, power: 0, honor: 0, count: 0, date: snap.snapshot_date };
                                        snapshotsByDate.set(snap.snapshot_date, {
                                            kills: existing.kills + (snap.kills || 0),
                                            power: existing.power + (snap.power || 0),
                                            honor: existing.honor + (snap.honor_points || 0),
                                            count: existing.count + 1,
                                            date: snap.snapshot_date,
                                        });
                                    }

                                    // Convert to array sorted by date
                                    const filteredDailyTotals = Array.from(snapshotsByDate.entries())
                                        .sort((a, b) => a[0].localeCompare(b[0]))
                                        .map(([, totals]) => totals);

                                    const memberLabel = tagFilter
                                        ? (tagFilter === 'angmar-og' ? 'Core Members' : tagFilter === 'inactive' ? 'Inactive' : tagFilter === 'quit' ? 'Quit' : 'Members')
                                        : 'All Members';

                                    return (
                                        <>
                                {/* Line Charts Section - Shows above overview when enabled */}
                                {showCharts && (() => {
                                    // Individual player chart mode
                                    if (chartMode === 'individual') {
                                        if (!selectedPlayer) {
                                            return (
                                                <div className={`${theme.card} border rounded-xl p-8 text-center`}>
                                                    <Users className="w-12 h-12 mx-auto mb-4 text-[#4318ff]/50" />
                                                    <p className={`text-sm ${theme.textMuted}`}>Select a player to view their individual growth charts</p>
                                                </div>
                                            );
                                        }

                                        if (playerHistory.length === 0) {
                                            return (
                                                <div className={`${theme.card} border rounded-xl p-8 text-center`}>
                                                    <TrendingUp className="w-12 h-12 mx-auto mb-4 text-[#4318ff]/50" />
                                                    <p className={`text-sm ${theme.textMuted}`}>No historical data for {selectedPlayer}</p>
                                                </div>
                                            );
                                        }

                                        const playerChartData = playerHistory.map(snap => ({
                                            date: formatDate(snap.snapshot_date),
                                            kp: snap.kills || 0,
                                            power: snap.power || 0,
                                            honor: snap.honor_points || 0,
                                            t4: snap.t4_kills || 0,
                                            t5: snap.t5_kills || 0,
                                        }));

                                        const playerMetrics = [
                                            { key: 'kp', label: 'Kill Points', color: '#f56565' },
                                            { key: 'power', label: 'Power', color: '#01b574' },
                                            { key: 'honor', label: 'Honor', color: '#fbbf24' },
                                            { key: 't4', label: 'T4 Kills', color: '#f97316' },
                                            { key: 't5', label: 'T5 Kills', color: '#9f7aea' },
                                        ];

                                        const renderPlayerChart = (metric: typeof playerMetrics[0], height: number = 200) => (
                                            <div key={metric.key} className={`${theme.card} border rounded-xl p-4`}>
                                                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: metric.color }} />
                                                    {metric.label}
                                                </h4>
                                                <div style={{ height }}>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={playerChartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                                            <XAxis
                                                                dataKey="date"
                                                                tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                                                axisLine={{ stroke: 'var(--border)' }}
                                                                tickLine={{ stroke: 'var(--border)' }}
                                                            />
                                                            <YAxis
                                                                tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                                                axisLine={{ stroke: 'var(--border)' }}
                                                                tickLine={{ stroke: 'var(--border)' }}
                                                                tickFormatter={(value) => formatPower(value)}
                                                                width={50}
                                                            />
                                                            <Tooltip
                                                                contentStyle={{
                                                                    backgroundColor: 'var(--background-card)',
                                                                    border: '1px solid var(--border)',
                                                                    borderRadius: '8px',
                                                                    color: 'var(--foreground)',
                                                                }}
                                                                formatter={(value) => [formatPower(typeof value === 'number' ? value : 0), metric.label]}
                                                                labelStyle={{ color: 'var(--foreground)' }}
                                                            />
                                                            <Line
                                                                type="monotone"
                                                                dataKey={metric.key}
                                                                name={metric.label}
                                                                stroke={metric.color}
                                                                strokeWidth={2}
                                                                dot={{ fill: metric.color, strokeWidth: 2, r: 3 }}
                                                                activeDot={{ r: 5 }}
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        );

                                        // Calculate growth stats
                                        const firstSnap = playerHistory[0];
                                        const lastSnap = playerHistory[playerHistory.length - 1];
                                        const kpGrowth = (lastSnap?.kills || 0) - (firstSnap?.kills || 0);
                                        const powerGrowth = (lastSnap?.power || 0) - (firstSnap?.power || 0);
                                        const honorGrowth = (lastSnap?.honor_points || 0) - (firstSnap?.honor_points || 0);

                                        return (
                                            <div className="space-y-4">
                                                {/* Player Header */}
                                                <div className={`${theme.card} border rounded-xl p-4`}>
                                                    <h3 className="text-lg font-semibold mb-2">{selectedPlayer}</h3>
                                                    <div className="grid grid-cols-3 gap-4 text-center">
                                                        <div>
                                                            <div className={`text-xs ${theme.textMuted}`}>KP Growth</div>
                                                            <div className={`text-sm font-semibold ${kpGrowth > 0 ? 'text-[#f56565]' : 'text-gray-400'}`}>
                                                                {kpGrowth > 0 ? '+' : ''}{formatPower(kpGrowth)}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className={`text-xs ${theme.textMuted}`}>Power Growth</div>
                                                            <div className={`text-sm font-semibold ${powerGrowth > 0 ? 'text-[#01b574]' : 'text-gray-400'}`}>
                                                                {powerGrowth > 0 ? '+' : ''}{formatPower(powerGrowth)}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className={`text-xs ${theme.textMuted}`}>Honor Growth</div>
                                                            <div className={`text-sm font-semibold ${honorGrowth > 0 ? 'text-[#fbbf24]' : 'text-gray-400'}`}>
                                                                {honorGrowth > 0 ? '+' : ''}{honorGrowth.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className={`text-xs ${theme.textMuted} mt-2 text-center`}>
                                                        {formatDate(firstSnap?.snapshot_date || '')} → {formatDate(lastSnap?.snapshot_date || '')} ({playerHistory.length} snapshots)
                                                    </div>
                                                </div>

                                                {/* Player Charts Grid */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {playerMetrics.map(m => renderPlayerChart(m, 180))}
                                                </div>
                                            </div>
                                        );
                                    }

                                    // Alliance chart mode (existing code)
                                    const chartData = filteredDailyTotals.map(day => ({
                                        date: formatDate(day.date),
                                        kp: day.kills,
                                        power: day.power,
                                        honor: day.honor,
                                        members: day.count,
                                    }));

                                    const metrics = [
                                        { key: 'kp', label: 'Kill Points', color: '#f56565', isCount: false },
                                        { key: 'power', label: 'Power', color: '#01b574', isCount: false },
                                        { key: 'honor', label: 'Honor', color: '#fbbf24', isCount: false },
                                        { key: 'members', label: memberLabel, color: '#9f7aea', isCount: true },
                                    ];

                                    const renderChart = (metric: typeof metrics[0], height: number = 300) => (
                                        <div key={metric.key} className={`${theme.card} border rounded-xl p-4`}>
                                            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: metric.color }} />
                                                {metric.label}
                                            </h4>
                                            <div style={{ height }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                                        <XAxis
                                                            dataKey="date"
                                                            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                                            axisLine={{ stroke: 'var(--border)' }}
                                                            tickLine={{ stroke: 'var(--border)' }}
                                                        />
                                                        <YAxis
                                                            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                                            axisLine={{ stroke: 'var(--border)' }}
                                                            tickLine={{ stroke: 'var(--border)' }}
                                                            tickFormatter={(value) => metric.isCount ? String(value) : formatPower(value)}
                                                            width={50}
                                                        />
                                                        <Tooltip
                                                            contentStyle={{
                                                                backgroundColor: 'var(--background-card)',
                                                                border: '1px solid var(--border)',
                                                                borderRadius: '8px',
                                                                color: 'var(--foreground)',
                                                            }}
                                                            formatter={(value) => {
                                                                const numVal = typeof value === 'number' ? value : 0;
                                                                return [metric.isCount ? String(numVal) : formatPower(numVal), metric.label];
                                                            }}
                                                            labelStyle={{ color: 'var(--foreground)' }}
                                                        />
                                                        <Line
                                                            type="monotone"
                                                            dataKey={metric.key}
                                                            name={metric.label}
                                                            stroke={metric.color}
                                                            strokeWidth={2}
                                                            dot={{ fill: metric.color, strokeWidth: 2, r: 3 }}
                                                            activeDot={{ r: 5 }}
                                                        />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    );

                                    // Show all charts in 2x2 grid or single chart
                                    if (chartMetric === 'all') {
                                        return (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {metrics.map(m => renderChart(m, 200))}
                                            </div>
                                        );
                                    }

                                    const selectedMetric = metrics.find(m => m.key === chartMetric)!;
                                    return renderChart(selectedMetric, 350);
                                })()}

                                {/* Alliance Stats Overview - 2x2 Grid */}
                                <div className="grid grid-cols-2 gap-2 sm:gap-4">
                                    {/* Total Power Over Time */}
                                    <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                        <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                            <TrendingUp className="w-3 sm:w-4 h-3 sm:h-4 text-[#01b574]" />
                                            <span className="hidden sm:inline">Total</span> Power
                                        </h3>
                                        <div className="space-y-1 sm:space-y-1.5">
                                            {filteredDailyTotals.slice(-5).map((day) => {
                                                const maxPower = Math.max(...filteredDailyTotals.map(d => d.power), 1);
                                                const pct = (day.power / maxPower) * 100;
                                                return (
                                                    <div key={day.date} className="flex items-center gap-1 sm:gap-2">
                                                        <span className={`text-[10px] sm:text-xs ${theme.textMuted} w-8 sm:w-12`}>{formatDate(day.date)}</span>
                                                        <div className="flex-1 h-3 sm:h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-[#01b574] to-[#01b574]/50 rounded"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] sm:text-xs font-medium w-10 sm:w-14 text-right">{formatPower(day.power)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Total KP Over Time */}
                                    <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                        <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                            <TrendingUp className="w-3 sm:w-4 h-3 sm:h-4 text-[#f56565]" />
                                            <span className="hidden sm:inline">Total</span> KP
                                        </h3>
                                        <div className="space-y-1 sm:space-y-1.5">
                                            {filteredDailyTotals.slice(-5).map((day) => {
                                                const maxKills = Math.max(...filteredDailyTotals.map(d => d.kills), 1);
                                                const pct = (day.kills / maxKills) * 100;
                                                return (
                                                    <div key={day.date} className="flex items-center gap-1 sm:gap-2">
                                                        <span className={`text-[10px] sm:text-xs ${theme.textMuted} w-8 sm:w-12`}>{formatDate(day.date)}</span>
                                                        <div className="flex-1 h-3 sm:h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-[#f56565] to-[#f56565]/50 rounded"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] sm:text-xs font-medium w-10 sm:w-14 text-right">{formatPower(day.kills)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Total Honor Over Time */}
                                    <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                        <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                            <Trophy className="w-3 sm:w-4 h-3 sm:h-4 text-[#fbbf24]" />
                                            Honor
                                        </h3>
                                        <div className="space-y-1 sm:space-y-1.5">
                                            {filteredDailyTotals.slice(-5).map((day) => {
                                                const maxHonor = Math.max(...filteredDailyTotals.map(d => d.honor), 1);
                                                const pct = (day.honor / maxHonor) * 100;
                                                return (
                                                    <div key={day.date} className="flex items-center gap-1 sm:gap-2">
                                                        <span className={`text-[10px] sm:text-xs ${theme.textMuted} w-8 sm:w-12`}>{formatDate(day.date)}</span>
                                                        <div className="flex-1 h-3 sm:h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-[#fbbf24] to-[#fbbf24]/50 rounded"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] sm:text-xs font-medium w-10 sm:w-14 text-right">{formatPower(day.honor)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Member Count */}
                                    <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                        <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                            <Users className="w-3 sm:w-4 h-3 sm:h-4 text-[#9f7aea]" />
                                            {memberLabel}
                                        </h3>
                                        <div className="space-y-1 sm:space-y-1.5">
                                            {filteredDailyTotals.slice(-5).map((day) => {
                                                const maxCount = Math.max(...filteredDailyTotals.map(d => d.count), 1);
                                                const pct = (day.count / maxCount) * 100;
                                                return (
                                                    <div key={day.date} className="flex items-center gap-1 sm:gap-2">
                                                        <span className={`text-[10px] sm:text-xs ${theme.textMuted} w-8 sm:w-12`}>{formatDate(day.date)}</span>
                                                        <div className="flex-1 h-3 sm:h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-[#9f7aea] to-[#9f7aea]/50 rounded"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] sm:text-xs font-medium w-10 sm:w-14 text-right">{day.count}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

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

                                    const kpTotalPages = Math.ceil(sortedKpGrowth.length / kpGrowthRowsPerPage);
                                    const displayKpMembers = sortedKpGrowth.slice(
                                        kpGrowthPage * kpGrowthRowsPerPage,
                                        (kpGrowthPage + 1) * kpGrowthRowsPerPage
                                    );
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
                                        <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                            <div className="flex items-center justify-between mb-2 sm:mb-4">
                                                <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                                                    <TrendingUp className="w-4 h-4 text-[#f56565]" />
                                                    <span className="hidden sm:inline">Kill Points Growth</span>
                                                    <span className="sm:hidden">KP Growth</span>
                                                    <span className={`text-xs font-normal ${theme.textMuted}`}>({sortedKpGrowth.length})</span>
                                                </h3>
                                            </div>
                                            <div className="overflow-x-auto mobile-scroll">
                                                <table className="w-full text-xs sm:text-sm min-w-[400px]">
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
                                                            const globalIdx = kpGrowthPage * kpGrowthRowsPerPage + idx;
                                                            return (
                                                                <tr key={member.name} className={`border-b border-[var(--border)]/50 ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                                    <td className={`px-2 py-2 ${theme.textMuted}`}>{globalIdx + 1}</td>
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
                                            {/* Pagination Controls */}
                                            {kpTotalPages > 1 && (
                                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                                                    <div className={`text-xs ${theme.textMuted}`}>
                                                        Showing {kpGrowthPage * kpGrowthRowsPerPage + 1}-{Math.min((kpGrowthPage + 1) * kpGrowthRowsPerPage, sortedKpGrowth.length)} of {sortedKpGrowth.length}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={kpGrowthRowsPerPage}
                                                            onChange={(e) => {
                                                                setKpGrowthRowsPerPage(Number(e.target.value));
                                                                setKpGrowthPage(0);
                                                            }}
                                                            className={`text-xs ${theme.card} border rounded px-2 py-1`}
                                                        >
                                                            <option value={10}>10</option>
                                                            <option value={25}>25</option>
                                                            <option value={50}>50</option>
                                                            <option value={100}>100</option>
                                                        </select>
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => setKpGrowthPage(0)}
                                                                disabled={kpGrowthPage === 0}
                                                                className={`px-2 py-1 text-xs rounded ${kpGrowthPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}
                                                            >
                                                                ««
                                                            </button>
                                                            <button
                                                                onClick={() => setKpGrowthPage(p => Math.max(0, p - 1))}
                                                                disabled={kpGrowthPage === 0}
                                                                className={`px-2 py-1 text-xs rounded ${kpGrowthPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}
                                                            >
                                                                «
                                                            </button>
                                                            <span className={`px-2 py-1 text-xs ${theme.textMuted}`}>
                                                                {kpGrowthPage + 1} / {kpTotalPages}
                                                            </span>
                                                            <button
                                                                onClick={() => setKpGrowthPage(p => Math.min(kpTotalPages - 1, p + 1))}
                                                                disabled={kpGrowthPage >= kpTotalPages - 1}
                                                                className={`px-2 py-1 text-xs rounded ${kpGrowthPage >= kpTotalPages - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}
                                                            >
                                                                »
                                                            </button>
                                                            <button
                                                                onClick={() => setKpGrowthPage(kpTotalPages - 1)}
                                                                disabled={kpGrowthPage >= kpTotalPages - 1}
                                                                className={`px-2 py-1 text-xs rounded ${kpGrowthPage >= kpTotalPages - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}
                                                            >
                                                                »»
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Honor Growth Table */}
                                {(() => {
                                    if (honorGrowthData.length === 0) return null;

                                    const sortedHonorGrowth = [...honorGrowthData]
                                        .filter(m => !tagFilter || roster.find(r => r.name === m.name)?.tags?.includes(tagFilter))
                                        .sort((a, b) => {
                                            const { field, direction } = honorGrowthSort;
                                            const multiplier = direction === 'asc' ? 1 : -1;
                                            if (field === 'name') {
                                                return multiplier * a.name.localeCompare(b.name);
                                            }
                                            return multiplier * ((a[field] ?? 0) - (b[field] ?? 0));
                                        });

                                    const honorTotalPages = Math.ceil(sortedHonorGrowth.length / honorGrowthRowsPerPage);
                                    const displayHonorMembers = sortedHonorGrowth.slice(
                                        honorGrowthPage * honorGrowthRowsPerPage,
                                        (honorGrowthPage + 1) * honorGrowthRowsPerPage
                                    );
                                    const date1 = honorGrowthData[0]?.previousDate ? formatDate(honorGrowthData[0].previousDate) : 'Previous';
                                    const date2 = honorGrowthData[0]?.currentDate ? formatDate(honorGrowthData[0].currentDate) : 'Current';

                                    const handleHonorSort = (field: typeof honorGrowthSort.field) => {
                                        setHonorGrowthSort(prev => ({
                                            field,
                                            direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
                                        }));
                                    };

                                    const HonorSortIcon = ({ field }: { field: typeof honorGrowthSort.field }) => {
                                        if (honorGrowthSort.field !== field) return <span className="opacity-30">↕</span>;
                                        return honorGrowthSort.direction === 'asc' ? <span>↑</span> : <span>↓</span>;
                                    };

                                    return (
                                        <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                            <div className="flex items-center justify-between mb-2 sm:mb-4">
                                                <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                                                    <Trophy className="w-4 h-4 text-[#fbbf24]" />
                                                    <span className="hidden sm:inline">Honor Points Growth</span>
                                                    <span className="sm:hidden">Honor Growth</span>
                                                    <span className={`text-xs font-normal ${theme.textMuted}`}>({sortedHonorGrowth.length})</span>
                                                </h3>
                                            </div>
                                            <div className="overflow-x-auto mobile-scroll">
                                                <table className="w-full text-xs sm:text-sm min-w-[600px]" style={{ tableLayout: 'fixed' }}>
                                                    <colgroup>
                                                        <col style={{ width: '5%' }} />
                                                        <col style={{ width: '20%' }} />
                                                        <col style={{ width: '15%' }} />
                                                        <col style={{ width: '15%' }} />
                                                        <col style={{ width: '45%' }} />
                                                    </colgroup>
                                                    <thead className="sticky top-0 bg-[var(--background-card)]">
                                                        <tr className="border-b border-[var(--border)]">
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>#</th>
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleHonorSort('name')} className="flex items-center gap-1 hover:text-white">
                                                                    Name <HonorSortIcon field="name" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                {date1}
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                {date2}
                                                            </th>
                                                            <th className={`px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleHonorSort('honorGrowth')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    Growth <HonorSortIcon field="honorGrowth" />
                                                                </button>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {displayHonorMembers.map((member, idx) => {
                                                            const rosterMember = roster.find(r => r.name === member.name);
                                                            const globalIdx = honorGrowthPage * honorGrowthRowsPerPage + idx;
                                                            return (
                                                                <tr key={member.name} className={`border-b border-[var(--border)]/50 ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                                    <td className={`px-2 py-2 ${theme.textMuted}`}>{globalIdx + 1}</td>
                                                                    <td className="px-2 py-2 font-medium">
                                                                        {member.name}
                                                                        {rosterMember?.tags?.includes('angmar-og') && (
                                                                            <span className="ml-1.5 px-1 py-0.5 text-[9px] font-semibold rounded bg-amber-500/20 text-amber-400">ANG</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#9f7aea]">
                                                                        {member.previousHonor.toLocaleString()}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#01b574]">
                                                                        {member.currentHonor.toLocaleString()}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        {(() => {
                                                                            const maxGrowth = Math.max(...sortedHonorGrowth.map(m => Math.abs(m.honorGrowth)));
                                                                            const pct = maxGrowth > 0 ? (Math.abs(member.honorGrowth) / maxGrowth) * 100 : 0;
                                                                            const isPositive = member.honorGrowth >= 0;
                                                                            return (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[80px]">
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#fbbf24] to-[#fbbf24]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <span className={`text-right font-medium min-w-[70px] ${isPositive ? 'text-[#fbbf24]' : 'text-gray-400'}`}>
                                                                                        {member.honorGrowth >= 0 ? '+' : ''}{member.honorGrowth.toLocaleString()}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {/* Pagination Controls */}
                                            {honorTotalPages > 1 && (
                                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                                                    <div className={`text-xs ${theme.textMuted}`}>
                                                        Showing {honorGrowthPage * honorGrowthRowsPerPage + 1}-{Math.min((honorGrowthPage + 1) * honorGrowthRowsPerPage, sortedHonorGrowth.length)} of {sortedHonorGrowth.length}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={honorGrowthRowsPerPage}
                                                            onChange={(e) => {
                                                                setHonorGrowthRowsPerPage(Number(e.target.value));
                                                                setHonorGrowthPage(0);
                                                            }}
                                                            className={`text-xs ${theme.card} border rounded px-2 py-1`}
                                                        >
                                                            <option value={10}>10</option>
                                                            <option value={25}>25</option>
                                                            <option value={50}>50</option>
                                                            <option value={100}>100</option>
                                                        </select>
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => setHonorGrowthPage(0)}
                                                                disabled={honorGrowthPage === 0}
                                                                className={`px-2 py-1 text-xs rounded ${honorGrowthPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}
                                                            >
                                                                ««
                                                            </button>
                                                            <button
                                                                onClick={() => setHonorGrowthPage(p => Math.max(0, p - 1))}
                                                                disabled={honorGrowthPage === 0}
                                                                className={`px-2 py-1 text-xs rounded ${honorGrowthPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}
                                                            >
                                                                «
                                                            </button>
                                                            <span className={`px-2 py-1 text-xs ${theme.textMuted}`}>
                                                                {honorGrowthPage + 1} / {honorTotalPages}
                                                            </span>
                                                            <button
                                                                onClick={() => setHonorGrowthPage(p => Math.min(honorTotalPages - 1, p + 1))}
                                                                disabled={honorGrowthPage >= honorTotalPages - 1}
                                                                className={`px-2 py-1 text-xs rounded ${honorGrowthPage >= honorTotalPages - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}
                                                            >
                                                                »
                                                            </button>
                                                            <button
                                                                onClick={() => setHonorGrowthPage(honorTotalPages - 1)}
                                                                disabled={honorGrowthPage >= honorTotalPages - 1}
                                                                className={`px-2 py-1 text-xs rounded ${honorGrowthPage >= honorTotalPages - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}
                                                            >
                                                                »»
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

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
                                    );
                                })()}
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
                                    <div className="grid grid-cols-3 gap-2 sm:gap-4">
                                        <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                                                <Users className="w-4 sm:w-5 h-4 sm:h-5 text-[#4318ff]" />
                                                <span className={`text-[10px] sm:text-sm ${theme.textMuted}`}>Active</span>
                                            </div>
                                            <div className="text-lg sm:text-2xl font-bold">{activeMembers}<span className="text-sm sm:text-base">/{analyticsRoster.length}</span></div>
                                            <div className={`text-[10px] sm:text-xs ${theme.textMuted} hidden sm:block`}>
                                                {((activeMembers / analyticsRoster.length) * 100).toFixed(1)}% of {tagFilter ? 'filtered' : 'roster'}
                                            </div>
                                        </div>
                                        <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                                                <Trophy className="w-4 sm:w-5 h-4 sm:h-5 text-[#01b574]" />
                                                <span className={`text-[10px] sm:text-sm ${theme.textMuted}`}>AoO</span>
                                            </div>
                                            <div className="text-lg sm:text-2xl font-bold text-[#01b574]">{avgAoORate.toFixed(0)}%</div>
                                            <div className={`text-[10px] sm:text-xs ${theme.textMuted} hidden sm:block`}>
                                                {membersWithAoO.length} members
                                            </div>
                                        </div>
                                        <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                                                <TrendingUp className="w-4 sm:w-5 h-4 sm:h-5 text-[#9f7aea]" />
                                                <span className={`text-[10px] sm:text-sm ${theme.textMuted}`}>Mob</span>
                                            </div>
                                            <div className="text-lg sm:text-2xl font-bold text-[#9f7aea]">{formatPower(avgMobScore)}</div>
                                            <div className={`text-[10px] sm:text-xs ${theme.textMuted} hidden sm:block`}>
                                                avg score
                                            </div>
                                        </div>
                                    </div>

                                    {/* Score Calculation Explanation */}
                                    <div className={`${theme.card} border rounded-xl p-3 sm:p-4`}>
                                        <h3 className="font-semibold mb-2 sm:mb-3 flex items-center justify-between text-sm sm:text-base">
                                            <span className="flex items-center gap-2">
                                                <BarChart3 className="w-4 h-4 text-[#9f7aea]" />
                                                <span className="hidden sm:inline">How Activity Score is Calculated</span>
                                                <span className="sm:hidden">Activity Score</span>
                                                {isEditor && (
                                                    <span className="text-[10px] sm:text-xs font-normal text-[#9f7aea] ml-1 sm:ml-2">(Editing)</span>
                                                )}
                                            </span>
                                            {!isEditor && (
                                                <button
                                                    onClick={() => setShowPasswordPrompt(true)}
                                                    className={`text-[10px] sm:text-xs font-normal ${theme.textMuted} hover:text-[#9f7aea] transition-colors flex items-center gap-1`}
                                                >
                                                    <Edit2 className="w-3 h-3" />
                                                    <span className="hidden sm:inline">Adjust weights</span>
                                                    <span className="sm:hidden">Edit</span>
                                                </button>
                                            )}
                                        </h3>
                                        <p className={`text-xs sm:text-sm ${theme.textMuted} mb-2 sm:mb-3 hidden sm:block`}>
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
                                        <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
                                            <div className="p-1.5 sm:p-3 rounded-lg bg-[var(--background-secondary)]">
                                                {isEditor ? (
                                                    <div className="flex items-center justify-center gap-0.5">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={activityWeights.kp}
                                                            onChange={(e) => setActivityWeights(prev => ({
                                                                ...prev,
                                                                kp: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                            }))}
                                                            className="w-8 sm:w-14 text-sm sm:text-lg font-bold text-[#f56565] bg-transparent border border-[#f56565]/30 rounded px-0.5 sm:px-1 text-center"
                                                        />
                                                        <span className="text-sm sm:text-lg font-bold text-[#f56565]">%</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-sm sm:text-lg font-bold text-[#f56565] text-center">{activityWeights.kp}%</div>
                                                )}
                                                <div className={`text-[9px] sm:text-xs ${theme.textMuted} text-center`}>KP</div>
                                            </div>
                                            <div className="p-1.5 sm:p-3 rounded-lg bg-[var(--background-secondary)]">
                                                {isEditor ? (
                                                    <div className="flex items-center justify-center gap-0.5">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={activityWeights.power}
                                                            onChange={(e) => setActivityWeights(prev => ({
                                                                ...prev,
                                                                power: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                            }))}
                                                            className="w-8 sm:w-14 text-sm sm:text-lg font-bold text-[#4318ff] bg-transparent border border-[#4318ff]/30 rounded px-0.5 sm:px-1 text-center"
                                                        />
                                                        <span className="text-sm sm:text-lg font-bold text-[#4318ff]">%</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-sm sm:text-lg font-bold text-[#4318ff] text-center">{activityWeights.power}%</div>
                                                )}
                                                <div className={`text-[9px] sm:text-xs ${theme.textMuted} text-center`}>Power</div>
                                            </div>
                                            <div className="p-1.5 sm:p-3 rounded-lg bg-[var(--background-secondary)]">
                                                {isEditor ? (
                                                    <div className="flex items-center justify-center gap-0.5">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={activityWeights.honor}
                                                            onChange={(e) => setActivityWeights(prev => ({
                                                                ...prev,
                                                                honor: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                            }))}
                                                            className="w-8 sm:w-14 text-sm sm:text-lg font-bold text-[#f6ad55] bg-transparent border border-[#f6ad55]/30 rounded px-0.5 sm:px-1 text-center"
                                                        />
                                                        <span className="text-sm sm:text-lg font-bold text-[#f6ad55]">%</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-sm sm:text-lg font-bold text-[#f6ad55] text-center">{activityWeights.honor}%</div>
                                                )}
                                                <div className={`text-[9px] sm:text-xs ${theme.textMuted} text-center`}>Honor</div>
                                            </div>
                                            <div className="p-1.5 sm:p-3 rounded-lg bg-[var(--background-secondary)]">
                                                {isEditor ? (
                                                    <div className="flex items-center justify-center gap-0.5">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={activityWeights.aoo}
                                                            onChange={(e) => setActivityWeights(prev => ({
                                                                ...prev,
                                                                aoo: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                            }))}
                                                            className="w-8 sm:w-14 text-sm sm:text-lg font-bold text-[#01b574] bg-transparent border border-[#01b574]/30 rounded px-0.5 sm:px-1 text-center"
                                                        />
                                                        <span className="text-sm sm:text-lg font-bold text-[#01b574]">%</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-sm sm:text-lg font-bold text-[#01b574] text-center">{activityWeights.aoo}%</div>
                                                )}
                                                <div className={`text-[9px] sm:text-xs ${theme.textMuted} text-center`}>AoO</div>
                                            </div>
                                            <div className="p-1.5 sm:p-3 rounded-lg bg-[var(--background-secondary)]">
                                                {isEditor ? (
                                                    <div className="flex items-center justify-center gap-0.5">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={activityWeights.mob}
                                                            onChange={(e) => setActivityWeights(prev => ({
                                                                ...prev,
                                                                mob: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                            }))}
                                                            className="w-8 sm:w-14 text-sm sm:text-lg font-bold text-[#9f7aea] bg-transparent border border-[#9f7aea]/30 rounded px-0.5 sm:px-1 text-center"
                                                        />
                                                        <span className="text-sm sm:text-lg font-bold text-[#9f7aea]">%</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-sm sm:text-lg font-bold text-[#9f7aea] text-center">{activityWeights.mob}%</div>
                                                )}
                                                <div className={`text-[9px] sm:text-xs ${theme.textMuted} text-center`}>Mob</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Activity Leaderboard with Stacked Bars */}
                                    <div className={`${theme.card} border rounded-xl p-3 sm:p-4`}>
                                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
                                            <BarChart3 className="w-4 h-4 text-[#4318ff]" />
                                            <span className="hidden sm:inline">Activity Leaderboard (Top 20)</span>
                                            <span className="sm:hidden">Top 20</span>
                                        </h3>
                                        <div className={`text-[10px] sm:text-xs ${theme.textMuted} mb-3 sm:mb-4 flex items-center gap-2 sm:gap-4 flex-wrap`}>
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
                                                        className="flex items-center gap-2 cursor-pointer"
                                                        onMouseEnter={(e) => {
                                                            if (activityHoverTimeoutRef.current) {
                                                                clearTimeout(activityHoverTimeoutRef.current);
                                                                activityHoverTimeoutRef.current = null;
                                                            }
                                                            if (!pinnedActivityMember) {
                                                                setActivityHoverPosition({ x: e.clientX + 15, y: e.clientY + 15 });
                                                                setHoveredActivityMember(member.name);
                                                            }
                                                        }}
                                                        onMouseMove={(e) => {
                                                            if (hoveredActivityMember === member.name && !pinnedActivityMember) {
                                                                setActivityHoverPosition({ x: e.clientX + 15, y: e.clientY + 15 });
                                                            }
                                                        }}
                                                        onMouseLeave={() => {
                                                            activityHoverTimeoutRef.current = setTimeout(() => {
                                                                if (!pinnedActivityMember) {
                                                                    setHoveredActivityMember(null);
                                                                }
                                                            }, 100);
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const isMobile = window.innerWidth < 640;
                                                            if (pinnedActivityMember === member.name) {
                                                                setPinnedActivityMember(null);
                                                            } else {
                                                                setHoveredActivityMember(null);
                                                                setPinnedActivityMember(member.name);
                                                                if (isMobile) {
                                                                    // Center on mobile
                                                                    setPinnedActivityPosition({ x: Math.max(10, (window.innerWidth - 200) / 2), y: 80 });
                                                                } else {
                                                                    setPinnedActivityPosition({ x: activityHoverPosition.x, y: activityHoverPosition.y });
                                                                }
                                                            }
                                                        }}
                                                    >
                                                        <span className={`text-[10px] sm:text-xs ${theme.textMuted} w-5 sm:w-6 text-right`}>{idx + 1}.</span>
                                                        <span className="w-20 sm:w-40 truncate text-xs sm:text-sm font-medium">
                                                            {member.name}
                                                            {member.tags?.includes('angmar-og') && (
                                                                <span className="ml-0.5 sm:ml-1 px-0.5 sm:px-1 py-0.5 text-[6px] sm:text-[8px] font-semibold rounded bg-amber-500/20 text-amber-400 hidden sm:inline">ANG</span>
                                                            )}
                                                            {member.tags?.includes('inactive') && (
                                                                <span className="ml-0.5 px-0.5 sm:px-1 py-0.5 text-[6px] sm:text-[8px] font-semibold rounded bg-gray-500/20 text-gray-400 hidden sm:inline">AFK</span>
                                                            )}
                                                            {member.tags?.includes('quit') && (
                                                                <span className="ml-0.5 px-0.5 sm:px-1 py-0.5 text-[6px] sm:text-[8px] font-semibold rounded bg-red-500/20 text-red-400 hidden sm:inline">QUIT</span>
                                                            )}
                                                        </span>
                                                        <div className="flex-1 h-4 sm:h-5 bg-[var(--background-secondary)] rounded overflow-hidden flex">
                                                            {/* Stacked bar segments */}
                                                            <div
                                                                className="h-full transition-all"
                                                                style={{ width: `${kpContrib}%`, backgroundColor: '#f56565' }}
                                                            />
                                                            <div
                                                                className="h-full transition-all"
                                                                style={{ width: `${powerContrib}%`, backgroundColor: '#4318ff' }}
                                                            />
                                                            <div
                                                                className="h-full transition-all"
                                                                style={{ width: `${honorContrib}%`, backgroundColor: '#f6ad55' }}
                                                            />
                                                            <div
                                                                className="h-full transition-all"
                                                                style={{ width: `${aooContrib}%`, backgroundColor: '#01b574' }}
                                                            />
                                                            <div
                                                                className="h-full transition-all"
                                                                style={{ width: `${mobContrib}%`, backgroundColor: '#9f7aea' }}
                                                            />
                                                        </div>
                                                        <span className={`text-xs sm:text-sm font-medium w-6 sm:w-8 text-right ${
                                                            member.score >= 70 ? 'text-[#01b574]' :
                                                                member.score >= 40 ? 'text-[#fbbf24]' : 'text-[#f56565]'
                                                        }`}>{member.score}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                    </div>

                                    {/* Mobile backdrop for activity hover card */}
                                    {pinnedActivityMember && (
                                        <div
                                            className="fixed inset-0 z-[99998] bg-black/30 sm:hidden"
                                            onClick={() => setPinnedActivityMember(null)}
                                        />
                                    )}

                                    {/* Activity Hover Card - Fixed position (outside card container) */}
                                    {(hoveredActivityMember || pinnedActivityMember) && (() => {
                                        const memberName = pinnedActivityMember || hoveredActivityMember;
                                        const member = scoresArray.find(m => m.name === memberName);
                                        if (!member) return null;

                                        const b = member.breakdown;
                                        const kpContrib = (b.kpPercentile * activityWeights.kp) / 100;
                                        const powerContrib = (b.powerPercentile * activityWeights.power) / 100;
                                        const honorContrib = (b.honorPercentile * activityWeights.honor) / 100;
                                        const aooContrib = (b.aooRate * activityWeights.aoo) / 100;
                                        const mobContrib = (b.mobPercentile * activityWeights.mob) / 100;

                                        const pos = pinnedActivityMember ? pinnedActivityPosition : activityHoverPosition;
                                        const cardWidth = 200;
                                        const cardHeight = 220;
                                        let x = pos.x;
                                        let y = pos.y;
                                        if (typeof window !== 'undefined') {
                                            if (x + cardWidth > window.innerWidth - 20) x = window.innerWidth - cardWidth - 20;
                                            if (y + cardHeight > window.innerHeight - 20) y = window.innerHeight - cardHeight - 20;
                                            if (x < 20) x = 20;
                                            if (y < 20) y = 20;
                                        }

                                        return (
                                            <div
                                                className={`fixed z-[99999] ${theme.card} border rounded-lg p-3 shadow-xl w-[200px] ${pinnedActivityMember ? 'border-[#4318ff] border-2' : 'border-[#4318ff]/30'}`}
                                                style={{ left: x, top: y, cursor: pinnedActivityMember ? 'move' : 'default' }}
                                                onMouseEnter={() => {
                                                    if (activityHoverTimeoutRef.current) {
                                                        clearTimeout(activityHoverTimeoutRef.current);
                                                        activityHoverTimeoutRef.current = null;
                                                    }
                                                }}
                                                onMouseLeave={() => {
                                                    if (!pinnedActivityMember) {
                                                        activityHoverTimeoutRef.current = setTimeout(() => {
                                                            setHoveredActivityMember(null);
                                                        }, 100);
                                                    }
                                                }}
                                                onMouseDown={(e) => {
                                                    if (pinnedActivityMember) {
                                                        e.preventDefault();
                                                        setIsDraggingActivity(true);
                                                        setActivityDragOffset({ x: e.clientX - x, y: e.clientY - y });
                                                    }
                                                }}
                                                onMouseMove={(e) => {
                                                    if (isDraggingActivity && pinnedActivityMember) {
                                                        setPinnedActivityPosition({
                                                            x: e.clientX - activityDragOffset.x,
                                                            y: e.clientY - activityDragOffset.y,
                                                        });
                                                    }
                                                }}
                                                onMouseUp={() => setIsDraggingActivity(false)}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="font-semibold text-sm">{member.name}</div>
                                                    {pinnedActivityMember && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setPinnedActivityMember(null); }}
                                                            className="text-gray-400 hover:text-white text-xs"
                                                        >✕</button>
                                                    )}
                                                </div>
                                                {pinnedActivityMember && (
                                                    <div className={`text-[10px] ${theme.textMuted} mb-2`}>Pinned - drag to move</div>
                                                )}
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
                                        );
                                    })()}

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
                                                                if (bucketHoverTimeoutRef.current) {
                                                                    clearTimeout(bucketHoverTimeoutRef.current);
                                                                    bucketHoverTimeoutRef.current = null;
                                                                }
                                                                if (bucket.count > 0 && !pinnedBucket) {
                                                                    setHoveredBucket({ type: 'aoo', label: bucket.label });
                                                                    setBucketHoverPosition({ x: e.clientX + 15, y: e.clientY + 15 });
                                                                }
                                                            }}
                                                            onMouseMove={(e) => {
                                                                if (bucket.count > 0 && hoveredBucket?.label === bucket.label && !pinnedBucket) {
                                                                    setBucketHoverPosition({ x: e.clientX + 15, y: e.clientY + 15 });
                                                                }
                                                            }}
                                                            onMouseLeave={() => {
                                                                if (!pinnedBucket) {
                                                                    bucketHoverTimeoutRef.current = setTimeout(() => {
                                                                        if (!isOverHoverCardRef.current) {
                                                                            setHoveredBucket(null);
                                                                        }
                                                                    }, 100);
                                                                }
                                                            }}
                                                            onClick={() => {
                                                                if (bucket.count > 0) {
                                                                    if (pinnedBucket?.type === 'aoo' && pinnedBucket?.label === bucket.label) {
                                                                        setPinnedBucket(null);
                                                                    } else {
                                                                        setPinnedBucket({ type: 'aoo', label: bucket.label });
                                                                        setPinnedBucketPosition({ x: bucketHoverPosition.x, y: bucketHoverPosition.y });
                                                                    }
                                                                }
                                                            }}
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
                                                                if (bucketHoverTimeoutRef.current) {
                                                                    clearTimeout(bucketHoverTimeoutRef.current);
                                                                    bucketHoverTimeoutRef.current = null;
                                                                }
                                                                if (bucket.count > 0 && !pinnedBucket) {
                                                                    setHoveredBucket({ type: 'mob', label: bucket.label });
                                                                    setBucketHoverPosition({ x: e.clientX + 15, y: e.clientY + 15 });
                                                                }
                                                            }}
                                                            onMouseMove={(e) => {
                                                                if (bucket.count > 0 && hoveredBucket?.label === bucket.label && !pinnedBucket) {
                                                                    setBucketHoverPosition({ x: e.clientX + 15, y: e.clientY + 15 });
                                                                }
                                                            }}
                                                            onMouseLeave={() => {
                                                                if (!pinnedBucket) {
                                                                    bucketHoverTimeoutRef.current = setTimeout(() => {
                                                                        if (!isOverHoverCardRef.current) {
                                                                            setHoveredBucket(null);
                                                                        }
                                                                    }, 100);
                                                                }
                                                            }}
                                                            onClick={() => {
                                                                if (bucket.count > 0) {
                                                                    if (pinnedBucket?.type === 'mob' && pinnedBucket?.label === bucket.label) {
                                                                        setPinnedBucket(null);
                                                                    } else {
                                                                        setPinnedBucket({ type: 'mob', label: bucket.label });
                                                                        setPinnedBucketPosition({ x: bucketHoverPosition.x, y: bucketHoverPosition.y });
                                                                    }
                                                                }
                                                            }}
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

                                        </div>
                                    </div>

                                    {/* Fixed position hover cards for AoO and Mob - rendered at root level to avoid z-index issues */}
                                    {(hoveredBucket || pinnedBucket) && (() => {
                                        const activeBucket = pinnedBucket || hoveredBucket;
                                        if (!activeBucket) return null;
                                        const isAoo = activeBucket.type === 'aoo';
                                        const bucket = isAoo
                                            ? aooDistribution.find(b => b.label === activeBucket.label)
                                            : mobDistribution.find(b => b.label === activeBucket.label);
                                        if (!bucket || bucket.members.length === 0) return null;

                                        const isPinned = pinnedBucket?.type === activeBucket.type && pinnedBucket?.label === activeBucket.label;
                                        const borderColor = isAoo ? '#01b574' : '#9f7aea';

                                        // Calculate position with viewport bounds
                                        const cardWidth = 300;
                                        const cardHeight = 280;
                                        let x = isPinned ? pinnedBucketPosition.x : bucketHoverPosition.x;
                                        let y = isPinned ? pinnedBucketPosition.y : bucketHoverPosition.y;

                                        if (!isPinned) {
                                            if (x + cardWidth > window.innerWidth) {
                                                x = Math.max(10, window.innerWidth - cardWidth - 10);
                                            }
                                            if (y + cardHeight > window.innerHeight) {
                                                y = Math.max(10, window.innerHeight - cardHeight - 10);
                                            }
                                            if (x < 10) x = 10;
                                            if (y < 10) y = 10;
                                        }

                                        return (
                                            <div
                                                className={`fixed z-[99999] ${isPinned ? 'cursor-move' : 'pointer-events-none'}`}
                                                style={{ left: x, top: y }}
                                                onMouseDown={(e) => {
                                                    if (isPinned) {
                                                        setIsDraggingBucket(true);
                                                        setBucketDragOffset({ x: e.clientX - x, y: e.clientY - y });
                                                    }
                                                }}
                                                onMouseMove={(e) => {
                                                    if (isDraggingBucket && isPinned) {
                                                        setPinnedBucketPosition({
                                                            x: e.clientX - bucketDragOffset.x,
                                                            y: e.clientY - bucketDragOffset.y
                                                        });
                                                    }
                                                }}
                                                onMouseUp={() => setIsDraggingBucket(false)}
                                                onMouseLeave={() => {
                                                    setIsDraggingBucket(false);
                                                    if (!isPinned) {
                                                        isOverHoverCardRef.current = false;
                                                        setHoveredBucket(null);
                                                    }
                                                }}
                                                onMouseEnter={() => {
                                                    if (!isPinned) {
                                                        isOverHoverCardRef.current = true;
                                                        if (bucketHoverTimeoutRef.current) {
                                                            clearTimeout(bucketHoverTimeoutRef.current);
                                                            bucketHoverTimeoutRef.current = null;
                                                        }
                                                    }
                                                }}
                                            >
                                                <div className={`${theme.card} border rounded-xl p-3 shadow-2xl max-h-64 overflow-y-auto min-w-[280px]`} style={{ borderColor: isPinned ? borderColor : `${borderColor}50`, boxShadow: `0 25px 50px -12px ${borderColor}30` }}>
                                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[var(--border)]">
                                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bucket.color }} />
                                                        <span className="font-semibold text-sm flex-1">
                                                            {bucket.label} {isAoo ? 'Participation' : 'Score'} ({bucket.members.length})
                                                        </span>
                                                        {isPinned && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setPinnedBucket(null);
                                                                }}
                                                                className="p-1 rounded hover:bg-[var(--background-secondary)] transition-colors"
                                                                title="Close"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {isPinned && (
                                                        <div className={`text-[10px] ${theme.textMuted} mb-2 flex items-center gap-1`}>
                                                            <Lock className="w-3 h-3" /> Pinned - drag to move
                                                        </div>
                                                    )}
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                        {bucket.members.map(m => (
                                                            <div key={m.name} className="flex justify-between text-xs">
                                                                <span className="truncate flex-1">{m.name}</span>
                                                                <span className="ml-2 font-medium" style={{ color: bucket.color }}>
                                                                    {isAoo ? `${(m as { name: string; rate: number }).rate}%` : formatPower((m as { name: string; score: number }).score)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

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

            {/* Mobile backdrop to close pinned cards */}
            {pinnedMember && (
                <div
                    className="fixed inset-0 z-[99998] bg-black/30 sm:hidden"
                    onClick={() => setPinnedMember(null)}
                />
            )}

            {/* Member Hover Card */}
            {(hoveredMember || pinnedMember) && (() => {
                const activeMember = pinnedMember || hoveredMember;
                const member = roster.find(m => m.name === activeMember);
                const rankings = memberRankings.get(activeMember!);
                const stats = eventStats.get(activeMember!);
                if (!member || !rankings) return null;

                // Get member's history from allSnapshots
                const memberHistory = allSnapshots
                    .filter(s => s.member_name === member.name)
                    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
                    .slice(-5); // Last 5 snapshots

                const isPinned = pinnedMember === activeMember;
                const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

                // Adjust position to stay on screen - center on mobile
                const cardWidth = isMobile ? 280 : 320;
                const cardHeight = 350;
                let x = isPinned ? pinnedPosition.x : hoverPosition.x;
                let y = isPinned ? pinnedPosition.y : hoverPosition.y;

                // Keep card within viewport (only for non-pinned)
                if (!isPinned) {
                    if (x + cardWidth > window.innerWidth) {
                        x = Math.max(10, window.innerWidth - cardWidth - 10);
                    }
                    if (y + cardHeight > window.innerHeight) {
                        y = Math.max(10, window.innerHeight - cardHeight - 10);
                    }
                    if (y < 10) y = 10;
                    if (x < 10) x = 10;
                }

                return (
                    <div
                        className={`fixed z-[99999] ${isPinned ? 'cursor-move' : 'pointer-events-none'}`}
                        style={{ left: x, top: y }}
                        onMouseDown={(e) => {
                            if (isPinned) {
                                setIsDragging(true);
                                setDragOffset({ x: e.clientX - x, y: e.clientY - y });
                            }
                        }}
                        onMouseMove={(e) => {
                            if (isDragging && isPinned) {
                                setPinnedPosition({
                                    x: e.clientX - dragOffset.x,
                                    y: e.clientY - dragOffset.y
                                });
                            }
                        }}
                        onMouseUp={() => setIsDragging(false)}
                        onMouseLeave={() => setIsDragging(false)}
                        onTouchStart={(e) => {
                            if (isPinned && e.touches.length === 1) {
                                const touch = e.touches[0];
                                setIsDragging(true);
                                setDragOffset({ x: touch.clientX - x, y: touch.clientY - y });
                            }
                        }}
                        onTouchMove={(e) => {
                            if (isDragging && isPinned && e.touches.length === 1) {
                                const touch = e.touches[0];
                                setPinnedPosition({
                                    x: touch.clientX - dragOffset.x,
                                    y: touch.clientY - dragOffset.y
                                });
                            }
                        }}
                        onTouchEnd={() => setIsDragging(false)}
                    >
                        <div className={`${theme.card} border ${isPinned ? 'border-[#9f7aea]' : 'border-[#9f7aea]/30'} rounded-xl p-3 sm:p-4 shadow-2xl shadow-[#9f7aea]/10 w-[280px] sm:w-80`}>
                            {/* Header */}
                            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 pb-2 sm:pb-3 border-b border-[var(--border)]">
                                <div className="w-8 sm:w-10 h-8 sm:h-10 rounded-full bg-gradient-to-br from-[#9f7aea] to-[#4318ff] flex items-center justify-center text-white font-bold text-sm sm:text-base">
                                    {member.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-sm sm:text-lg truncate">{member.name}</h3>
                                    <p className={`text-[10px] sm:text-xs ${theme.textMuted}`}>
                                        {member.role || 'Member'}
                                        {member.updated_at && (
                                            <span className="ml-2 opacity-60">
                                                · Updated {(() => {
                                                    const updated = new Date(member.updated_at);
                                                    const now = new Date();
                                                    const diffMs = now.getTime() - updated.getTime();
                                                    const diffMins = Math.floor(diffMs / 60000);
                                                    const diffHours = Math.floor(diffMs / 3600000);
                                                    const diffDays = Math.floor(diffMs / 86400000);
                                                    if (diffMins < 1) return 'just now';
                                                    if (diffMins < 60) return `${diffMins}m ago`;
                                                    if (diffHours < 24) return `${diffHours}h ago`;
                                                    if (diffDays === 1) return 'yesterday';
                                                    if (diffDays < 7) return `${diffDays}d ago`;
                                                    return updated.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                                })()}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                {isPinned && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPinnedMember(null);
                                        }}
                                        className="p-1.5 rounded hover:bg-[var(--background-secondary)] active:bg-[var(--background-secondary)] transition-colors"
                                        title="Close"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            {isPinned && (
                                <div className={`text-[10px] ${theme.textMuted} mb-2 -mt-1 sm:-mt-2 flex items-center gap-1`}>
                                    <Lock className="w-3 h-3" /> <span className="hidden sm:inline">Pinned - drag to move</span><span className="sm:hidden">Tap ✕ to close</span>
                                </div>
                            )}

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
                                <div className="bg-[var(--background-secondary)]/50 rounded-lg p-1.5 sm:p-2">
                                    <div className={`text-[10px] sm:text-xs ${theme.textMuted} mb-0.5 sm:mb-1`}>Power</div>
                                    <div className="text-[#01b574] font-semibold text-sm sm:text-base">{formatPower(member.power)}</div>
                                    <div className={`text-[10px] sm:text-xs ${theme.textMuted}`}>#{rankings.powerRank}</div>
                                </div>
                                <div className="bg-[var(--background-secondary)]/50 rounded-lg p-1.5 sm:p-2">
                                    <div className={`text-[10px] sm:text-xs ${theme.textMuted} mb-0.5 sm:mb-1`}>Kill Points</div>
                                    <div className="text-[#f56565] font-semibold text-sm sm:text-base">{formatPower(member.kills)}</div>
                                    <div className={`text-[10px] sm:text-xs ${theme.textMuted}`}>#{rankings.kpRank}</div>
                                </div>
                                <div className="bg-[var(--background-secondary)]/50 rounded-lg p-1.5 sm:p-2">
                                    <div className={`text-[10px] sm:text-xs ${theme.textMuted} mb-0.5 sm:mb-1`}>T4 KP</div>
                                    <div className="text-[#fbbf24] font-semibold text-sm sm:text-base">{formatPower(member.t4_kills)}</div>
                                    <div className={`text-[10px] sm:text-xs ${theme.textMuted}`}>#{rankings.t4Rank}</div>
                                </div>
                                <div className="bg-[var(--background-secondary)]/50 rounded-lg p-1.5 sm:p-2">
                                    <div className={`text-[10px] sm:text-xs ${theme.textMuted} mb-0.5 sm:mb-1`}>T5 KP</div>
                                    <div className="text-[#f97316] font-semibold text-sm sm:text-base">{formatPower(member.t5_kills)}</div>
                                    <div className={`text-[10px] sm:text-xs ${theme.textMuted}`}>#{rankings.t5Rank}</div>
                                </div>
                            </div>

                            {/* Honor */}
                            <div className="bg-[var(--background-secondary)]/50 rounded-lg p-2 mb-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className={`text-xs ${theme.textMuted} mb-1`}>Honor Points</div>
                                        <div className="text-[#fbbf24] font-semibold">{member.honor_points ? member.honor_points.toLocaleString() : '-'}</div>
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

                            {/* History Table */}
                            {memberHistory.length > 1 && (
                                <div className="border-t border-[var(--border)] pt-3 mt-3">
                                    <div className={`text-xs ${theme.textMuted} mb-2 flex items-center gap-1`}>
                                        <History className="w-3 h-3" />
                                        Snapshot History
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className={`${theme.textMuted} border-b border-[var(--border)]`}>
                                                    <th className="text-left py-1 pr-2">Date</th>
                                                    <th className="text-right py-1 px-1">Power</th>
                                                    <th className="text-right py-1 px-1">KP</th>
                                                    <th className="text-right py-1 pl-1">Honor</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {memberHistory.map((snap, idx) => {
                                                    const prevSnap = idx > 0 ? memberHistory[idx - 1] : null;
                                                    const powerDelta = prevSnap ? snap.power - prevSnap.power : 0;
                                                    const kpDelta = prevSnap ? (snap.kills || 0) - (prevSnap.kills || 0) : 0;
                                                    const honorDelta = prevSnap ? (snap.honor_points || 0) - (prevSnap.honor_points || 0) : 0;
                                                    return (
                                                        <tr key={snap.snapshot_date} className="border-b border-[var(--border)]/50">
                                                            <td className="py-1 pr-2">{formatDate(snap.snapshot_date)}</td>
                                                            <td className="py-1 px-1 text-right">
                                                                <div className="text-[#01b574]">{formatPower(snap.power)}</div>
                                                                {powerDelta !== 0 && (
                                                                    <div className={`text-[9px] ${powerDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                        {powerDelta > 0 ? '+' : ''}{formatPower(powerDelta)}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-1 px-1 text-right">
                                                                <div className="text-[#f56565]">{formatPower(snap.kills)}</div>
                                                                {kpDelta !== 0 && (
                                                                    <div className={`text-[9px] ${kpDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                        {kpDelta > 0 ? '+' : ''}{formatPower(kpDelta)}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-1 pl-1 text-right">
                                                                <div className="text-[#fbbf24]">{snap.honor_points ? snap.honor_points.toLocaleString() : '-'}</div>
                                                                {honorDelta !== 0 && (
                                                                    <div className={`text-[9px] ${honorDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                        {honorDelta > 0 ? '+' : ''}{honorDelta.toLocaleString()}
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
        </AppSidebar>
    );
}
