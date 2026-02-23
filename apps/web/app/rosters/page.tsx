'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatPower } from '@/lib/supabase/use-alliance-roster';
import { createSnapshot, updateMemberSnapshot, useRosterSnapshots, formatDate, getKpGrowth, getPowerGrowth, getHonorGrowth, getGatheredGrowth, getHelpsGrowth, getMemberHistory, getLatestValuesForAllMembers, getSnapshotDates, getFilteredSnapshotDates, detectAfkMembers, type DailyTotals, type MemberChange, type KpGrowth, type PowerGrowth, type HonorGrowth, type GatheredGrowth, type HelpsGrowth, type RosterSnapshot, type ActivityStatus, type AfkScore } from '@/lib/supabase/use-roster-snapshots';
import { getAllMemberStats, getMemberEventHistory, recordEvent, deleteEvent, bulkRecordAoO, bulkRecordMobilization, type MemberEventStats, type EventParticipation } from '@/lib/supabase/use-event-participation';
import { useMemberTrophyCounts, getTrophyBadgeInfo, type MemberTrophyCounts } from '@/lib/supabase/use-king-trophies';
import { allianceDisplay } from '@/lib/alliances';
import { ArrowLeft, Search, ChevronUp, ChevronDown, Edit2, Save, X, Upload, Users, History, Lock, TrendingUp, UserPlus, UserMinus, Calendar, Trophy, BarChart3, AlertTriangle, Eye, Settings2, Check, ExternalLink, Info, GitMerge, Copy, Download } from 'lucide-react';
import { matchesSearch } from '@/lib/search';
import { AppSidebar } from '@/components/AppSidebar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useNameHistory } from '@/lib/supabase/use-name-history';
import { NameHistoryBadge } from '@/components/kingdom/NameHistoryBadge';

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
    alternate_names: string[] | null;
}

// Sortable field types for multi-column sorting
type SortableField = 'name' | 'power' | 'kills' | 'role' | 'alliance' | 't4t5' | 'honor' | 'aoo' | 'acclaim' | 'kvkPts' | 'highestPower' | 'ratio' | 'deads';

interface SortRule {
    field: SortableField;
    direction: 'asc' | 'desc';
}

// Default sort: rank (role) → power desc → name asc
const DEFAULT_SORT_RULES: SortRule[] = [
    { field: 'role', direction: 'asc' },
    { field: 'power', direction: 'desc' },
    { field: 'name', direction: 'asc' },
];

// Field labels for sort chain display
const SORT_FIELD_LABELS: Record<SortableField, string> = {
    name: 'Name',
    power: 'Power',
    kills: 'KP',
    role: 'Rank',
    alliance: 'Alliance',
    t4t5: 'T4/T5',
    honor: 'Honor',
    aoo: 'AoO',
    acclaim: 'Acclaim',
    kvkPts: 'KvK Pts',
    highestPower: 'Peak Power',
    ratio: 'Ratio',
    deads: 'Deaths',
};

// Column descriptions for tooltips
const COLUMN_TOOLTIPS: Record<string, string> = {
    name: 'In-game governor name',
    power: 'Total account power',
    kp: 'Kill points (total kills)',
    ratio: 'Power per kill point - lower ratio indicates more aggressive play style',
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
    trophies: 'King\'s Recognition trophies received',
};

// Column configuration for View Options
type ColumnId = 'power' | 'kp' | 'ratio' | 't4t5' | 't1t2t3' | 'deads' | 'healed' | 'honor' | 'aoo' | 'mob' | 'rank' | 'alliance' | 'trophies' | 'acclaim' | 'kvkPts' | 'highestPower' | 'ch' | 'civilization';

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
    { id: 'ratio', label: 'Power:KP', tooltip: COLUMN_TOOLTIPS.ratio, defaultVisible: true, category: 'core' },
    { id: 'rank', label: 'Rank', tooltip: COLUMN_TOOLTIPS.rank, defaultVisible: false, category: 'core' },
    { id: 'alliance', label: 'Alliance', tooltip: COLUMN_TOOLTIPS.alliance, defaultVisible: true, category: 'core' },
    { id: 'trophies', label: 'Trophies', tooltip: COLUMN_TOOLTIPS.trophies, defaultVisible: true, category: 'core' },
    // Combat columns
    { id: 't4t5', label: 'T4/T5 KP', tooltip: COLUMN_TOOLTIPS.t4t5, defaultVisible: true, category: 'combat' },
    { id: 't1t2t3', label: 'T1/T2/T3 KP', tooltip: COLUMN_TOOLTIPS.t1t2t3, defaultVisible: false, category: 'combat' },
    { id: 'deads', label: 'Deaths', tooltip: COLUMN_TOOLTIPS.deads, defaultVisible: false, category: 'combat' },
    { id: 'healed', label: 'Healed', tooltip: COLUMN_TOOLTIPS.healed, defaultVisible: false, category: 'combat' },
    // Events columns
    { id: 'honor', label: 'Honor', tooltip: COLUMN_TOOLTIPS.honor, defaultVisible: false, category: 'events' },
    { id: 'aoo', label: 'AoO', tooltip: COLUMN_TOOLTIPS.aoo, defaultVisible: false, category: 'events' },
    { id: 'mob', label: 'Mob', tooltip: COLUMN_TOOLTIPS.mob, defaultVisible: false, category: 'events' },
    { id: 'acclaim', label: 'Acclaim', tooltip: COLUMN_TOOLTIPS.acclaim, defaultVisible: false, category: 'events' },
    { id: 'kvkPts', label: 'KvK Pts', tooltip: COLUMN_TOOLTIPS.kvkPts, defaultVisible: false, category: 'events' },
    // Profile columns
    { id: 'highestPower', label: 'Peak Power', tooltip: COLUMN_TOOLTIPS.highestPower, defaultVisible: false, category: 'profile' },
    { id: 'ch', label: 'CH', tooltip: COLUMN_TOOLTIPS.ch, defaultVisible: false, category: 'profile' },
    { id: 'civilization', label: 'Civ', tooltip: COLUMN_TOOLTIPS.civilization, defaultVisible: false, category: 'profile' },
];

const DEFAULT_VISIBLE_COLUMNS = COLUMN_CONFIG.filter(c => c.defaultVisible).map(c => c.id);

type SortDirection = 'asc' | 'desc';

import { ADMIN_PASSWORD as EDITOR_PASSWORD } from '@/lib/auth-passwords';

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
    const [growthAllianceFilter, setGrowthAllianceFilter] = useState<string>('ANG');
    const [rankFilter, setRankFilter] = useState<string | null>(null);
    const [aooFilter, setAooFilter] = useState<'all' | 'team1' | 'team2' | 'assigned' | 'unassigned'>('all');
    // Multi-column sorting: array of sort rules applied in order
    const [sortRules, setSortRules] = useState<SortRule[]>(DEFAULT_SORT_RULES);

    // Editor mode
    const [isEditor, setIsEditor] = useState(false);
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [editorPassword, setEditorPassword] = useState('');

    // Editing state - kills/power stored as string for decimal input (millions)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<{ powerM: string; killsM: string; t4t5KillsM: string; honor: string; notes: string; alliance: string }>({ powerM: '', killsM: '', t4t5KillsM: '', honor: '', notes: '', alliance: '' });
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
    const [activeTab, setActiveTab] = useState<'roster' | 'history' | 'events' | 'analytics' | 'comparison'>('roster');
    const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);

    // Event participation stats
    const [eventStats, setEventStats] = useState<Map<string, MemberEventStats>>(new Map());

    // Trophy counts for King's Recognition
    const { counts: trophyCounts, refetch: refetchTrophies } = useMemberTrophyCounts();

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
    const [kpGrowthSort, setKpGrowthSort] = useState<{ field: 'name' | 'allTimeKpGrowth' | 'compareKpGrowth'; direction: 'asc' | 'desc' }>({ field: 'compareKpGrowth', direction: 'desc' });
    const [kpGrowthData, setKpGrowthData] = useState<KpGrowth[]>([]);
    const [powerGrowthData, setPowerGrowthData] = useState<PowerGrowth[]>([]);
    const [honorGrowthData, setHonorGrowthData] = useState<HonorGrowth[]>([]);
    // Honor growth pagination and sorting
    const [honorGrowthPage, setHonorGrowthPage] = useState(0);
    const [honorGrowthRowsPerPage, setHonorGrowthRowsPerPage] = useState(10);
    const [honorGrowthSort, setHonorGrowthSort] = useState<{ field: 'name' | 'allTimeGrowth' | 'compareGrowth'; direction: 'asc' | 'desc' }>({ field: 'allTimeGrowth', direction: 'desc' });
    // Power growth pagination and sorting
    const [powerGrowthPage, setPowerGrowthPage] = useState(0);
    const [powerGrowthRowsPerPage, setPowerGrowthRowsPerPage] = useState(10);
    const [powerGrowthSort, setPowerGrowthSort] = useState<{ field: 'name' | 'allTimeGrowth' | 'compareGrowth'; direction: 'asc' | 'desc' }>({ field: 'compareGrowth', direction: 'desc' });
    // Gathered growth
    const [gatheredGrowthData, setGatheredGrowthData] = useState<GatheredGrowth[]>([]);
    const [gatheredGrowthPage, setGatheredGrowthPage] = useState(0);
    const [gatheredGrowthRowsPerPage, setGatheredGrowthRowsPerPage] = useState(10);
    const [gatheredGrowthSort, setGatheredGrowthSort] = useState<{ field: 'name' | 'allTimeGrowth' | 'compareGrowth'; direction: 'asc' | 'desc' }>({ field: 'compareGrowth', direction: 'desc' });
    // Alliance helps growth
    const [helpsGrowthData, setHelpsGrowthData] = useState<HelpsGrowth[]>([]);
    const [helpsGrowthPage, setHelpsGrowthPage] = useState(0);
    const [helpsGrowthRowsPerPage, setHelpsGrowthRowsPerPage] = useState(10);
    const [helpsGrowthSort, setHelpsGrowthSort] = useState<{ field: 'name' | 'allTimeGrowth' | 'compareGrowth'; direction: 'asc' | 'desc' }>({ field: 'compareGrowth', direction: 'desc' });
    // Growth comparison date selection
    const [availableSnapshotDates, setAvailableSnapshotDates] = useState<string[]>([]);
    const [growthCompareDate, setGrowthCompareDate] = useState<string | null>(null); // null = default (past week)
    const [growthEndDate, setGrowthEndDate] = useState<string | null>(null); // null = most recent snapshot

    // Growth tab charts toggle
    const [showCharts, setShowCharts] = useState(false);
    const [chartMetric, setChartMetric] = useState<'all' | 'kp' | 'power' | 'honor' | 'ratio'>('all');
    const [chartMode, setChartMode] = useState<'alliance' | 'individual'>('alliance');
    const [chartStartDate, setChartStartDate] = useState<string | null>(null); // null = earliest available
    const [chartEndDate, setChartEndDate] = useState<string | null>(null); // null = latest available
    const [selectedPlayer, setSelectedPlayer] = useState<string>('');
    const [playerHistory, setPlayerHistory] = useState<RosterSnapshot[]>([]);
    const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');
    const [playerDropdownOpen, setPlayerDropdownOpen] = useState(false);

    // Activity / AFK detection state
    const [afkData, setAfkData] = useState<ActivityStatus[]>([]);
    const [afkWindowDays, setAfkWindowDays] = useState(3);
    const [afkSort, setAfkSort] = useState<{ field: 'name' | 'powerDelta' | 'daysSinceChange' | 'status'; direction: 'asc' | 'desc' }>({ field: 'daysSinceChange', direction: 'desc' });
    const [afkPage, setAfkPage] = useState(0);
    const [afkFilter, setAfkFilter] = useState<AfkScore | 'all'>('all');

    // History tab collapsible sections & search
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['charts']));
    const [growthSearch, setGrowthSearch] = useState('');
    const [profilePlayer, setProfilePlayer] = useState<string | null>(null);

    const toggleSection = useCallback((key: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }, []);

    // Pagination state
    const [rowsPerPage, setRowsPerPage] = useState<number>(25);
    const [currentPage, setCurrentPage] = useState(0);

    // Expanded row state for snapshot history
    const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
    const [memberSnapshots, setMemberSnapshots] = useState<RosterSnapshot[]>([]);
    const [loadingSnapshots, setLoadingSnapshots] = useState(false);


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
                    const parsed = JSON.parse(saved) as ColumnId[];
                    // Migration: add ratio column for existing users who don't have it
                    // Insert it after 'kp' if they have kp visible
                    if (!parsed.includes('ratio')) {
                        const kpIndex = parsed.indexOf('kp');
                        if (kpIndex !== -1) {
                            parsed.splice(kpIndex + 1, 0, 'ratio');
                        } else {
                            parsed.push('ratio');
                        }
                    }
                    return parsed;
                } catch {
                    return DEFAULT_VISIBLE_COLUMNS;
                }
            }
        }
        return DEFAULT_VISIBLE_COLUMNS;
    });
    const [showViewOptions, setShowViewOptions] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

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

    // Close Export dropdown when clicking outside
    useEffect(() => {
        if (!showExportMenu) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-export-menu]')) {
                setShowExportMenu(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [showExportMenu]);

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

    // Name history for all roster members
    const nameHistoryGovIds = useMemo(() => roster.filter(m => m.governor_id).map(m => m.governor_id!), [roster]);
    const nameHistoryCurrentNames = useMemo(() => {
        const map = new Map<number, string>();
        for (const m of roster) if (m.governor_id) map.set(m.governor_id, m.name);
        return map;
    }, [roster]);
    const { nameHistory } = useNameHistory(nameHistoryGovIds, nameHistoryCurrentNames);

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

    // Fetch available snapshot dates on mount
    useEffect(() => {
        getSnapshotDates().then(dates => {
            setAvailableSnapshotDates(dates);
        }).catch(console.error);
    }, []);

    // Fetch KP, Power, and Honor growth data when roster loads or date range/alliance changes
    useEffect(() => {
        if (roster.length > 0) {
            const growthRoster = roster.filter(m => m.alliance === growthAllianceFilter);
            getKpGrowth(growthRoster, growthCompareDate, growthEndDate).then(setKpGrowthData).catch(console.error);
            getPowerGrowth(growthRoster, growthCompareDate, growthEndDate).then(setPowerGrowthData).catch(console.error);
            getHonorGrowth(growthRoster, growthCompareDate, growthEndDate).then(setHonorGrowthData).catch(console.error);
            getGatheredGrowth(growthRoster, growthCompareDate, growthEndDate).then(setGatheredGrowthData).catch(console.error);
            getHelpsGrowth(growthRoster, growthCompareDate, growthEndDate).then(setHelpsGrowthData).catch(console.error);
            detectAfkMembers(growthRoster, afkWindowDays).then(setAfkData).catch(console.error);
        }
    }, [roster, growthCompareDate, growthEndDate, growthAllianceFilter, afkWindowDays]);

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
    }, [search, tagFilter, allianceFilter, rankFilter, aooFilter, sortRules]);

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

    // Handle column header click for sorting
    // Normal click: replace with single sort on this field
    // Shift+click: add to sort chain or toggle direction if already in chain
    const handleSort = (field: SortableField, addToChain: boolean) => {
        if (addToChain) {
            // Shift+click: Add to chain or toggle if already in chain
            const existingIdx = sortRules.findIndex(r => r.field === field);
            if (existingIdx >= 0) {
                // Toggle direction of existing rule
                const updated = [...sortRules];
                updated[existingIdx] = {
                    ...updated[existingIdx],
                    direction: updated[existingIdx].direction === 'asc' ? 'desc' : 'asc'
                };
                setSortRules(updated);
            } else {
                // Add new rule with appropriate default direction
                const defaultDir = field === 'name' || field === 'role' ? 'asc' : 'desc';
                setSortRules([...sortRules, { field, direction: defaultDir }]);
            }
        } else {
            // Normal click: Replace with single sort
            const existing = sortRules.find(r => r.field === field);
            const newDir = existing
                ? (existing.direction === 'asc' ? 'desc' : 'asc')
                : (field === 'name' || field === 'role' ? 'asc' : 'desc');
            setSortRules([{ field, direction: newDir }]);
        }
    };

    // Remove a specific sort rule from the chain
    const removeSortRule = (field: SortableField) => {
        const filtered = sortRules.filter(r => r.field !== field);
        setSortRules(filtered.length > 0 ? filtered : DEFAULT_SORT_RULES);
    };

    const resetToDefaultSort = () => {
        setSortRules(DEFAULT_SORT_RULES);
        setRankFilter(null);
        setAooFilter('all');
        setTagFilter(null);
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
        setEditValues({ powerM, killsM, t4t5KillsM, honor, notes: member.notes || '', alliance: member.alliance || '' });
        // Focus the first input after state update
        setTimeout(() => firstEditInputRef.current?.focus(), 50);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditValues({ powerM: '', killsM: '', t4t5KillsM: '', honor: '', notes: '', alliance: '' });
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

            const allianceVal = editValues.alliance.trim() || null;

            const { error } = await supabase
                .from('alliance_roster')
                .update({
                    power: powerRaw,
                    kills: killsRaw,
                    t4_kills: t4KillsRaw,
                    t5_kills: t5KillsRaw,
                    honor_points: honorRaw,
                    notes: editValues.notes || null,
                    alliance: allianceVal,
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
                    ? { ...m, power: powerRaw, kills: killsRaw, t4_kills: t4KillsRaw, t5_kills: t5KillsRaw, honor_points: honorRaw, notes: editValues.notes || null, alliance: allianceVal }
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
    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
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

    // Compare two members by a specific field and direction
    const compareByField = (a: RosterMember, b: RosterMember, field: SortableField, direction: 'asc' | 'desc'): number => {
        let aVal: string | number;
        let bVal: string | number;

        switch (field) {
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
            case 'role':
                aVal = getRankOrder(a.role);
                bVal = getRankOrder(b.role);
                break;
            case 'alliance':
                aVal = (a.alliance || '').toLowerCase();
                bVal = (b.alliance || '').toLowerCase();
                break;
            case 't4t5':
                aVal = (a.t4_kills || 0) + (a.t5_kills || 0);
                bVal = (b.t4_kills || 0) + (b.t5_kills || 0);
                break;
            case 'honor':
                aVal = a.honor_points || 0;
                bVal = b.honor_points || 0;
                break;
            case 'aoo':
                aVal = getAooRate(a.name);
                bVal = getAooRate(b.name);
                // Put unassigned (-1) at the end regardless of sort direction
                if (aVal === -1 && bVal === -1) return 0;
                if (aVal === -1) return 1;
                if (bVal === -1) return -1;
                break;
            case 'acclaim':
                aVal = a.acclaim || 0;
                bVal = b.acclaim || 0;
                break;
            case 'kvkPts':
                aVal = a.kvk_points || 0;
                bVal = b.kvk_points || 0;
                break;
            case 'highestPower':
                aVal = a.highest_power || 0;
                bVal = b.highest_power || 0;
                break;
            case 'ratio':
                // Power:KP ratio - lower is better (more aggressive)
                aVal = a.kills ? a.power / a.kills : Infinity;
                bVal = b.kills ? b.power / b.kills : Infinity;
                break;
            case 'deads':
                aVal = a.deads || 0;
                bVal = b.deads || 0;
                break;
            default:
                return 0;
        }

        if (direction === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
    };

    // AFK status lookup for roster badges
    const afkByName = useMemo(() => {
        const map = new Map<string, ActivityStatus>();
        for (const a of afkData) map.set(a.name, a);
        return map;
    }, [afkData]);

    // Filter and sort roster using multi-column sort rules
    const filteredRoster = roster
        .filter(m => matchesSearch(search, m.name, m.governor_id))
        .filter(m => !tagFilter || (m.tags && m.tags.includes(tagFilter)))
        .filter(m => !allianceFilter || m.alliance === allianceFilter)
        .filter(m => !rankFilter || m.role === rankFilter)
        .filter(m => {
            if (aooFilter === 'all') return true;
            const stats = eventStats.get(m.name);
            const hasAssignment = stats && stats.aoo.totalAssigned > 0;
            const lastTeam = stats?.aoo.lastTeam;

            switch (aooFilter) {
                case 'team1': return lastTeam === 'Team 1';
                case 'team2': return lastTeam === 'Team 2';
                case 'assigned': return hasAssignment;
                case 'unassigned': return !hasAssignment;
                default: return true;
            }
        })
        .sort((a, b) => {
            // Apply sort rules in order - first non-zero result wins
            for (const rule of sortRules) {
                const result = compareByField(a, b, rule.field, rule.direction);
                if (result !== 0) return result;
            }
            return 0;
        });

    // Export roster data as CSV or XLSX
    const exportRoster = useCallback((format: 'csv' | 'xlsx') => {
        import('xlsx').then((XLSX) => {
            type ExportCol = { header: string; getValue: (m: RosterMember) => string | number | null };

            const columns: ExportCol[] = [
                { header: 'Name', getValue: m => m.name },
            ];

            for (const colId of visibleColumns) {
                switch (colId) {
                    case 'power': columns.push({ header: 'Power', getValue: m => m.power || 0 }); break;
                    case 'kp': columns.push({ header: 'Kill Points', getValue: m => m.kills || 0 }); break;
                    case 'ratio': columns.push({ header: 'Power:KP', getValue: m => m.kills ? +(m.power / m.kills).toFixed(1) : 0 }); break;
                    case 'rank': columns.push({ header: 'Rank', getValue: m => m.role || '' }); break;
                    case 'alliance': columns.push({ header: 'Alliance', getValue: m => allianceDisplay(m.alliance) }); break;
                    case 'trophies': columns.push({ header: 'Trophies', getValue: m => {
                        const info = getTrophyBadgeInfo(trophyCounts.get(m.id));
                        return info.hasAny ? info.tooltip : '';
                    }}); break;
                    case 't4t5':
                        columns.push({ header: 'T4 Kills', getValue: m => m.t4_kills || 0 });
                        columns.push({ header: 'T5 Kills', getValue: m => m.t5_kills || 0 });
                        break;
                    case 't1t2t3':
                        columns.push({ header: 'T1 Kills', getValue: m => m.t1_kills || 0 });
                        columns.push({ header: 'T2 Kills', getValue: m => m.t2_kills || 0 });
                        columns.push({ header: 'T3 Kills', getValue: m => m.t3_kills || 0 });
                        break;
                    case 'deads': columns.push({ header: 'Deaths', getValue: m => m.deads || 0 }); break;
                    case 'healed': columns.push({ header: 'Healed', getValue: m => m.troops_healed || 0 }); break;
                    case 'honor': columns.push({ header: 'Honor', getValue: m => m.honor_points || 0 }); break;
                    case 'aoo': columns.push({ header: 'AoO Team', getValue: m => {
                        const stats = eventStats.get(m.name);
                        if (!stats || stats.aoo.totalAssigned === 0) return '';
                        const team = stats.aoo.lastTeam === 'Team 1' ? 'T1' : stats.aoo.lastTeam === 'Team 2' ? 'T2' : '';
                        return `${team} (${stats.aoo.participatedCount}/${stats.aoo.totalAssigned})`;
                    }}); break;
                    case 'mob':
                        columns.push({ header: 'Mob Score', getValue: m => {
                            const stats = eventStats.get(m.name);
                            return stats?.mobilization.lastScore ?? 0;
                        }});
                        columns.push({ header: 'Mob Turned In', getValue: m => {
                            const stats = eventStats.get(m.name);
                            return stats?.mobilization.lastTurnedIn ?? '';
                        }});
                        columns.push({ header: 'Mob Accepted', getValue: m => {
                            const stats = eventStats.get(m.name);
                            return stats?.mobilization.lastAccepted ?? '';
                        }});
                        break;
                    case 'acclaim': columns.push({ header: 'Acclaim', getValue: m => m.acclaim || 0 }); break;
                    case 'kvkPts': columns.push({ header: 'KvK Points', getValue: m => m.kvk_points || 0 }); break;
                    case 'highestPower': columns.push({ header: 'Peak Power', getValue: m => m.highest_power || 0 }); break;
                    case 'ch': columns.push({ header: 'Castle Hall', getValue: m => m.castle_hall || '' }); break;
                    case 'civilization': columns.push({ header: 'Civilization', getValue: m => m.civilization || '' }); break;
                }
            }

            const headers = columns.map(c => c.header);
            const rows = filteredRoster.map(member => columns.map(c => c.getValue(member)));

            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Roster');

            const date = new Date().toISOString().slice(0, 10);
            const filterSuffix = allianceFilter ? `_${allianceDisplay(allianceFilter)}` : '';
            const filename = `roster${filterSuffix}_${date}`;

            XLSX.writeFile(wb, `${filename}.${format}`, { bookType: format });
        });
        setShowExportMenu(false);
    }, [filteredRoster, visibleColumns, eventStats, trophyCounts, allianceFilter]);

    // Pagination logic
    const totalPages = rowsPerPage === -1 ? 1 : Math.ceil(filteredRoster.length / rowsPerPage);
    const paginatedRoster = rowsPerPage === -1
        ? filteredRoster
        : filteredRoster.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);

    // Stats use the filtered roster (respects alliance/tag/rank filters, excludes search)
    const statsRoster = roster
        .filter(m => !allianceFilter || m.alliance === allianceFilter)
        .filter(m => !tagFilter || (m.tags && m.tags.includes(tagFilter)))
        .filter(m => !rankFilter || m.role === rankFilter);
    const totalPower = statsRoster.reduce((sum, m) => sum + m.power, 0);
    const totalKills = statsRoster.reduce((sum, m) => sum + (m.kills || 0), 0);

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

    // Sort icon with priority badge for multi-column sorting
    const SortIcon = ({ field }: { field: SortableField }) => {
        const ruleIndex = sortRules.findIndex(r => r.field === field);
        const isActive = ruleIndex >= 0;
        const rule = isActive ? sortRules[ruleIndex] : null;
        const Icon = rule?.direction === 'desc' ? ChevronDown : ChevronUp;
        const showPriority = sortRules.length > 1 && isActive;

        return (
            <span className="relative inline-flex items-center">
                <Icon className={`w-4 h-4 transition-opacity ${isActive ? 'opacity-100' : 'opacity-30'}`} />
                {showPriority && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 text-[8px] font-bold rounded-full bg-[#4318ff] text-white flex items-center justify-center">
                        {ruleIndex + 1}
                    </span>
                )}
            </span>
        );
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
                            <div className="p-2.5 rounded-lg bg-sky-500/15 flex-shrink-0">
                                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-sky-500" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">Alliance Roster</h1>
                                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-sky-500/20 text-sky-400 flex-shrink-0">
                                        {statsRoster.length} members
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
                                    title="Admin Mode"
                                >
                                    <Edit2 className="w-4 h-4 sm:hidden" />
                                    <span className="hidden sm:inline">Admin Mode</span>
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
                                    <span className="hidden sm:inline">Exit Admin</span>
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
                            <>
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
                            <button
                                onClick={() => setActiveTab('comparison')}
                                className={`px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 border-b-2 -mb-[1px] ${
                                    activeTab === 'comparison'
                                        ? 'text-[#4318ff] border-[#4318ff] bg-[#4318ff]/5'
                                        : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]'
                                }`}
                            >
                                <BarChart3 className="w-4 h-4" />
                                Comparison
                            </button>
                            </>
                        )}
                        <div className="flex-1" />
                        {lastSnapshotDate && (
                            <span className={`px-3 py-2 text-xs ${theme.textMuted} flex items-center gap-1.5 whitespace-nowrap flex-shrink-0`}>
                                <Lock className="w-3 h-3" />
                                <span className="hidden sm:inline">Snapshot:</span> {formatDate(lastSnapshotDate)}
                            </span>
                        )}
                    </div>


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

            {/* Admin Mode Banner */}
            {isEditor && (
                <div className="bg-[#4318ff]/10 border-b border-[#4318ff]/30">
                    <div className="max-w-6xl mx-auto px-4 md:px-6 py-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <Edit2 className="w-5 h-5 text-[#9f7aea] flex-shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-medium text-[#9f7aea] text-sm">Admin Mode Active</h3>
                                    <p className={`text-xs ${theme.textMuted} mt-1`}>
                                        <strong>Roster tab:</strong> Click any row to edit KP and notes •
                                        <strong> Analytics tab:</strong> Adjust activity score weights •
                                        <strong> Events tab:</strong> Record AoO teams and Mobilization scores •
                                        <strong> Comparison tab:</strong> ANG vs 23KK alliance comparison
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
                        <p className="text-2xl font-bold">{statsRoster.length}</p>
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
                        <p className="text-2xl font-bold text-[#4318ff]">{formatPower(Math.round(totalPower / (statsRoster.length || 1)))}</p>
                    </div>
                </div>

                {/* Search and Sort Controls */}
                <div className={`${theme.card} border rounded-xl p-4 mb-6 ${(showViewOptions || showExportMenu) ? 'relative z-[100]' : ''}`}>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${theme.textMuted}`} />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name or governor ID..."
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
                                        <option key={a} value={a}>{allianceDisplay(a)}</option>
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
                                <option value="team1">Team 1</option>
                                <option value="team2">Team 2</option>
                                <option value="assigned">Assigned</option>
                                <option value="unassigned">Unassigned</option>
                            </select>
                            {/* Group / Tag Filter */}
                            <select
                                value={tagFilter || ''}
                                onChange={(e) => setTagFilter(e.target.value || null)}
                                className={`px-3 py-2 rounded-lg text-sm border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff]`}
                            >
                                <option value="">All Groups</option>
                                {isEditor && <option value="angmar-og">Angmar Core</option>}
                                <option value="inactive">Inactive</option>
                                <option value="quit">Quit</option>
                            </select>
                            {(JSON.stringify(sortRules) !== JSON.stringify(DEFAULT_SORT_RULES) || rankFilter || aooFilter !== 'all' || tagFilter) && (
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
                            {/* Export Button */}
                            <div className="relative" data-export-menu>
                                <button
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium ${theme.button} flex items-center gap-2 ${showExportMenu ? 'ring-2 ring-[#4318ff]' : ''}`}
                                    title="Export roster data"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="hidden sm:inline">Export</span>
                                </button>
                                {showExportMenu && (
                                    <div className={`absolute right-0 top-full mt-2 w-52 ${theme.card} border rounded-xl shadow-2xl z-[9999]`}>
                                        <div className="p-2">
                                            <button
                                                onClick={() => exportRoster('csv')}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${theme.textMuted} hover:bg-[var(--background-secondary)] transition-colors`}
                                            >
                                                Export as CSV
                                            </button>
                                            <button
                                                onClick={() => exportRoster('xlsx')}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${theme.textMuted} hover:bg-[var(--background-secondary)] transition-colors`}
                                            >
                                                Export as Excel (.xlsx)
                                            </button>
                                        </div>
                                        <div className={`px-3 pb-2 text-[10px] ${theme.textMuted}`}>
                                            {filteredRoster.length} rows, {visibleColumns.length + 1} columns
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sort Chain Indicator */}
                    {sortRules.length > 0 && JSON.stringify(sortRules) !== JSON.stringify(DEFAULT_SORT_RULES) && (
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <span className={`text-xs ${theme.textMuted}`}>Sorted by:</span>
                            {sortRules.map((rule, idx) => (
                                <span key={rule.field} className="inline-flex items-center">
                                    {idx > 0 && <span className={`mx-1 ${theme.textMuted}`}>→</span>}
                                    <button
                                        onClick={() => removeSortRule(rule.field)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[#4318ff]/20 text-[#9f7aea] hover:bg-[#4318ff]/30 transition-colors"
                                        title={`Remove ${SORT_FIELD_LABELS[rule.field]} from sort`}
                                    >
                                        {SORT_FIELD_LABELS[rule.field]}
                                        {rule.direction === 'asc' ? '↑' : '↓'}
                                        <X className="w-3 h-3 ml-0.5" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
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
                                <span className="hidden sm:inline">Click to sort • Shift+click for multi-sort •</span> Tap name for details
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
                                                onClick={(e) => handleSort('name', e.shiftKey)}
                                                title="Click to sort, Shift+click to add secondary sort"
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
                                                    onClick={(e) => handleSort('power', e.shiftKey)}
                                                    title="Click to sort, Shift+click to add secondary sort"
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
                                                    onClick={(e) => handleSort('kills', e.shiftKey)}
                                                    title="Click to sort, Shift+click to add secondary sort"
                                                    className={`flex items-center gap-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white ml-auto`}
                                                >
                                                    KP <SortIcon field="kills" />
                                                </button>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('ratio') && (
                                        <th className="text-right px-2 sm:px-4 py-2 sm:py-3 hidden md:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.ratio}>
                                                <span className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    Ratio
                                                </span>
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
                                                    onClick={(e) => handleSort('aoo', e.shiftKey)}
                                                    title="Click to sort, Shift+click to add secondary sort"
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
                                                    onClick={(e) => handleSort('role', e.shiftKey)}
                                                    title="Click to sort, Shift+click to add secondary sort"
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
                                                <button
                                                    onClick={(e) => handleSort('alliance', e.shiftKey)}
                                                    title="Click to sort, Shift+click to add secondary sort"
                                                    className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-[var(--foreground)] transition-colors`}
                                                >
                                                    Alliance
                                                    <SortIcon field="alliance" />
                                                </button>
                                            </ColumnTooltip>
                                        </th>
                                    )}
                                    {isColumnVisible('trophies') && (
                                        <th className="text-center px-4 py-3 hidden sm:table-cell">
                                            <ColumnTooltip text={COLUMN_TOOLTIPS.trophies}>
                                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                    Trophies
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
                                            <span className="font-medium text-sm sm:text-base inline-flex items-center gap-0.5">
                                                {member.name}
                                                {member.governor_id && <NameHistoryBadge previousNames={nameHistory.get(member.governor_id) || []} size="sm" />}
                                            </span>
                                            {isEditor && member.tags?.includes('angmar-og') && (
                                                <span className="ml-1 sm:ml-2 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[10px] font-semibold rounded bg-amber-500/20 text-amber-400" title="Angmar Core">ANG</span>
                                            )}
                                            {member.tags?.includes('inactive') && (
                                                <span className="ml-0.5 sm:ml-1 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[10px] font-semibold rounded bg-gray-500/20 text-gray-400" title="Inactive">AFK</span>
                                            )}
                                            {member.tags?.includes('quit') && (
                                                <span className="ml-0.5 sm:ml-1 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[10px] font-semibold rounded bg-red-500/20 text-red-400" title="Quit">QUIT</span>
                                            )}
                                            {!member.tags?.includes('inactive') && !member.tags?.includes('quit') && (() => {
                                                const afk = afkByName.get(member.name);
                                                if (!afk || afk.status === 'active') return null;
                                                const colors = afk.status === 'afk' ? 'bg-red-500/20 text-red-400'
                                                    : afk.status === 'likely_afk' ? 'bg-orange-500/20 text-orange-400'
                                                    : 'bg-yellow-500/20 text-yellow-400';
                                                const label = afk.status === 'afk' ? 'AFK?' : afk.status === 'likely_afk' ? 'AFK?' : 'LOW';
                                                return <span className={`ml-0.5 sm:ml-1 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[10px] font-semibold rounded ${colors}`} title={`No power change for ${afk.daysSinceChange} days`}>{label}</span>;
                                            })()}
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
                                        {isColumnVisible('ratio') && (
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-right hidden md:table-cell">
                                                <span className={`text-sm ${member.kills ? 'text-[#9f7aea]' : theme.textMuted}`}>
                                                    {member.kills ? (member.power / member.kills).toFixed(1) : '-'}
                                                </span>
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
                                                {editingId === member.id ? (
                                                    <select
                                                        value={editValues.alliance}
                                                        onChange={(e) => setEditValues({ ...editValues, alliance: e.target.value })}
                                                        onKeyDown={handleEditKeyDown}
                                                        className={`w-20 px-2 py-1 rounded border ${theme.input}`}
                                                    >
                                                        {alliances.map(a => (
                                                            <option key={a} value={a}>{allianceDisplay(a)}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span
                                                        className={`text-sm ${member.alliance ? 'text-[#9f7aea] cursor-pointer hover:underline' : theme.textMuted}`}
                                                        onClick={() => member.alliance && setAllianceFilter(member.alliance)}
                                                    >
                                                        {allianceDisplay(member.alliance)}
                                                    </span>
                                                )}
                                            </td>
                                        )}
                                        {isColumnVisible('trophies') && (
                                            <td className="px-4 py-3 hidden sm:table-cell text-center">
                                                {(() => {
                                                    const badgeInfo = getTrophyBadgeInfo(trophyCounts.get(member.id));
                                                    return badgeInfo.hasAny ? (
                                                        <Link
                                                            href="/recognition"
                                                            className="hover:opacity-80 transition-opacity"
                                                            title={badgeInfo.tooltip}
                                                        >
                                                            <span className="text-base">{badgeInfo.display}</span>
                                                        </Link>
                                                    ) : (
                                                        <span className={theme.textMuted}>-</span>
                                                    );
                                                })()}
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
                                            <td colSpan={100} className="px-2 sm:px-4 py-3">
                                                <div className="ml-2 sm:ml-6">
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
                                                        <h4 className={`text-sm font-semibold ${theme.textMuted}`}>
                                                            {member.name}
                                                        </h4>
                                                        <span className={`text-xs ${theme.textMuted}`}>{member.role || 'Member'}</span>
                                                        {member.updated_at && (
                                                            <span className={`text-xs ${theme.textMuted} opacity-60`}>
                                                                Updated {(() => {
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
                                                        {(() => {
                                                            const stats = eventStats.get(member.name);
                                                            if (!stats || stats.aoo.totalAssigned === 0) return null;
                                                            const rate = Math.round((stats.aoo.participatedCount / stats.aoo.totalAssigned) * 100);
                                                            return (
                                                                <span className={`text-xs font-medium ${rate >= 80 ? 'text-green-400' : rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                                    AoO: {rate}% ({stats.aoo.participatedCount}/{stats.aoo.totalAssigned})
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                    {loadingSnapshots ? (
                                                        <div className={`text-sm ${theme.textMuted}`}>Loading...</div>
                                                    ) : memberSnapshots.length === 0 ? (
                                                        <div className={`text-sm ${theme.textMuted}`}>No snapshot history found</div>
                                                    ) : (
                                                        <div className="flex flex-col md:flex-row gap-4">
                                                            {/* Snapshot History Table */}
                                                            <div className="flex-1 overflow-x-auto">
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
                                                                            const prevSnap = snapIdx > 0 ? memberSnapshots[snapIdx - 1] : null;
                                                                            const isCarryover = (current: number | null | undefined, prev: number | null | undefined) =>
                                                                                prevSnap && current != null && current === prev;

                                                                            // Find last known non-null value for a field
                                                                            const getLastKnown = (field: 'kills' | 't4_kills' | 't5_kills' | 'honor_points') => {
                                                                                for (let i = snapIdx - 1; i >= 0; i--) {
                                                                                    if (memberSnapshots[i][field] != null) return memberSnapshots[i][field];
                                                                                }
                                                                                return null;
                                                                            };

                                                                            const carryoverClass = "opacity-40 italic";
                                                                            const powerCarry = isCarryover(snap.power, prevSnap?.power);
                                                                            const killsCarry = isCarryover(snap.kills, prevSnap?.kills);
                                                                            const t4Carry = isCarryover(snap.t4_kills, prevSnap?.t4_kills);
                                                                            const t5Carry = isCarryover(snap.t5_kills, prevSnap?.t5_kills);
                                                                            const honorCarry = isCarryover(snap.honor_points, prevSnap?.honor_points);

                                                                            // For null fields, use last known value (displayed dimmed)
                                                                            const killsDisplay = snap.kills ?? getLastKnown('kills');
                                                                            const t4Display = snap.t4_kills ?? getLastKnown('t4_kills');
                                                                            const t5Display = snap.t5_kills ?? getLastKnown('t5_kills');
                                                                            const honorDisplay = snap.honor_points ?? getLastKnown('honor_points');

                                                                            return (
                                                                                <tr key={snap.id || snapIdx} className="border-b border-[var(--border)]/30">
                                                                                    <td className="px-2 py-1 text-[#9f7aea]">
                                                                                        {formatDate(snap.snapshot_date)}
                                                                                    </td>
                                                                                    <td className={`px-2 py-1 text-right text-[#01b574] ${powerCarry ? carryoverClass : ''}`}>
                                                                                        {formatPower(snap.power)}
                                                                                    </td>
                                                                                    <td className={`px-2 py-1 text-right text-[#f56565] ${snap.kills == null || killsCarry ? carryoverClass : ''}`}>
                                                                                        {killsDisplay != null ? formatPower(killsDisplay) : '-'}
                                                                                    </td>
                                                                                    <td className={`px-2 py-1 text-right text-[#fbbf24] ${snap.t4_kills == null || t4Carry ? carryoverClass : ''}`}>
                                                                                        {t4Display != null ? formatPower(t4Display) : '-'}
                                                                                    </td>
                                                                                    <td className={`px-2 py-1 text-right text-[#f97316] ${snap.t5_kills == null || t5Carry ? carryoverClass : ''}`}>
                                                                                        {t5Display != null ? formatPower(t5Display) : '-'}
                                                                                    </td>
                                                                                    <td className={`px-2 py-1 text-right text-[#a78bfa] ${snap.honor_points == null || honorCarry ? carryoverClass : ''}`}>
                                                                                        {honorDisplay != null ? honorDisplay.toLocaleString() : '-'}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                                <div className={`text-[10px] ${theme.textMuted} mt-2 italic`}>
                                                                    Dimmed values are unchanged or carried forward from previous snapshot
                                                                </div>
                                                            </div>
                                                            {/* Growth Sparkline Charts - 2x2 grid to the right */}
                                                            {memberSnapshots.length >= 2 && (
                                                                <div className="md:w-72 shrink-0">
                                                                    <div className={`text-xs ${theme.textMuted} mb-2`}>Growth Trends</div>
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        {/* Power Sparkline */}
                                                                        <div className="text-center bg-[var(--background)]/50 rounded p-2">
                                                                            <div style={{ height: 45 }}>
                                                                                <ResponsiveContainer width="100%" height="100%">
                                                                                    <LineChart data={memberSnapshots.map(s => ({ v: s.power }))} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                                                                        <Line type="monotone" dataKey="v" stroke="#01b574" strokeWidth={2} dot={false} />
                                                                                    </LineChart>
                                                                                </ResponsiveContainer>
                                                                            </div>
                                                                            <div className={`text-[9px] ${theme.textMuted}`}>Power</div>
                                                                            <div className="text-[10px] text-[#01b574] font-medium">
                                                                                {memberSnapshots[memberSnapshots.length - 1].power > memberSnapshots[0].power ? '+' : ''}
                                                                                {formatPower(memberSnapshots[memberSnapshots.length - 1].power - memberSnapshots[0].power)}
                                                                            </div>
                                                                        </div>
                                                                        {/* KP Sparkline */}
                                                                        <div className="text-center bg-[var(--background)]/50 rounded p-2">
                                                                            <div style={{ height: 45 }}>
                                                                                <ResponsiveContainer width="100%" height="100%">
                                                                                    <LineChart data={memberSnapshots.map((s, i) => {
                                                                                        let v = s.kills;
                                                                                        if (v == null) { for (let j = i - 1; j >= 0; j--) { if (memberSnapshots[j].kills != null) { v = memberSnapshots[j].kills; break; } } }
                                                                                        return { v };
                                                                                    })} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                                                                        <Line type="monotone" dataKey="v" stroke="#f56565" strokeWidth={2} dot={false} connectNulls />
                                                                                    </LineChart>
                                                                                </ResponsiveContainer>
                                                                            </div>
                                                                            <div className={`text-[9px] ${theme.textMuted}`}>KP</div>
                                                                            <div className="text-[10px] text-[#f56565] font-medium">
                                                                                {(memberSnapshots[memberSnapshots.length - 1].kills || 0) > (memberSnapshots[0].kills || 0) ? '+' : ''}
                                                                                {formatPower((memberSnapshots[memberSnapshots.length - 1].kills || 0) - (memberSnapshots[0].kills || 0))}
                                                                            </div>
                                                                        </div>
                                                                        {/* T4 & T5 Sparkline */}
                                                                        <div className="text-center bg-[var(--background)]/50 rounded p-2">
                                                                            <div style={{ height: 45 }}>
                                                                                <ResponsiveContainer width="100%" height="100%">
                                                                                    <LineChart data={memberSnapshots.map((s, i) => {
                                                                                        let t4 = s.t4_kills;
                                                                                        let t5 = s.t5_kills;
                                                                                        if (t4 == null) { for (let j = i - 1; j >= 0; j--) { if (memberSnapshots[j].t4_kills != null) { t4 = memberSnapshots[j].t4_kills; break; } } }
                                                                                        if (t5 == null) { for (let j = i - 1; j >= 0; j--) { if (memberSnapshots[j].t5_kills != null) { t5 = memberSnapshots[j].t5_kills; break; } } }
                                                                                        return { t4, t5 };
                                                                                    })} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                                                                        <Line type="monotone" dataKey="t4" stroke="#fbbf24" strokeWidth={2} dot={false} connectNulls />
                                                                                        <Line type="monotone" dataKey="t5" stroke="#f97316" strokeWidth={2} dot={false} connectNulls />
                                                                                    </LineChart>
                                                                                </ResponsiveContainer>
                                                                            </div>
                                                                            <div className={`text-[9px] ${theme.textMuted}`}>
                                                                                <span className="text-[#fbbf24]">T4</span>{' / '}
                                                                                <span className="text-[#f97316]">T5</span>
                                                                            </div>
                                                                            <div className="text-[10px] text-[#fbbf24] font-medium">
                                                                                {(memberSnapshots[memberSnapshots.length - 1].t4_kills || 0) > (memberSnapshots[0].t4_kills || 0) ? '+' : ''}
                                                                                {formatPower((memberSnapshots[memberSnapshots.length - 1].t4_kills || 0) - (memberSnapshots[0].t4_kills || 0))}
                                                                            </div>
                                                                        </div>
                                                                        {/* Honor Points Sparkline */}
                                                                        <div className="text-center bg-[var(--background)]/50 rounded p-2">
                                                                            <div style={{ height: 45 }}>
                                                                                <ResponsiveContainer width="100%" height="100%">
                                                                                    <LineChart data={memberSnapshots.map((s, i) => {
                                                                                        let v = s.honor_points;
                                                                                        if (v == null) { for (let j = i - 1; j >= 0; j--) { if (memberSnapshots[j].honor_points != null) { v = memberSnapshots[j].honor_points; break; } } }
                                                                                        return { v };
                                                                                    })} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                                                                        <Line type="monotone" dataKey="v" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
                                                                                    </LineChart>
                                                                                </ResponsiveContainer>
                                                                            </div>
                                                                            <div className={`text-[9px] ${theme.textMuted}`}>Honor</div>
                                                                            <div className="text-[10px] text-[#a78bfa] font-medium">
                                                                                {(memberSnapshots[memberSnapshots.length - 1].honor_points || 0) > (memberSnapshots[0].honor_points || 0) ? '+' : ''}
                                                                                {(memberSnapshots[memberSnapshots.length - 1].honor_points || 0) - (memberSnapshots[0].honor_points || 0) === 0
                                                                                    ? '0'
                                                                                    : ((memberSnapshots[memberSnapshots.length - 1].honor_points || 0) - (memberSnapshots[0].honor_points || 0)).toLocaleString()}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
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
                        {/* Alliance Selector + Show Charts Toggle */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 bg-[var(--background-secondary)] rounded-lg p-0.5">
                                    {alliances.map(a => (
                                        <button
                                            key={a}
                                            onClick={() => setGrowthAllianceFilter(a)}
                                            className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
                                                growthAllianceFilter === a
                                                    ? 'bg-[#4318ff] text-white'
                                                    : `${theme.textMuted} hover:text-[var(--foreground)]`
                                            }`}
                                        >
                                            {allianceDisplay(a)}
                                        </button>
                                    ))}
                                </div>
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
                            </div>

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
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={playerDropdownOpen ? playerSearchQuery : selectedPlayer}
                                                onChange={(e) => {
                                                    setPlayerSearchQuery(e.target.value);
                                                    setPlayerDropdownOpen(true);
                                                }}
                                                onFocus={() => {
                                                    setPlayerDropdownOpen(true);
                                                    setPlayerSearchQuery('');
                                                }}
                                                onBlur={() => {
                                                    // Delay to allow click on dropdown item
                                                    setTimeout(() => setPlayerDropdownOpen(false), 150);
                                                }}
                                                placeholder="Search player..."
                                                className={`${theme.input} px-2 py-1 rounded text-xs w-[180px]`}
                                            />
                                            {playerDropdownOpen && (
                                                <div className={`absolute z-50 mt-1 w-[180px] max-h-[200px] overflow-y-auto ${theme.card} border rounded shadow-lg`}>
                                                    {roster
                                                        .filter(m => m.name.toLowerCase().includes(playerSearchQuery.toLowerCase()))
                                                        .sort((a, b) => a.name.localeCompare(b.name))
                                                        .slice(0, 50)
                                                        .map(m => (
                                                            <div
                                                                key={m.id}
                                                                className={`px-2 py-1 text-xs cursor-pointer hover:bg-[var(--background-secondary)] ${selectedPlayer === m.name ? 'bg-[var(--background-secondary)]' : ''}`}
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    setSelectedPlayer(m.name);
                                                                    setPlayerSearchQuery('');
                                                                    setPlayerDropdownOpen(false);
                                                                }}
                                                            >
                                                                {m.name}
                                                            </div>
                                                        ))
                                                    }
                                                    {roster.filter(m => m.name.toLowerCase().includes(playerSearchQuery.toLowerCase())).length === 0 && (
                                                        <div className={`px-2 py-1 text-xs ${theme.textMuted}`}>No players found</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
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
                                                    { key: 'ratio', label: 'P:KP Ratio', color: '#9f7aea' },
                                                ].map(metric => (
                                                    <button
                                                        key={metric.key}
                                                        onClick={() => setChartMetric(metric.key as 'all' | 'kp' | 'power' | 'honor' | 'ratio')}
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

                                    {/* Date Range Selection - Only for alliance mode */}
                                    {chartMode === 'alliance' && availableSnapshotDates.length > 1 && (
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs ${theme.textMuted}`}>Range:</span>
                                            <select
                                                value={chartStartDate || ''}
                                                onChange={(e) => setChartStartDate(e.target.value || null)}
                                                className={`text-xs ${theme.card} border rounded px-2 py-1`}
                                            >
                                                <option value="">Earliest</option>
                                                {availableSnapshotDates.slice().reverse().map(date => (
                                                    <option key={date} value={date}>{formatDate(date)}</option>
                                                ))}
                                            </select>
                                            <span className={`text-xs ${theme.textMuted}`}>→</span>
                                            <select
                                                value={chartEndDate || ''}
                                                onChange={(e) => setChartEndDate(e.target.value || null)}
                                                className={`text-xs ${theme.card} border rounded px-2 py-1`}
                                            >
                                                <option value="">Latest</option>
                                                {availableSnapshotDates.map(date => (
                                                    <option key={date} value={date}>{formatDate(date)}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Search bar + section controls */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px] max-w-[400px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    placeholder="Search by name or governor ID..."
                                    value={growthSearch}
                                    onChange={(e) => { setGrowthSearch(e.target.value); setProfilePlayer(null); }}
                                    className={`w-full pl-9 pr-8 py-1.5 text-sm rounded-lg ${theme.card} border focus:outline-none focus:ring-1 focus:ring-[#4318ff]`}
                                />
                                {growthSearch && (
                                    <button onClick={() => { setGrowthSearch(''); setProfilePlayer(null); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                                        <X className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--foreground)]" />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setExpandedSections(new Set(['charts', 'kp', 'power', 'honor', 'gathered', 'helps', 'mob']))}
                                    className={`px-2 py-1 text-[10px] font-medium rounded ${theme.button}`}
                                >
                                    Expand All
                                </button>
                                <button
                                    onClick={() => setExpandedSections(new Set())}
                                    className={`px-2 py-1 text-[10px] font-medium rounded ${theme.button}`}
                                >
                                    Collapse All
                                </button>
                            </div>
                        </div>

                        {/* Player Profile Card */}
                        {(() => {
                            if (!growthSearch.trim() && !profilePlayer) return null;
                            const allianceNames = new Set(roster.filter(r => r.alliance === growthAllianceFilter).map(r => r.name));
                            const rosterMatches = roster.filter(r => allianceNames.has(r.name) && matchesSearch(growthSearch, r.name, r.governor_id));

                            // If profilePlayer is set, use that; otherwise find matches
                            const target = profilePlayer
                                ? roster.find(r => r.name === profilePlayer)
                                : rosterMatches.length === 1 ? rosterMatches[0] : null;

                            // Show dropdown if multiple matches and no profile pinned
                            if (!target && rosterMatches.length > 1 && growthSearch.trim()) {
                                return (
                                    <div className={`${theme.card} border rounded-xl p-3`}>
                                        <div className={`text-xs ${theme.textMuted} mb-2`}>{rosterMatches.length} matches — click to view profile:</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {rosterMatches.slice(0, 10).map(m => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => setProfilePlayer(m.name)}
                                                    className={`px-2 py-1 text-xs rounded-lg ${theme.button} hover:bg-[#4318ff]/20 hover:text-[#4318ff]`}
                                                >
                                                    {m.name}
                                                    {m.governor_id && <span className={`ml-1 ${theme.textMuted}`}>({m.governor_id})</span>}
                                                </button>
                                            ))}
                                            {rosterMatches.length > 10 && <span className={`text-xs ${theme.textMuted} self-center`}>+{rosterMatches.length - 10} more</span>}
                                        </div>
                                    </div>
                                );
                            }

                            if (!target) return null;

                            // Compute ranks from growth data
                            const getRank = (arr: { name: string; compareGrowth?: number | null }[], name: string): { rank: number; total: number; value: number | null } => {
                                const sorted = [...arr].filter(m => allianceNames.has(m.name)).sort((a, b) => (b.compareGrowth ?? 0) - (a.compareGrowth ?? 0));
                                const idx = sorted.findIndex(m => m.name === name);
                                const entry = sorted[idx];
                                return { rank: idx >= 0 ? idx + 1 : -1, total: sorted.length, value: idx >= 0 ? (entry.compareGrowth ?? null) : null };
                            };

                            const kpRank = getRank(kpGrowthData.map(d => ({ name: d.name, compareGrowth: d.compareKpGrowth })), target.name);
                            const powerRank = getRank(powerGrowthData, target.name);
                            const honorRank = getRank(honorGrowthData, target.name);
                            const gatheredRank = getRank(gatheredGrowthData, target.name);
                            const helpsRank = getRank(helpsGrowthData, target.name);
                            const afkEntry = afkData.find(a => a.name === target.name);

                            const metrics = [
                                { label: 'KP Growth', ...kpRank, color: '#f56565' },
                                { label: 'Power Growth', ...powerRank, color: '#4318ff' },
                                { label: 'Honor Growth', ...honorRank, color: '#fbbf24' },
                                { label: 'Gathered', ...gatheredRank, color: '#38bdf8' },
                                { label: 'Alliance Helps', ...helpsRank, color: '#a78bfa' },
                            ].filter(m => m.rank > 0);

                            return (
                                <div className={`${theme.card} border rounded-xl p-4 relative`}>
                                    <button onClick={() => { setProfilePlayer(null); setGrowthSearch(''); }} className="absolute top-3 right-3">
                                        <X className="w-4 h-4 text-[var(--text-muted)] hover:text-[var(--foreground)]" />
                                    </button>
                                    <div className="flex items-center gap-3 mb-3">
                                        <h3 className="text-base font-semibold">{target.name}</h3>
                                        {target.governor_id && <span className={`text-xs ${theme.textMuted}`}>ID: {target.governor_id}</span>}
                                        {target.alliance && (
                                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#4318ff]/20 text-[#4318ff]">
                                                {allianceDisplay(target.alliance)}
                                            </span>
                                        )}
                                        <span className={`text-xs ${theme.textMuted}`}>Power: {formatPower(target.power)}</span>
                                        {afkEntry && (
                                            <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                                                afkEntry.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                                                afkEntry.status === 'afk' ? 'bg-red-500/20 text-red-400' :
                                                afkEntry.status === 'likely_afk' ? 'bg-orange-500/20 text-orange-400' :
                                                'bg-yellow-500/20 text-yellow-400'
                                            }`}>
                                                {afkEntry.status === 'active' ? 'Active' : afkEntry.status === 'afk' ? 'AFK' : afkEntry.status === 'likely_afk' ? 'Likely AFK' : 'Low Activity'}
                                                {afkEntry.daysSinceChange > 0 && ` (${afkEntry.daysSinceChange}d)`}
                                            </span>
                                        )}
                                    </div>
                                    {metrics.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                            {metrics.map(m => (
                                                <div key={m.label} className="flex items-center gap-2">
                                                    <span className={`text-xs ${theme.textMuted} w-24 shrink-0`}>{m.label}</span>
                                                    <div className="flex-1 h-3 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                        <div
                                                            className="h-full rounded"
                                                            style={{
                                                                width: `${Math.max(5, (1 - (m.rank - 1) / m.total) * 100)}%`,
                                                                backgroundColor: m.color,
                                                                opacity: 0.7,
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-medium min-w-[60px] text-right">
                                                        {m.value !== null ? (m.value >= 0 ? '+' : '') + formatPower(m.value) : '—'}
                                                    </span>
                                                    <span className={`text-[10px] ${theme.textMuted} min-w-[55px]`}>#{m.rank}/{m.total}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className={`text-xs ${theme.textMuted}`}>No growth data available for this member yet.</p>
                                    )}
                                </div>
                            );
                        })()}

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
                                    // Compute totals from allSnapshots filtered to selected alliance members (and optional tag filter)
                                    let filteredDailyTotals: { kills: number; power: number; honor: number; count: number; date: string }[];

                                    {
                                        // Only include selected alliance members, with optional tag filter
                                        const filteredMemberNames = new Set(
                                            roster
                                                .filter(m => m.alliance === growthAllianceFilter && (!tagFilter || m.tags?.includes(tagFilter)))
                                                .map(m => m.name)
                                        );

                                        const snapshotsByDate = new Map<string, { kills: number; power: number; honor: number; count: number; date: string }>();

                                        for (const snap of allSnapshots) {
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

                                        // Exclude dates with incomplete data (less than 50% of expected members)
                                        const expectedCount = filteredMemberNames.size;
                                        const minCoverage = Math.floor(expectedCount * 0.5);

                                        filteredDailyTotals = Array.from(snapshotsByDate.entries())
                                            .sort((a, b) => a[0].localeCompare(b[0]))
                                            .filter(([, totals]) => totals.count >= minCoverage)
                                            .map(([, totals]) => totals);
                                    }

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

                                        // Filter out excluded snapshot dates and build chart data
                                        const excludedDates = ['2026-01-14', '2026-01-23'];
                                        const playerChartData = playerHistory
                                            .filter(snap => !excludedDates.includes(snap.snapshot_date))
                                            .map(snap => ({
                                                date: formatDate(snap.snapshot_date),
                                                // Use local time to avoid timezone shift
                                                timestamp: new Date(snap.snapshot_date + 'T00:00:00').getTime(),
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
                                                                dataKey="timestamp"
                                                                type="number"
                                                                scale="time"
                                                                domain={['dataMin', 'dataMax']}
                                                                tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                                                axisLine={{ stroke: 'var(--border)' }}
                                                                tickLine={{ stroke: 'var(--border)' }}
                                                                tickFormatter={(ts) => {
                                                                    const d = new Date(ts);
                                                                    return `${d.getMonth() + 1}/${d.getDate()}`;
                                                                }}
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
                                                                labelFormatter={(ts) => {
                                                                    const d = new Date(ts);
                                                                    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                                                                }}
                                                                labelStyle={{ color: 'var(--foreground)' }}
                                                            />
                                                            <Line
                                                                type="natural"
                                                                dataKey={metric.key}
                                                                name={metric.label}
                                                                stroke={metric.color}
                                                                strokeWidth={2}
                                                                dot={{ fill: metric.color, strokeWidth: 2, r: 4 }}
                                                                activeDot={{ r: 6 }}
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
                                    // Filter by selected date range
                                    const dateFilteredTotals = filteredDailyTotals.filter(day => {
                                        if (chartStartDate && day.date < chartStartDate) return false;
                                        if (chartEndDate && day.date > chartEndDate) return false;
                                        return true;
                                    });

                                    // Use running maximums for KP and Honor since they can only increase
                                    // (drops would indicate data issues or member departures, not real decreases)
                                    let maxKp = 0;
                                    let maxHonor = 0;
                                    const chartData = dateFilteredTotals.map(day => {
                                        maxKp = Math.max(maxKp, day.kills);
                                        maxHonor = Math.max(maxHonor, day.honor);
                                        return {
                                            date: formatDate(day.date),
                                            // Use local time to avoid timezone shift
                                            timestamp: new Date(day.date + 'T00:00:00').getTime(),
                                            kp: maxKp,
                                            power: day.power,
                                            honor: maxHonor,
                                            ratio: maxKp > 0 ? Math.round(day.power / maxKp * 10) / 10 : 0,
                                        };
                                    });

                                    // Generate ticks for every day in the date range
                                    const generateDailyTicks = () => {
                                        if (chartData.length === 0) return [];
                                        const firstTs = chartData[0].timestamp;
                                        const lastTs = chartData[chartData.length - 1].timestamp;
                                        const ticks: number[] = [];
                                        const oneDay = 24 * 60 * 60 * 1000;
                                        for (let ts = firstTs; ts <= lastTs; ts += oneDay) {
                                            ticks.push(ts);
                                        }
                                        return ticks;
                                    };
                                    const dailyTicks = generateDailyTicks();

                                    const metrics = [
                                        { key: 'kp', label: 'Kill Points', color: '#f56565', isCount: false, isRatio: false },
                                        { key: 'power', label: 'Power', color: '#01b574', isCount: false, isRatio: false },
                                        { key: 'honor', label: 'Honor', color: '#fbbf24', isCount: false, isRatio: false },
                                        { key: 'ratio', label: 'Power:KP Ratio', color: '#9f7aea', isCount: false, isRatio: true },
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
                                                            dataKey="timestamp"
                                                            type="number"
                                                            scale="time"
                                                            domain={[dailyTicks[0] || 'dataMin', dailyTicks[dailyTicks.length - 1] || 'dataMax']}
                                                            ticks={dailyTicks}
                                                            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                                            axisLine={{ stroke: 'var(--border)' }}
                                                            tickLine={{ stroke: 'var(--border)' }}
                                                            tickFormatter={(ts) => {
                                                                const d = new Date(ts);
                                                                return `${d.getDate()}`;
                                                            }}
                                                        />
                                                        <YAxis
                                                            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                                            axisLine={{ stroke: 'var(--border)' }}
                                                            tickLine={{ stroke: 'var(--border)' }}
                                                            tickFormatter={(value) => metric.isRatio ? value.toFixed(1) : (metric.isCount ? String(value) : formatPower(value))}
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
                                                                if (metric.isRatio) return [numVal.toFixed(1), metric.label];
                                                                return [metric.isCount ? String(numVal) : formatPower(numVal), metric.label];
                                                            }}
                                                            labelFormatter={(ts) => {
                                                                const d = new Date(ts);
                                                                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
                                                            connectNulls={false}
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

                                {/* Stats Overview - 2x2 Grid (Individual or Alliance) */}
                                {(() => {
                                    // Individual player mode - show player stats
                                    if (chartMode === 'individual' && selectedPlayer && playerHistory.length > 0) {
                                        const excludedDates = ['2026-01-14', '2026-01-23'];
                                        const filteredHistory = playerHistory.filter(s => !excludedDates.includes(s.snapshot_date));
                                        const last5 = filteredHistory.slice(-5);

                                        const globalMaxPower = Math.max(...filteredHistory.map(s => s.power || 0), 1);
                                        const globalMaxKp = Math.max(...filteredHistory.map(s => s.kills || 0), 1);
                                        const globalMaxHonor = Math.max(...filteredHistory.map(s => s.honor_points || 0), 1);

                                        return (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                                                {/* Player Power Over Time */}
                                                <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                                    <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                                        <TrendingUp className="w-3 sm:w-4 h-3 sm:h-4 text-[#01b574]" />
                                                        Power
                                                    </h3>
                                                    <div className="space-y-1 sm:space-y-1.5">
                                                        {last5.map((snap) => {
                                                            const pct = ((snap.power || 0) / globalMaxPower) * 100;
                                                            return (
                                                                <div key={snap.snapshot_date} className="flex items-center gap-1 sm:gap-2">
                                                                    <span className={`text-[10px] sm:text-xs ${theme.textMuted} w-8 sm:w-12`}>{formatDate(snap.snapshot_date)}</span>
                                                                    <div className="flex-1 h-3 sm:h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-gradient-to-r from-[#01b574] to-[#01b574]/50 rounded"
                                                                            style={{ width: `${pct}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[10px] sm:text-xs font-medium w-10 sm:w-14 text-right">{formatPower(snap.power || 0)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Player KP Over Time */}
                                                <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                                    <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                                        <TrendingUp className="w-3 sm:w-4 h-3 sm:h-4 text-[#f56565]" />
                                                        KP
                                                    </h3>
                                                    <div className="space-y-1 sm:space-y-1.5">
                                                        {last5.map((snap) => {
                                                            const pct = ((snap.kills || 0) / globalMaxKp) * 100;
                                                            return (
                                                                <div key={snap.snapshot_date} className="flex items-center gap-1 sm:gap-2">
                                                                    <span className={`text-[10px] sm:text-xs ${theme.textMuted} w-8 sm:w-12`}>{formatDate(snap.snapshot_date)}</span>
                                                                    <div className="flex-1 h-3 sm:h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-gradient-to-r from-[#f56565] to-[#f56565]/50 rounded"
                                                                            style={{ width: `${pct}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[10px] sm:text-xs font-medium w-10 sm:w-14 text-right">{formatPower(snap.kills || 0)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Player Honor Over Time */}
                                                <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                                    <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                                        <Trophy className="w-3 sm:w-4 h-3 sm:h-4 text-[#fbbf24]" />
                                                        Honor
                                                    </h3>
                                                    <div className="space-y-1 sm:space-y-1.5">
                                                        {last5.map((snap) => {
                                                            const pct = ((snap.honor_points || 0) / globalMaxHonor) * 100;
                                                            return (
                                                                <div key={snap.snapshot_date} className="flex items-center gap-1 sm:gap-2">
                                                                    <span className={`text-[10px] sm:text-xs ${theme.textMuted} w-8 sm:w-12`}>{formatDate(snap.snapshot_date)}</span>
                                                                    <div className="flex-1 h-3 sm:h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-gradient-to-r from-[#fbbf24] to-[#fbbf24]/50 rounded"
                                                                            style={{ width: `${pct}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[10px] sm:text-xs font-medium w-10 sm:w-14 text-right">{(snap.honor_points || 0).toLocaleString()}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Player Power:KP Ratio Over Time */}
                                                <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                                    <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                                        <BarChart3 className="w-3 sm:w-4 h-3 sm:h-4 text-[#9f7aea]" />
                                                        <span className="hidden sm:inline">Power:KP</span> Ratio
                                                    </h3>
                                                    <div className="space-y-1 sm:space-y-1.5">
                                                        {last5.map((snap) => {
                                                            const ratio = (snap.kills || 0) > 0 ? (snap.power || 0) / (snap.kills || 1) : 0;
                                                            const ratios = filteredHistory.map(s => (s.kills || 0) > 0 ? (s.power || 0) / (s.kills || 1) : 0);
                                                            const minRatio = Math.min(...ratios.filter(r => r > 0));
                                                            const maxRatio = Math.max(...ratios);
                                                            const range = maxRatio - minRatio || 1;
                                                            const pct = ratio > 0 ? ((ratio - minRatio) / range) * 100 : 0;
                                                            return (
                                                                <div key={snap.snapshot_date} className="flex items-center gap-1 sm:gap-2">
                                                                    <span className={`text-[10px] sm:text-xs ${theme.textMuted} w-8 sm:w-12`}>{formatDate(snap.snapshot_date)}</span>
                                                                    <div className="flex-1 h-3 sm:h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-gradient-to-r from-[#9f7aea] to-[#9f7aea]/50 rounded"
                                                                            style={{ width: `${Math.max(pct, 10)}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[10px] sm:text-xs font-medium w-10 sm:w-14 text-right">{ratio.toFixed(1)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    // Alliance mode - show alliance totals
                                    // Compute running maximums for KP and Honor (they can only increase)
                                    let runningMaxKp = 0;
                                    let runningMaxHonor = 0;
                                    const overviewData = filteredDailyTotals.map(day => {
                                        runningMaxKp = Math.max(runningMaxKp, day.kills);
                                        runningMaxHonor = Math.max(runningMaxHonor, day.honor);
                                        return {
                                            date: day.date,
                                            power: day.power,
                                            kills: runningMaxKp,
                                            honor: runningMaxHonor,
                                        };
                                    });
                                    const last5 = overviewData.slice(-5);
                                    const globalMaxPower = Math.max(...overviewData.map(d => d.power), 1);
                                    const globalMaxKp = Math.max(...overviewData.map(d => d.kills), 1);
                                    const globalMaxHonor = Math.max(...overviewData.map(d => d.honor), 1);

                                    return (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                                    {/* Total Power Over Time */}
                                    <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                        <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                            <TrendingUp className="w-3 sm:w-4 h-3 sm:h-4 text-[#01b574]" />
                                            <span className="hidden sm:inline">Total</span> Power
                                        </h3>
                                        <div className="space-y-1 sm:space-y-1.5">
                                            {last5.map((day) => {
                                                const pct = (day.power / globalMaxPower) * 100;
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
                                            {last5.map((day) => {
                                                const pct = (day.kills / globalMaxKp) * 100;
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
                                            {last5.map((day) => {
                                                const pct = (day.honor / globalMaxHonor) * 100;
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

                                    {/* Power:KP Ratio Over Time */}
                                    <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                        <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                            <BarChart3 className="w-3 sm:w-4 h-3 sm:h-4 text-[#9f7aea]" />
                                            <span className="hidden sm:inline">Power:KP</span> Ratio
                                        </h3>
                                        <div className="space-y-1 sm:space-y-1.5">
                                            {filteredDailyTotals.slice(-5).map((day) => {
                                                const ratio = day.kills > 0 ? day.power / day.kills : 0;
                                                const ratios = filteredDailyTotals.map(d => d.kills > 0 ? d.power / d.kills : 0);
                                                const minRatio = Math.min(...ratios.filter(r => r > 0));
                                                const maxRatio = Math.max(...ratios);
                                                const range = maxRatio - minRatio || 1;
                                                const pct = ratio > 0 ? ((ratio - minRatio) / range) * 100 : 0;
                                                return (
                                                    <div key={day.date} className="flex items-center gap-1 sm:gap-2">
                                                        <span className={`text-[10px] sm:text-xs ${theme.textMuted} w-8 sm:w-12`}>{formatDate(day.date)}</span>
                                                        <div className="flex-1 h-3 sm:h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-[#9f7aea] to-[#9f7aea]/50 rounded"
                                                                style={{ width: `${Math.max(pct, 10)}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] sm:text-xs font-medium w-10 sm:w-14 text-right">{ratio.toFixed(1)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                </div>
                                    );
                                })()}

                                {/* KP Growth Table — Collapsible */}
                                {kpGrowthData.length > 0 && (
                                    <button onClick={() => toggleSection('kp')} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl ${theme.card} border hover:border-[#4318ff]/30 transition-all`}>
                                        <span className="flex items-center gap-2 text-sm font-semibold">
                                            {expandedSections.has('kp') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            <TrendingUp className="w-4 h-4 text-[#f56565]" />
                                            Kill Points Growth
                                        </span>
                                        <span className={`text-xs ${theme.textMuted}`}>{kpGrowthData.length} members</span>
                                    </button>
                                )}
                                {expandedSections.has('kp') && (() => {
                                    if (kpGrowthData.length === 0) return null;

                                    const allianceNames = new Set(roster.filter(r => r.alliance === growthAllianceFilter).map(r => r.name));
                                    const sortedKpGrowth = [...kpGrowthData]
                                        .filter(m => allianceNames.has(m.name))
                                        .filter(m => !tagFilter || roster.find(r => r.name === m.name)?.tags?.includes(tagFilter))
                                        .filter(m => matchesSearch(growthSearch, m.name, roster.find(r => r.name === m.name)?.governor_id))
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
                                    const kpCurrentDate = kpGrowthData[0]?.currentDate ? formatDate(kpGrowthData[0].currentDate) : 'Current';

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
                                                <table className="w-full text-xs sm:text-sm min-w-[600px]">
                                                    <thead className="sticky top-0 bg-[var(--background-card)]">
                                                        <tr className="border-b border-[var(--border)]">
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>#</th>
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleKpSort('name')} className="flex items-center gap-1 hover:text-white">
                                                                    Name <KpSortIcon field="name" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                First KP
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                {kpCurrentDate} KP
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleKpSort('allTimeKpGrowth')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    All-Time <KpSortIcon field="allTimeKpGrowth" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <button onClick={() => handleKpSort('compareKpGrowth')} className="flex items-center gap-1 hover:text-white">
                                                                        Growth <KpSortIcon field="compareKpGrowth" />
                                                                    </button>
                                                                    <div className="flex items-center gap-1 text-[10px] font-normal normal-case">
                                                                        <select
                                                                            value={growthCompareDate || ''}
                                                                            onChange={(e) => setGrowthCompareDate(e.target.value || null)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`${theme.card} border rounded px-1 py-0.5`}
                                                                        >
                                                                            <option value="">From...</option>
                                                                            {availableSnapshotDates.slice(1).map(date => (
                                                                                <option key={date} value={date}>{formatDate(date)}</option>
                                                                            ))}
                                                                        </select>
                                                                        <span>→</span>
                                                                        <select
                                                                            value={growthEndDate || ''}
                                                                            onChange={(e) => setGrowthEndDate(e.target.value || null)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`${theme.card} border rounded px-1 py-0.5`}
                                                                        >
                                                                            <option value="">Latest</option>
                                                                            {availableSnapshotDates.map(date => (
                                                                                <option key={date} value={date}>{formatDate(date)}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {displayKpMembers.map((member, idx) => {
                                                            const rosterMember = roster.find(r => r.name === member.name);
                                                            const globalIdx = kpGrowthPage * kpGrowthRowsPerPage + idx;
                                                            const maxAllTime = Math.max(...sortedKpGrowth.map(m => Math.abs(m.allTimeKpGrowth)));
                                                            const maxCompare = Math.max(...sortedKpGrowth.filter(m => m.compareKpGrowth !== null).map(m => Math.abs(m.compareKpGrowth!)));
                                                            return (
                                                                <tr key={member.name} className={`border-b border-[var(--border)]/50 ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                                    <td className={`px-2 py-2 ${theme.textMuted}`}>{globalIdx + 1}</td>
                                                                    <td className="px-2 py-2 font-medium">
                                                                        <span
                                                                            className="cursor-pointer hover:text-[#4318ff] hover:underline"
                                                                            onClick={() => {
                                                                                setSelectedPlayer(member.name);
                                                                                setChartMode('individual');
                                                                                setShowCharts(true);
                                                                            }}
                                                                        >
                                                                            {member.name}
                                                                        </span>
                                                                        {isEditor && rosterMember?.tags?.includes('angmar-og') && (
                                                                            <span className="ml-1.5 px-1 py-0.5 text-[9px] font-semibold rounded bg-amber-500/20 text-amber-400">ANG</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#9f7aea]">
                                                                        {formatPower(member.firstKp)}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#01b574]">
                                                                        {formatPower(member.currentKp)}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                {(() => {
                                                                                    const pct = maxAllTime > 0 ? (Math.abs(member.allTimeKpGrowth) / maxAllTime) * 100 : 0;
                                                                                    const isPositive = member.allTimeKpGrowth >= 0;
                                                                                    return (
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#f56565] to-[#f56565]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                            <div className="text-right min-w-[70px]">
                                                                                <span className={`font-medium ${member.allTimeKpGrowth >= 0 ? 'text-[#f56565]' : 'text-gray-400'}`}>
                                                                                    {member.allTimeKpGrowth >= 0 ? '+' : ''}{formatPower(member.allTimeKpGrowth)}
                                                                                </span>
                                                                                <span className={`text-[10px] ${theme.textMuted} ml-1`}>
                                                                                    ({member.allTimeKpGrowthPercent.toFixed(1)}%)
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        {member.compareKpGrowth !== null ? (
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                    {(() => {
                                                                                        const pct = maxCompare > 0 ? (Math.abs(member.compareKpGrowth!) / maxCompare) * 100 : 0;
                                                                                        const isPositive = member.compareKpGrowth! >= 0;
                                                                                        return (
                                                                                            <div
                                                                                                className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#01b574] to-[#01b574]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                                style={{ width: `${pct}%` }}
                                                                                            />
                                                                                        );
                                                                                    })()}
                                                                                </div>
                                                                                <div className="text-right min-w-[70px]">
                                                                                    <span className={`font-medium ${member.compareKpGrowth! >= 0 ? 'text-[#01b574]' : 'text-gray-400'}`}>
                                                                                        {member.compareKpGrowth! >= 0 ? '+' : ''}{formatPower(member.compareKpGrowth!)}
                                                                                    </span>
                                                                                    {member.compareKpGrowthPercent !== null && (
                                                                                        <span className={`text-[10px] ${theme.textMuted} ml-1`}>
                                                                                            ({member.compareKpGrowthPercent.toFixed(1)}%)
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ) : <span className={theme.textMuted}>—</span>}
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

                                {/* Honor Growth Table — Collapsible */}
                                {honorGrowthData.length > 0 && (
                                    <button onClick={() => toggleSection('honor')} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl ${theme.card} border hover:border-[#4318ff]/30 transition-all`}>
                                        <span className="flex items-center gap-2 text-sm font-semibold">
                                            {expandedSections.has('honor') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            <Trophy className="w-4 h-4 text-[#fbbf24]" />
                                            Honor Points Growth
                                        </span>
                                        <span className={`text-xs ${theme.textMuted}`}>{honorGrowthData.length} members</span>
                                    </button>
                                )}
                                {expandedSections.has('honor') && (() => {
                                    if (honorGrowthData.length === 0) return null;

                                    const honorAllianceNames = new Set(roster.filter(r => r.alliance === growthAllianceFilter).map(r => r.name));
                                    const sortedHonorGrowth = [...honorGrowthData]
                                        .filter(m => honorAllianceNames.has(m.name))
                                        .filter(m => !tagFilter || roster.find(r => r.name === m.name)?.tags?.includes(tagFilter))
                                        .filter(m => matchesSearch(growthSearch, m.name, roster.find(r => r.name === m.name)?.governor_id))
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
                                    const currentDate = honorGrowthData[0]?.currentDate ? formatDate(honorGrowthData[0].currentDate) : 'Current';

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
                                                <table className="w-full text-xs sm:text-sm min-w-[700px]" style={{ tableLayout: 'fixed' }}>
                                                    <colgroup>
                                                        <col style={{ width: '4%' }} />
                                                        <col style={{ width: '18%' }} />
                                                        <col style={{ width: '12%' }} />
                                                        <col style={{ width: '12%' }} />
                                                        <col style={{ width: '27%' }} />
                                                        <col style={{ width: '27%' }} />
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
                                                                First
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                {currentDate}
                                                            </th>
                                                            <th className={`px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleHonorSort('allTimeGrowth')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    All-Time <HonorSortIcon field="allTimeGrowth" />
                                                                </button>
                                                            </th>
                                                            <th className={`px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <button onClick={() => handleHonorSort('compareGrowth')} className="flex items-center gap-1 hover:text-white">
                                                                        Growth <HonorSortIcon field="compareGrowth" />
                                                                    </button>
                                                                    <div className="flex items-center gap-1 text-[10px] font-normal normal-case">
                                                                        <select
                                                                            value={growthCompareDate || ''}
                                                                            onChange={(e) => setGrowthCompareDate(e.target.value || null)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`${theme.card} border rounded px-1 py-0.5`}
                                                                        >
                                                                            <option value="">From...</option>
                                                                            {availableSnapshotDates.slice(1).map(date => (
                                                                                <option key={date} value={date}>{formatDate(date)}</option>
                                                                            ))}
                                                                        </select>
                                                                        <span>→</span>
                                                                        <select
                                                                            value={growthEndDate || ''}
                                                                            onChange={(e) => setGrowthEndDate(e.target.value || null)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`${theme.card} border rounded px-1 py-0.5`}
                                                                        >
                                                                            <option value="">Latest</option>
                                                                            {availableSnapshotDates.map(date => (
                                                                                <option key={date} value={date}>{formatDate(date)}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {displayHonorMembers.map((member, idx) => {
                                                            const rosterMember = roster.find(r => r.name === member.name);
                                                            const globalIdx = honorGrowthPage * honorGrowthRowsPerPage + idx;
                                                            const maxAllTime = Math.max(...sortedHonorGrowth.map(m => Math.abs(m.allTimeGrowth)));
                                                            const maxCompare = Math.max(...sortedHonorGrowth.filter(m => m.compareGrowth !== null).map(m => Math.abs(m.compareGrowth!)));
                                                            return (
                                                                <tr key={member.name} className={`border-b border-[var(--border)]/50 ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                                    <td className={`px-2 py-2 ${theme.textMuted}`}>{globalIdx + 1}</td>
                                                                    <td className="px-2 py-2 font-medium">
                                                                        <span
                                                                            className="cursor-pointer hover:text-[#4318ff] hover:underline"
                                                                            onClick={() => {
                                                                                setSelectedPlayer(member.name);
                                                                                setChartMode('individual');
                                                                                setShowCharts(true);
                                                                            }}
                                                                        >
                                                                            {member.name}
                                                                        </span>
                                                                        {isEditor && rosterMember?.tags?.includes('angmar-og') && (
                                                                            <span className="ml-1.5 px-1 py-0.5 text-[9px] font-semibold rounded bg-amber-500/20 text-amber-400">ANG</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#9f7aea]">
                                                                        {member.firstHonor.toLocaleString()}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#01b574]">
                                                                        {member.currentHonor.toLocaleString()}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        {(() => {
                                                                            const pct = maxAllTime > 0 ? (Math.abs(member.allTimeGrowth) / maxAllTime) * 100 : 0;
                                                                            const isPositive = member.allTimeGrowth >= 0;
                                                                            return (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#fbbf24] to-[#fbbf24]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="text-right min-w-[80px]">
                                                                                        <span className={`font-medium ${isPositive ? 'text-[#fbbf24]' : 'text-gray-400'}`}>
                                                                                            {member.allTimeGrowth >= 0 ? '+' : ''}{member.allTimeGrowth.toLocaleString()}
                                                                                        </span>
                                                                                        <span className={`text-[10px] ${theme.textMuted} ml-1`}>
                                                                                            ({member.allTimeGrowthPercent.toFixed(1)}%)
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        {member.compareGrowth !== null ? (() => {
                                                                            const pct = maxCompare > 0 ? (Math.abs(member.compareGrowth!) / maxCompare) * 100 : 0;
                                                                            const isPositive = member.compareGrowth! >= 0;
                                                                            return (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#01b574] to-[#01b574]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="text-right min-w-[80px]">
                                                                                        <span className={`font-medium ${isPositive ? 'text-[#01b574]' : 'text-gray-400'}`}>
                                                                                            {member.compareGrowth! >= 0 ? '+' : ''}{member.compareGrowth!.toLocaleString()}
                                                                                        </span>
                                                                                        {member.compareGrowthPercent !== null && (
                                                                                            <span className={`text-[10px] ${theme.textMuted} ml-1`}>
                                                                                                ({member.compareGrowthPercent.toFixed(1)}%)
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })() : <span className={theme.textMuted}>—</span>}
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

                                {/* Power Growth Table — Collapsible */}
                                {powerGrowthData.length > 0 && (
                                    <button onClick={() => toggleSection('power')} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl ${theme.card} border hover:border-[#4318ff]/30 transition-all`}>
                                        <span className="flex items-center gap-2 text-sm font-semibold">
                                            {expandedSections.has('power') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            <TrendingUp className="w-4 h-4 text-[#4318ff]" />
                                            Power Growth
                                        </span>
                                        <span className={`text-xs ${theme.textMuted}`}>{powerGrowthData.length} members</span>
                                    </button>
                                )}
                                {expandedSections.has('power') && (() => {
                                    if (powerGrowthData.length === 0) return null;

                                    const powerAllianceNames = new Set(roster.filter(r => r.alliance === growthAllianceFilter).map(r => r.name));
                                    const sortedPowerGrowth = [...powerGrowthData]
                                        .filter(m => powerAllianceNames.has(m.name))
                                        .filter(m => !tagFilter || roster.find(r => r.name === m.name)?.tags?.includes(tagFilter))
                                        .filter(m => matchesSearch(growthSearch, m.name, roster.find(r => r.name === m.name)?.governor_id))
                                        .sort((a, b) => {
                                            const { field, direction } = powerGrowthSort;
                                            const multiplier = direction === 'asc' ? 1 : -1;
                                            if (field === 'name') return multiplier * a.name.localeCompare(b.name);
                                            return multiplier * ((a[field] ?? 0) - (b[field] ?? 0));
                                        });

                                    const powerTotalPages = Math.ceil(sortedPowerGrowth.length / powerGrowthRowsPerPage);
                                    const displayPowerMembers = sortedPowerGrowth.slice(
                                        powerGrowthPage * powerGrowthRowsPerPage,
                                        (powerGrowthPage + 1) * powerGrowthRowsPerPage
                                    );
                                    const powerCurrentDate = powerGrowthData[0]?.currentDate ? formatDate(powerGrowthData[0].currentDate) : 'Current';

                                    const handlePowerSort = (field: typeof powerGrowthSort.field) => {
                                        setPowerGrowthSort(prev => ({
                                            field,
                                            direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
                                        }));
                                    };

                                    const PowerSortIcon = ({ field }: { field: typeof powerGrowthSort.field }) => {
                                        if (powerGrowthSort.field !== field) return <span className="opacity-30">↕</span>;
                                        return powerGrowthSort.direction === 'asc' ? <span>↑</span> : <span>↓</span>;
                                    };

                                    return (
                                        <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                            <div className="flex items-center justify-between mb-2 sm:mb-4">
                                                <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                                                    <TrendingUp className="w-4 h-4 text-[#4318ff]" />
                                                    <span className="hidden sm:inline">Power Growth</span>
                                                    <span className="sm:hidden">Power</span>
                                                    <span className={`text-xs font-normal ${theme.textMuted}`}>({sortedPowerGrowth.length})</span>
                                                </h3>
                                            </div>
                                            <div className="overflow-x-auto mobile-scroll">
                                                <table className="w-full text-xs sm:text-sm min-w-[700px]" style={{ tableLayout: 'fixed' }}>
                                                    <colgroup>
                                                        <col style={{ width: '4%' }} />
                                                        <col style={{ width: '18%' }} />
                                                        <col style={{ width: '12%' }} />
                                                        <col style={{ width: '12%' }} />
                                                        <col style={{ width: '27%' }} />
                                                        <col style={{ width: '27%' }} />
                                                    </colgroup>
                                                    <thead className="sticky top-0 bg-[var(--background-card)]">
                                                        <tr className="border-b border-[var(--border)]">
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>#</th>
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handlePowerSort('name')} className="flex items-center gap-1 hover:text-white">
                                                                    Name <PowerSortIcon field="name" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>First</th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>{powerCurrentDate}</th>
                                                            <th className={`px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handlePowerSort('allTimeGrowth')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    All-Time <PowerSortIcon field="allTimeGrowth" />
                                                                </button>
                                                            </th>
                                                            <th className={`px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <button onClick={() => handlePowerSort('compareGrowth')} className="flex items-center gap-1 hover:text-white">
                                                                        Growth <PowerSortIcon field="compareGrowth" />
                                                                    </button>
                                                                    <div className="flex items-center gap-1 text-[10px] font-normal normal-case">
                                                                        <select
                                                                            value={growthCompareDate || ''}
                                                                            onChange={(e) => setGrowthCompareDate(e.target.value || null)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`${theme.card} border rounded px-1 py-0.5`}
                                                                        >
                                                                            <option value="">From...</option>
                                                                            {availableSnapshotDates.slice(1).map(date => (
                                                                                <option key={date} value={date}>{formatDate(date)}</option>
                                                                            ))}
                                                                        </select>
                                                                        <span>→</span>
                                                                        <select
                                                                            value={growthEndDate || ''}
                                                                            onChange={(e) => setGrowthEndDate(e.target.value || null)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`${theme.card} border rounded px-1 py-0.5`}
                                                                        >
                                                                            <option value="">Latest</option>
                                                                            {availableSnapshotDates.map(date => (
                                                                                <option key={date} value={date}>{formatDate(date)}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {displayPowerMembers.map((member, idx) => {
                                                            const globalIdx = powerGrowthPage * powerGrowthRowsPerPage + idx;
                                                            const maxAllTime = Math.max(...sortedPowerGrowth.map(m => Math.abs(m.allTimeGrowth)));
                                                            const maxCompare = Math.max(...sortedPowerGrowth.filter(m => m.compareGrowth !== null).map(m => Math.abs(m.compareGrowth!)));
                                                            return (
                                                                <tr key={member.name} className={`border-b border-[var(--border)]/50 ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                                    <td className={`px-2 py-2 ${theme.textMuted}`}>{globalIdx + 1}</td>
                                                                    <td className="px-2 py-2 font-medium">
                                                                        <span
                                                                            className="cursor-pointer hover:text-[#4318ff] hover:underline"
                                                                            onClick={() => {
                                                                                setSelectedPlayer(member.name);
                                                                                setChartMode('individual');
                                                                                setChartMetric('power');
                                                                                setShowCharts(true);
                                                                            }}
                                                                        >
                                                                            {member.name}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#9f7aea]">
                                                                        {formatPower(member.firstPower)}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#01b574]">
                                                                        {formatPower(member.currentPower)}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        {(() => {
                                                                            const pct = maxAllTime > 0 ? (Math.abs(member.allTimeGrowth) / maxAllTime) * 100 : 0;
                                                                            const isPositive = member.allTimeGrowth >= 0;
                                                                            return (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#4318ff] to-[#4318ff]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="text-right min-w-[80px]">
                                                                                        <span className={`font-medium ${isPositive ? 'text-[#4318ff]' : 'text-gray-400'}`}>
                                                                                            {member.allTimeGrowth >= 0 ? '+' : ''}{formatPower(member.allTimeGrowth)}
                                                                                        </span>
                                                                                        <span className={`text-[10px] ${theme.textMuted} ml-1`}>
                                                                                            ({member.allTimeGrowthPercent.toFixed(1)}%)
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        {member.compareGrowth !== null ? (() => {
                                                                            const pct = maxCompare > 0 ? (Math.abs(member.compareGrowth!) / maxCompare) * 100 : 0;
                                                                            const isPositive = member.compareGrowth! >= 0;
                                                                            return (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#01b574] to-[#01b574]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="text-right min-w-[80px]">
                                                                                        <span className={`font-medium ${isPositive ? 'text-[#01b574]' : 'text-gray-400'}`}>
                                                                                            {member.compareGrowth! >= 0 ? '+' : ''}{formatPower(member.compareGrowth!)}
                                                                                        </span>
                                                                                        {member.compareGrowthPercent !== null && (
                                                                                            <span className={`text-[10px] ${theme.textMuted} ml-1`}>
                                                                                                ({member.compareGrowthPercent.toFixed(1)}%)
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })() : <span className={theme.textMuted}>—</span>}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {powerTotalPages > 1 && (
                                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                                                    <div className={`text-xs ${theme.textMuted}`}>
                                                        Showing {powerGrowthPage * powerGrowthRowsPerPage + 1}-{Math.min((powerGrowthPage + 1) * powerGrowthRowsPerPage, sortedPowerGrowth.length)} of {sortedPowerGrowth.length}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={powerGrowthRowsPerPage}
                                                            onChange={(e) => { setPowerGrowthRowsPerPage(Number(e.target.value)); setPowerGrowthPage(0); }}
                                                            className={`text-xs ${theme.card} border rounded px-2 py-1`}
                                                        >
                                                            <option value={10}>10</option>
                                                            <option value={25}>25</option>
                                                            <option value={50}>50</option>
                                                            <option value={100}>100</option>
                                                        </select>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => setPowerGrowthPage(0)} disabled={powerGrowthPage === 0} className={`px-2 py-1 text-xs rounded ${powerGrowthPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>««</button>
                                                            <button onClick={() => setPowerGrowthPage(p => Math.max(0, p - 1))} disabled={powerGrowthPage === 0} className={`px-2 py-1 text-xs rounded ${powerGrowthPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>«</button>
                                                            <span className={`px-2 py-1 text-xs ${theme.textMuted}`}>{powerGrowthPage + 1} / {powerTotalPages}</span>
                                                            <button onClick={() => setPowerGrowthPage(p => Math.min(powerTotalPages - 1, p + 1))} disabled={powerGrowthPage >= powerTotalPages - 1} className={`px-2 py-1 text-xs rounded ${powerGrowthPage >= powerTotalPages - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>»</button>
                                                            <button onClick={() => setPowerGrowthPage(powerTotalPages - 1)} disabled={powerGrowthPage >= powerTotalPages - 1} className={`px-2 py-1 text-xs rounded ${powerGrowthPage >= powerTotalPages - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>»»</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Gathered Growth Table — Collapsible */}
                                {gatheredGrowthData.length > 0 && (
                                    <button onClick={() => toggleSection('gathered')} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl ${theme.card} border hover:border-[#4318ff]/30 transition-all`}>
                                        <span className="flex items-center gap-2 text-sm font-semibold">
                                            {expandedSections.has('gathered') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            <TrendingUp className="w-4 h-4 text-[#38bdf8]" />
                                            Gathering Growth
                                        </span>
                                        <span className={`text-xs ${theme.textMuted}`}>{gatheredGrowthData.length} members</span>
                                    </button>
                                )}
                                {expandedSections.has('gathered') && (() => {
                                    if (gatheredGrowthData.length === 0) return null;

                                    const gatheredAllianceNames = new Set(roster.filter(r => r.alliance === growthAllianceFilter).map(r => r.name));
                                    const sortedGatheredGrowth = [...gatheredGrowthData]
                                        .filter(m => gatheredAllianceNames.has(m.name))
                                        .filter(m => !tagFilter || roster.find(r => r.name === m.name)?.tags?.includes(tagFilter))
                                        .filter(m => matchesSearch(growthSearch, m.name, roster.find(r => r.name === m.name)?.governor_id))
                                        .sort((a, b) => {
                                            const { field, direction } = gatheredGrowthSort;
                                            const multiplier = direction === 'asc' ? 1 : -1;
                                            if (field === 'name') return multiplier * a.name.localeCompare(b.name);
                                            return multiplier * ((a[field] ?? 0) - (b[field] ?? 0));
                                        });

                                    const gatheredTotalPages = Math.ceil(sortedGatheredGrowth.length / gatheredGrowthRowsPerPage);
                                    const displayGatheredMembers = sortedGatheredGrowth.slice(
                                        gatheredGrowthPage * gatheredGrowthRowsPerPage,
                                        (gatheredGrowthPage + 1) * gatheredGrowthRowsPerPage
                                    );
                                    const gatheredCurrentDate = gatheredGrowthData[0]?.currentDate ? formatDate(gatheredGrowthData[0].currentDate) : 'Current';

                                    const handleGatheredSort = (field: typeof gatheredGrowthSort.field) => {
                                        setGatheredGrowthSort(prev => ({
                                            field,
                                            direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
                                        }));
                                    };

                                    const GatheredSortIcon = ({ field }: { field: typeof gatheredGrowthSort.field }) => {
                                        if (gatheredGrowthSort.field !== field) return <span className="opacity-30">↕</span>;
                                        return gatheredGrowthSort.direction === 'asc' ? <span>↑</span> : <span>↓</span>;
                                    };

                                    return (
                                        <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                            <div className="flex items-center justify-between mb-2 sm:mb-4">
                                                <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                                                    <TrendingUp className="w-4 h-4 text-[#38bdf8]" />
                                                    <span className="hidden sm:inline">Gathering Growth</span>
                                                    <span className="sm:hidden">Gathering</span>
                                                    <span className={`text-xs font-normal ${theme.textMuted}`}>({sortedGatheredGrowth.length})</span>
                                                </h3>
                                            </div>
                                            <div className="overflow-x-auto mobile-scroll">
                                                <table className="w-full text-xs sm:text-sm min-w-[700px]" style={{ tableLayout: 'fixed' }}>
                                                    <colgroup>
                                                        <col style={{ width: '4%' }} />
                                                        <col style={{ width: '18%' }} />
                                                        <col style={{ width: '12%' }} />
                                                        <col style={{ width: '12%' }} />
                                                        <col style={{ width: '27%' }} />
                                                        <col style={{ width: '27%' }} />
                                                    </colgroup>
                                                    <thead className="sticky top-0 bg-[var(--background-card)]">
                                                        <tr className="border-b border-[var(--border)]">
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>#</th>
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleGatheredSort('name')} className="flex items-center gap-1 hover:text-white">
                                                                    Name <GatheredSortIcon field="name" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>First</th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>{gatheredCurrentDate}</th>
                                                            <th className={`px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleGatheredSort('allTimeGrowth')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    All-Time <GatheredSortIcon field="allTimeGrowth" />
                                                                </button>
                                                            </th>
                                                            <th className={`px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <button onClick={() => handleGatheredSort('compareGrowth')} className="flex items-center gap-1 hover:text-white">
                                                                        Growth <GatheredSortIcon field="compareGrowth" />
                                                                    </button>
                                                                    <div className="flex items-center gap-1 text-[10px] font-normal normal-case">
                                                                        <select
                                                                            value={growthCompareDate || ''}
                                                                            onChange={(e) => setGrowthCompareDate(e.target.value || null)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`${theme.card} border rounded px-1 py-0.5`}
                                                                        >
                                                                            <option value="">From...</option>
                                                                            {availableSnapshotDates.slice(1).map(date => (
                                                                                <option key={date} value={date}>{formatDate(date)}</option>
                                                                            ))}
                                                                        </select>
                                                                        <span>→</span>
                                                                        <select
                                                                            value={growthEndDate || ''}
                                                                            onChange={(e) => setGrowthEndDate(e.target.value || null)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`${theme.card} border rounded px-1 py-0.5`}
                                                                        >
                                                                            <option value="">Latest</option>
                                                                            {availableSnapshotDates.map(date => (
                                                                                <option key={date} value={date}>{formatDate(date)}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {displayGatheredMembers.map((member, idx) => {
                                                            const globalIdx = gatheredGrowthPage * gatheredGrowthRowsPerPage + idx;
                                                            const maxAllTime = Math.max(...sortedGatheredGrowth.map(m => Math.abs(m.allTimeGrowth)));
                                                            const maxCompare = Math.max(...sortedGatheredGrowth.filter(m => m.compareGrowth !== null).map(m => Math.abs(m.compareGrowth!)));
                                                            return (
                                                                <tr key={member.name} className={`border-b border-[var(--border)]/50 ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                                    <td className={`px-2 py-2 ${theme.textMuted}`}>{globalIdx + 1}</td>
                                                                    <td className="px-2 py-2 font-medium">{member.name}</td>
                                                                    <td className="px-2 py-2 text-right text-[#9f7aea]">
                                                                        {formatPower(member.firstGathered)}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#01b574]">
                                                                        {formatPower(member.currentGathered)}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        {(() => {
                                                                            const pct = maxAllTime > 0 ? (Math.abs(member.allTimeGrowth) / maxAllTime) * 100 : 0;
                                                                            const isPositive = member.allTimeGrowth >= 0;
                                                                            return (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#38bdf8] to-[#38bdf8]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="text-right min-w-[80px]">
                                                                                        <span className={`font-medium ${isPositive ? 'text-[#38bdf8]' : 'text-gray-400'}`}>
                                                                                            {member.allTimeGrowth >= 0 ? '+' : ''}{formatPower(member.allTimeGrowth)}
                                                                                        </span>
                                                                                        <span className={`text-[10px] ${theme.textMuted} ml-1`}>
                                                                                            ({member.allTimeGrowthPercent.toFixed(1)}%)
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        {member.compareGrowth !== null ? (() => {
                                                                            const pct = maxCompare > 0 ? (Math.abs(member.compareGrowth!) / maxCompare) * 100 : 0;
                                                                            const isPositive = member.compareGrowth! >= 0;
                                                                            return (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#01b574] to-[#01b574]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="text-right min-w-[80px]">
                                                                                        <span className={`font-medium ${isPositive ? 'text-[#01b574]' : 'text-gray-400'}`}>
                                                                                            {member.compareGrowth! >= 0 ? '+' : ''}{formatPower(member.compareGrowth!)}
                                                                                        </span>
                                                                                        {member.compareGrowthPercent !== null && (
                                                                                            <span className={`text-[10px] ${theme.textMuted} ml-1`}>
                                                                                                ({member.compareGrowthPercent.toFixed(1)}%)
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })() : <span className={theme.textMuted}>—</span>}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {gatheredTotalPages > 1 && (
                                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                                                    <div className={`text-xs ${theme.textMuted}`}>
                                                        Showing {gatheredGrowthPage * gatheredGrowthRowsPerPage + 1}-{Math.min((gatheredGrowthPage + 1) * gatheredGrowthRowsPerPage, sortedGatheredGrowth.length)} of {sortedGatheredGrowth.length}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={gatheredGrowthRowsPerPage}
                                                            onChange={(e) => { setGatheredGrowthRowsPerPage(Number(e.target.value)); setGatheredGrowthPage(0); }}
                                                            className={`text-xs ${theme.card} border rounded px-2 py-1`}
                                                        >
                                                            <option value={10}>10</option>
                                                            <option value={25}>25</option>
                                                            <option value={50}>50</option>
                                                            <option value={100}>100</option>
                                                        </select>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => setGatheredGrowthPage(0)} disabled={gatheredGrowthPage === 0} className={`px-2 py-1 text-xs rounded ${gatheredGrowthPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>««</button>
                                                            <button onClick={() => setGatheredGrowthPage(p => Math.max(0, p - 1))} disabled={gatheredGrowthPage === 0} className={`px-2 py-1 text-xs rounded ${gatheredGrowthPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>«</button>
                                                            <span className={`px-2 py-1 text-xs ${theme.textMuted}`}>{gatheredGrowthPage + 1} / {gatheredTotalPages}</span>
                                                            <button onClick={() => setGatheredGrowthPage(p => Math.min(gatheredTotalPages - 1, p + 1))} disabled={gatheredGrowthPage >= gatheredTotalPages - 1} className={`px-2 py-1 text-xs rounded ${gatheredGrowthPage >= gatheredTotalPages - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>»</button>
                                                            <button onClick={() => setGatheredGrowthPage(gatheredTotalPages - 1)} disabled={gatheredGrowthPage >= gatheredTotalPages - 1} className={`px-2 py-1 text-xs rounded ${gatheredGrowthPage >= gatheredTotalPages - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>»»</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Alliance Helps Growth Table — Collapsible */}
                                {helpsGrowthData.length > 0 && (
                                    <button onClick={() => toggleSection('helps')} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl ${theme.card} border hover:border-[#4318ff]/30 transition-all`}>
                                        <span className="flex items-center gap-2 text-sm font-semibold">
                                            {expandedSections.has('helps') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            <Users className="w-4 h-4 text-[#a78bfa]" />
                                            Alliance Helps Growth
                                        </span>
                                        <span className={`text-xs ${theme.textMuted}`}>{helpsGrowthData.length} members</span>
                                    </button>
                                )}
                                {expandedSections.has('helps') && (() => {
                                    if (helpsGrowthData.length === 0) return null;

                                    const helpsAllianceNames = new Set(roster.filter(r => r.alliance === growthAllianceFilter).map(r => r.name));
                                    const sortedHelpsGrowth = [...helpsGrowthData]
                                        .filter(m => helpsAllianceNames.has(m.name))
                                        .filter(m => !tagFilter || roster.find(r => r.name === m.name)?.tags?.includes(tagFilter))
                                        .filter(m => matchesSearch(growthSearch, m.name, roster.find(r => r.name === m.name)?.governor_id))
                                        .sort((a, b) => {
                                            const { field, direction } = helpsGrowthSort;
                                            const multiplier = direction === 'asc' ? 1 : -1;
                                            if (field === 'name') return multiplier * a.name.localeCompare(b.name);
                                            return multiplier * ((a[field] ?? 0) - (b[field] ?? 0));
                                        });

                                    const helpsTotalPages = Math.ceil(sortedHelpsGrowth.length / helpsGrowthRowsPerPage);
                                    const displayHelpsMembers = sortedHelpsGrowth.slice(
                                        helpsGrowthPage * helpsGrowthRowsPerPage,
                                        (helpsGrowthPage + 1) * helpsGrowthRowsPerPage
                                    );
                                    const helpsCurrentDate = helpsGrowthData[0]?.currentDate ? formatDate(helpsGrowthData[0].currentDate) : 'Current';

                                    const handleHelpsSort = (field: typeof helpsGrowthSort.field) => {
                                        setHelpsGrowthSort(prev => ({
                                            field,
                                            direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
                                        }));
                                    };

                                    const HelpsSortIcon = ({ field }: { field: typeof helpsGrowthSort.field }) => {
                                        if (helpsGrowthSort.field !== field) return <span className="opacity-30">↕</span>;
                                        return helpsGrowthSort.direction === 'asc' ? <span>↑</span> : <span>↓</span>;
                                    };

                                    return (
                                        <div className={`${theme.card} border rounded-xl p-2 sm:p-4`}>
                                            <div className="flex items-center justify-between mb-2 sm:mb-4">
                                                <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                                                    <Users className="w-4 h-4 text-[#a78bfa]" />
                                                    <span className="hidden sm:inline">Alliance Helps Growth</span>
                                                    <span className="sm:hidden">Helps</span>
                                                    <span className={`text-xs font-normal ${theme.textMuted}`}>({sortedHelpsGrowth.length})</span>
                                                </h3>
                                            </div>
                                            <div className="overflow-x-auto mobile-scroll">
                                                <table className="w-full text-xs sm:text-sm min-w-[700px]" style={{ tableLayout: 'fixed' }}>
                                                    <colgroup>
                                                        <col style={{ width: '4%' }} />
                                                        <col style={{ width: '18%' }} />
                                                        <col style={{ width: '12%' }} />
                                                        <col style={{ width: '12%' }} />
                                                        <col style={{ width: '27%' }} />
                                                        <col style={{ width: '27%' }} />
                                                    </colgroup>
                                                    <thead className="sticky top-0 bg-[var(--background-card)]">
                                                        <tr className="border-b border-[var(--border)]">
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>#</th>
                                                            <th className={`text-left px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleHelpsSort('name')} className="flex items-center gap-1 hover:text-white">
                                                                    Name <HelpsSortIcon field="name" />
                                                                </button>
                                                            </th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>First</th>
                                                            <th className={`text-right px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>{helpsCurrentDate}</th>
                                                            <th className={`px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <button onClick={() => handleHelpsSort('allTimeGrowth')} className="flex items-center gap-1 hover:text-white ml-auto">
                                                                    All-Time <HelpsSortIcon field="allTimeGrowth" />
                                                                </button>
                                                            </th>
                                                            <th className={`px-2 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <button onClick={() => handleHelpsSort('compareGrowth')} className="flex items-center gap-1 hover:text-white">
                                                                        Growth <HelpsSortIcon field="compareGrowth" />
                                                                    </button>
                                                                    <div className="flex items-center gap-1 text-[10px] font-normal normal-case">
                                                                        <select
                                                                            value={growthCompareDate || ''}
                                                                            onChange={(e) => setGrowthCompareDate(e.target.value || null)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`${theme.card} border rounded px-1 py-0.5`}
                                                                        >
                                                                            <option value="">From...</option>
                                                                            {availableSnapshotDates.slice(1).map(date => (
                                                                                <option key={date} value={date}>{formatDate(date)}</option>
                                                                            ))}
                                                                        </select>
                                                                        <span>→</span>
                                                                        <select
                                                                            value={growthEndDate || ''}
                                                                            onChange={(e) => setGrowthEndDate(e.target.value || null)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`${theme.card} border rounded px-1 py-0.5`}
                                                                        >
                                                                            <option value="">Latest</option>
                                                                            {availableSnapshotDates.map(date => (
                                                                                <option key={date} value={date}>{formatDate(date)}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {displayHelpsMembers.map((member, idx) => {
                                                            const globalIdx = helpsGrowthPage * helpsGrowthRowsPerPage + idx;
                                                            const maxAllTime = Math.max(...sortedHelpsGrowth.map(m => Math.abs(m.allTimeGrowth)));
                                                            const maxCompare = Math.max(...sortedHelpsGrowth.filter(m => m.compareGrowth !== null).map(m => Math.abs(m.compareGrowth!)));
                                                            return (
                                                                <tr key={member.name} className={`border-b border-[var(--border)]/50 ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                                    <td className={`px-2 py-2 ${theme.textMuted}`}>{globalIdx + 1}</td>
                                                                    <td className="px-2 py-2 font-medium">{member.name}</td>
                                                                    <td className="px-2 py-2 text-right text-[#9f7aea]">
                                                                        {member.firstHelps.toLocaleString()}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#01b574]">
                                                                        {member.currentHelps.toLocaleString()}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        {(() => {
                                                                            const pct = maxAllTime > 0 ? (Math.abs(member.allTimeGrowth) / maxAllTime) * 100 : 0;
                                                                            const isPositive = member.allTimeGrowth >= 0;
                                                                            return (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#a78bfa] to-[#a78bfa]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="text-right min-w-[80px]">
                                                                                        <span className={`font-medium ${isPositive ? 'text-[#a78bfa]' : 'text-gray-400'}`}>
                                                                                            {member.allTimeGrowth >= 0 ? '+' : ''}{member.allTimeGrowth.toLocaleString()}
                                                                                        </span>
                                                                                        <span className={`text-[10px] ${theme.textMuted} ml-1`}>
                                                                                            ({member.allTimeGrowthPercent.toFixed(1)}%)
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </td>
                                                                    <td className="px-2 py-2">
                                                                        {member.compareGrowth !== null ? (() => {
                                                                            const pct = maxCompare > 0 ? (Math.abs(member.compareGrowth!) / maxCompare) * 100 : 0;
                                                                            const isPositive = member.compareGrowth! >= 0;
                                                                            return (
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                                                                        <div
                                                                                            className={`h-full rounded ${isPositive ? 'bg-gradient-to-r from-[#01b574] to-[#01b574]/50' : 'bg-gradient-to-r from-gray-500 to-gray-400'}`}
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="text-right min-w-[80px]">
                                                                                        <span className={`font-medium ${isPositive ? 'text-[#01b574]' : 'text-gray-400'}`}>
                                                                                            {member.compareGrowth! >= 0 ? '+' : ''}{member.compareGrowth!.toLocaleString()}
                                                                                        </span>
                                                                                        {member.compareGrowthPercent !== null && (
                                                                                            <span className={`text-[10px] ${theme.textMuted} ml-1`}>
                                                                                                ({member.compareGrowthPercent.toFixed(1)}%)
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })() : <span className={theme.textMuted}>—</span>}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {helpsTotalPages > 1 && (
                                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                                                    <div className={`text-xs ${theme.textMuted}`}>
                                                        Showing {helpsGrowthPage * helpsGrowthRowsPerPage + 1}-{Math.min((helpsGrowthPage + 1) * helpsGrowthRowsPerPage, sortedHelpsGrowth.length)} of {sortedHelpsGrowth.length}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={helpsGrowthRowsPerPage}
                                                            onChange={(e) => { setHelpsGrowthRowsPerPage(Number(e.target.value)); setHelpsGrowthPage(0); }}
                                                            className={`text-xs ${theme.card} border rounded px-2 py-1`}
                                                        >
                                                            <option value={10}>10</option>
                                                            <option value={25}>25</option>
                                                            <option value={50}>50</option>
                                                            <option value={100}>100</option>
                                                        </select>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => setHelpsGrowthPage(0)} disabled={helpsGrowthPage === 0} className={`px-2 py-1 text-xs rounded ${helpsGrowthPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>««</button>
                                                            <button onClick={() => setHelpsGrowthPage(p => Math.max(0, p - 1))} disabled={helpsGrowthPage === 0} className={`px-2 py-1 text-xs rounded ${helpsGrowthPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>«</button>
                                                            <span className={`px-2 py-1 text-xs ${theme.textMuted}`}>{helpsGrowthPage + 1} / {helpsTotalPages}</span>
                                                            <button onClick={() => setHelpsGrowthPage(p => Math.min(helpsTotalPages - 1, p + 1))} disabled={helpsGrowthPage >= helpsTotalPages - 1} className={`px-2 py-1 text-xs rounded ${helpsGrowthPage >= helpsTotalPages - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>»</button>
                                                            <button onClick={() => setHelpsGrowthPage(helpsTotalPages - 1)} disabled={helpsGrowthPage >= helpsTotalPages - 1} className={`px-2 py-1 text-xs rounded ${helpsGrowthPage >= helpsTotalPages - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--background-secondary)]'}`}>»»</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Alliance Mobilization Event Growth — Collapsible */}
                                <button onClick={() => toggleSection('mob')} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl ${theme.card} border hover:border-[#4318ff]/30 transition-all`}>
                                    <span className="flex items-center gap-2 text-sm font-semibold">
                                        {expandedSections.has('mob') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        <BarChart3 className="w-4 h-4 text-[#9f7aea]" />
                                        Mobilization Growth
                                    </span>
                                </button>
                                {expandedSections.has('mob') && (() => {
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
                                                                    {isEditor && member.tags?.includes('angmar-og') && (
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
                        {/* Alliance Selector */}
                        <div className="flex items-center gap-1 bg-[var(--background-secondary)] rounded-lg p-0.5 w-fit">
                            {alliances.map(a => (
                                <button
                                    key={a}
                                    onClick={() => setGrowthAllianceFilter(a)}
                                    className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
                                        growthAllianceFilter === a
                                            ? 'bg-[#4318ff] text-white'
                                            : `${theme.textMuted} hover:text-[var(--foreground)]`
                                    }`}
                                >
                                    {a}
                                </button>
                            ))}
                        </div>
                        {(() => {
                            // Filter to selected alliance members, then apply tag filter for analytics
                            const analyticsRoster = roster.filter(m => m.alliance === growthAllianceFilter && (!tagFilter || (m.tags && m.tags.includes(tagFilter))));

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
                                                            {isEditor && member.tags?.includes('angmar-og') && (
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
                                                                        {isEditor && member.tags?.includes('angmar-og') && (
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

                        {/* Activity Monitor / AFK Detection */}
                        {afkData.length > 0 && (() => {
                            const STATUS_COLORS: Record<AfkScore, { bg: string; text: string; label: string }> = {
                                active: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Active' },
                                low: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Low' },
                                likely_afk: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Likely AFK' },
                                afk: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'AFK' },
                            };
                            const activeCount = afkData.filter(d => d.status === 'active').length;
                            const lowCount = afkData.filter(d => d.status === 'low').length;
                            const likelyAfkCount = afkData.filter(d => d.status === 'likely_afk').length;
                            const afkCount = afkData.filter(d => d.status === 'afk').length;

                            const filtered = afkFilter === 'all' ? afkData : afkData.filter(d => d.status === afkFilter);

                            const sorted = [...filtered].sort((a, b) => {
                                const dir = afkSort.direction === 'asc' ? 1 : -1;
                                if (afkSort.field === 'name') return dir * a.name.localeCompare(b.name);
                                if (afkSort.field === 'powerDelta') return dir * (a.powerDelta - b.powerDelta);
                                if (afkSort.field === 'daysSinceChange') return dir * (a.daysSinceChange - b.daysSinceChange);
                                if (afkSort.field === 'status') {
                                    const order: Record<AfkScore, number> = { active: 0, low: 1, likely_afk: 2, afk: 3 };
                                    return dir * (order[a.status] - order[b.status]);
                                }
                                return 0;
                            });

                            const pageSize = 15;
                            const totalPages = Math.ceil(sorted.length / pageSize);
                            const paged = sorted.slice(afkPage * pageSize, (afkPage + 1) * pageSize);

                            const handleAfkSort = (field: typeof afkSort.field) => {
                                setAfkSort(prev => ({
                                    field,
                                    direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
                                }));
                                setAfkPage(0);
                            };

                            const AfkSortIcon = ({ field }: { field: typeof afkSort.field }) => (
                                afkSort.field === field
                                    ? afkSort.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />
                                    : <ChevronDown className="w-3 h-3 inline opacity-30" />
                            );

                            return (
                                <div className={`${theme.card} border rounded-xl p-4`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-semibold flex items-center gap-2">
                                            <Eye className="w-4 h-4" />
                                            Activity Monitor
                                            <span className={`text-xs ${theme.textMuted} font-normal`}>({afkData.length} members)</span>
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs ${theme.textMuted}`}>Window:</span>
                                            {[2, 3, 5, 7].map(d => (
                                                <button
                                                    key={d}
                                                    onClick={() => { setAfkWindowDays(d); setAfkPage(0); }}
                                                    className={`px-2 py-0.5 text-xs rounded ${afkWindowDays === d ? 'bg-[#4318ff] text-white' : `${theme.textMuted} hover:text-[var(--foreground)]`}`}
                                                >
                                                    {d}d
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Summary cards */}
                                    <div className="grid grid-cols-4 gap-3 mb-4">
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-emerald-400">{activeCount}</div>
                                            <div className="text-xs text-emerald-400">Active</div>
                                        </div>
                                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-yellow-400">{lowCount}</div>
                                            <div className="text-xs text-yellow-400">Low</div>
                                        </div>
                                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-orange-400">{likelyAfkCount}</div>
                                            <div className="text-xs text-orange-400">Likely AFK</div>
                                        </div>
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                                            <div className="text-2xl font-bold text-red-400">{afkCount}</div>
                                            <div className="text-xs text-red-400">AFK</div>
                                        </div>
                                    </div>

                                    {/* Filter buttons */}
                                    <div className="flex gap-1 mb-4">
                                        {(['all', 'low', 'likely_afk', 'afk'] as const).map(f => (
                                            <button
                                                key={f}
                                                onClick={() => { setAfkFilter(f); setAfkPage(0); }}
                                                className={`px-3 py-1 text-xs rounded-full ${afkFilter === f ? 'bg-[#4318ff] text-white' : `bg-[var(--background-secondary)] ${theme.textMuted} hover:text-[var(--foreground)]`}`}
                                            >
                                                {f === 'all' ? 'All' : f === 'low' ? 'Low' : f === 'likely_afk' ? 'Likely AFK' : 'AFK'}
                                                {f !== 'all' && ` (${f === 'low' ? lowCount : f === 'likely_afk' ? likelyAfkCount : afkCount})`}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Table */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-[var(--border)]">
                                                    <th className={`text-left px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>#</th>
                                                    <th className={`text-left px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted} cursor-pointer`} onClick={() => handleAfkSort('name')}>
                                                        Name <AfkSortIcon field="name" />
                                                    </th>
                                                    <th className={`text-right px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>Power</th>
                                                    <th className={`text-right px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted} cursor-pointer`} onClick={() => handleAfkSort('powerDelta')}>
                                                        Power Δ <AfkSortIcon field="powerDelta" />
                                                    </th>
                                                    <th className={`text-right px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>Gathered Δ</th>
                                                    <th className={`text-right px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted}`}>Helps Δ</th>
                                                    <th className={`text-center px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted} cursor-pointer`} onClick={() => handleAfkSort('daysSinceChange')}>
                                                        Days <AfkSortIcon field="daysSinceChange" />
                                                    </th>
                                                    <th className={`text-center px-3 py-2 text-xs font-semibold uppercase ${theme.textMuted} cursor-pointer`} onClick={() => handleAfkSort('status')}>
                                                        Status <AfkSortIcon field="status" />
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paged.map((row, idx) => {
                                                    const sc = STATUS_COLORS[row.status];
                                                    const globalIdx = afkPage * pageSize + idx + 1;
                                                    return (
                                                        <tr key={row.name} className={`border-b border-[var(--border)] ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''}`}>
                                                            <td className={`px-3 py-2 text-xs ${theme.textMuted}`}>{globalIdx}</td>
                                                            <td className="px-3 py-2 font-medium text-sm">{row.name}</td>
                                                            <td className="px-3 py-2 text-right text-sm">{formatPower(row.currentPower)}</td>
                                                            <td className={`px-3 py-2 text-right text-sm font-medium ${row.powerDelta > 0 ? 'text-emerald-400' : row.powerDelta < 0 ? 'text-red-400' : theme.textMuted}`}>
                                                                {row.powerDelta > 0 ? '+' : ''}{formatPower(row.powerDelta)}
                                                                {row.powerDeltaPercent !== 0 && (
                                                                    <span className={`ml-1 text-xs ${theme.textMuted}`}>
                                                                        ({row.powerDeltaPercent > 0 ? '+' : ''}{row.powerDeltaPercent.toFixed(1)}%)
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className={`px-3 py-2 text-right text-sm ${!row.hasGatheredData ? theme.textMuted : row.gatheredDelta > 0 ? 'text-emerald-400' : theme.textMuted}`}>
                                                                {row.hasGatheredData ? (row.gatheredDelta > 0 ? `+${row.gatheredDelta.toLocaleString()}` : '0') : '--'}
                                                            </td>
                                                            <td className={`px-3 py-2 text-right text-sm ${!row.hasHelpsData ? theme.textMuted : row.helpsDelta > 0 ? 'text-emerald-400' : theme.textMuted}`}>
                                                                {row.hasHelpsData ? (row.helpsDelta > 0 ? `+${row.helpsDelta.toLocaleString()}` : '0') : '--'}
                                                            </td>
                                                            <td className={`px-3 py-2 text-center text-sm font-medium ${row.daysSinceChange >= 5 ? 'text-red-400' : row.daysSinceChange >= 2 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                                                {row.daysSinceChange}
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${sc.bg} ${sc.text}`}>
                                                                    {sc.label}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination */}
                                    {totalPages > 1 && (
                                        <div className="flex items-center justify-between mt-3">
                                            <span className={`text-xs ${theme.textMuted}`}>
                                                {sorted.length} members
                                            </span>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => setAfkPage(p => Math.max(0, p - 1))}
                                                    disabled={afkPage === 0}
                                                    className={`px-2 py-1 text-xs rounded ${afkPage === 0 ? 'opacity-30' : 'hover:bg-[var(--background-hover)]'}`}
                                                >
                                                    Prev
                                                </button>
                                                <span className={`px-2 py-1 text-xs ${theme.textMuted}`}>
                                                    {afkPage + 1} / {totalPages}
                                                </span>
                                                <button
                                                    onClick={() => setAfkPage(p => Math.min(totalPages - 1, p + 1))}
                                                    disabled={afkPage >= totalPages - 1}
                                                    className={`px-2 py-1 text-xs rounded ${afkPage >= totalPages - 1 ? 'opacity-30' : 'hover:bg-[var(--background-hover)]'}`}
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Comparison Tab (Admin Only) */}
                {activeTab === 'comparison' && isEditor && (() => {
                    // Build alliance-grouped data from roster
                    const angMembers = roster.filter(m => m.alliance === 'ANG');
                    const kkMembers = roster.filter(m => m.alliance === '23KK');

                    const angTotalPower = angMembers.reduce((s, m) => s + (m.power || 0), 0);
                    const kkTotalPower = kkMembers.reduce((s, m) => s + (m.power || 0), 0);
                    const angTotalKP = angMembers.reduce((s, m) => s + (m.kills || 0), 0);
                    const kkTotalKP = kkMembers.reduce((s, m) => s + (m.kills || 0), 0);
                    const angTotalHonor = angMembers.reduce((s, m) => s + (m.honor_points || 0), 0);
                    const kkTotalHonor = kkMembers.reduce((s, m) => s + (m.honor_points || 0), 0);

                    // Per-member averages (current roster data only)
                    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
                    const angAvgPower = avg(angMembers.map(m => m.power || 0));
                    const kkAvgPower = avg(kkMembers.map(m => m.power || 0));
                    const angAvgKP = avg(angMembers.map(m => m.kills || 0));
                    const kkAvgKP = avg(kkMembers.map(m => m.kills || 0));
                    const angAvgT4 = avg(angMembers.map(m => m.t4_kills || 0));
                    const kkAvgT4 = avg(kkMembers.map(m => m.t4_kills || 0));
                    const angAvgT5 = avg(angMembers.map(m => m.t5_kills || 0));
                    const kkAvgT5 = avg(kkMembers.map(m => m.t5_kills || 0));
                    const angAvgHonor = avg(angMembers.map(m => m.honor_points || 0));
                    const kkAvgHonor = avg(kkMembers.map(m => m.honor_points || 0));

                    const fmtB = (n: number) => {
                        if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
                        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
                        if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
                        return n.toLocaleString();
                    };

                    // Build name → alliance map from current roster
                    const allianceMap = new Map<string, string>();
                    for (const m of roster) {
                        if (m.alliance) allianceMap.set(m.name, m.alliance);
                    }

                    // Aggregate allSnapshots by date + alliance
                    const dateAllianceAgg = new Map<string, { angPower: number; kkPower: number; angKP: number; kkKP: number; angCount: number; kkCount: number }>();
                    for (const snap of allSnapshots) {
                        const alliance = allianceMap.get(snap.member_name);
                        if (!alliance || (alliance !== 'ANG' && alliance !== '23KK')) continue;
                        const key = snap.snapshot_date;
                        if (!dateAllianceAgg.has(key)) dateAllianceAgg.set(key, { angPower: 0, kkPower: 0, angKP: 0, kkKP: 0, angCount: 0, kkCount: 0 });
                        const agg = dateAllianceAgg.get(key)!;
                        if (alliance === 'ANG') {
                            agg.angPower += snap.power || 0;
                            agg.angKP += snap.kills || 0;
                            agg.angCount++;
                        } else {
                            agg.kkPower += snap.power || 0;
                            agg.kkKP += snap.kills || 0;
                            agg.kkCount++;
                        }
                    }

                    // Minimum coverage threshold: only show 23KK data when we have at least 50% of members
                    const kkMinCoverage = Math.floor(kkMembers.length * 0.5);
                    const angMinCoverage = Math.floor(angMembers.length * 0.5);

                    const compChartData = [...dateAllianceAgg.entries()]
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([date, agg]) => ({
                            date,
                            timestamp: new Date(date + 'T12:00:00').getTime(),
                            angAvgPow: agg.angCount >= angMinCoverage ? agg.angPower / agg.angCount : null,
                            kkAvgPow: agg.kkCount >= kkMinCoverage ? agg.kkPower / agg.kkCount : null,
                            angAvgKP: agg.angCount >= angMinCoverage ? agg.angKP / agg.angCount : null,
                            kkAvgKP: agg.kkCount >= kkMinCoverage ? agg.kkKP / agg.kkCount : null,
                            angCount: agg.angCount,
                            kkCount: agg.kkCount,
                        }));

                    const compTicks = compChartData.map(d => d.timestamp);

                    return (
                    <div className="space-y-6">
                        {/* Section Header */}
                        <div>
                            <h2 className="text-lg font-bold">ANG vs 23KK Alliance Comparison</h2>
                            <p className={`text-xs ${theme.textMuted} mt-1`}>
                                Current roster snapshot for both alliances. ANG has full data coverage; 23KK data is partial
                                (only available for dates where we collected their roster). Historical charts exclude dates with less than 50% member coverage
                                to avoid misleading averages from incomplete data.
                            </p>
                        </div>

                        {/* Summary Cards — current roster totals */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Members */}
                            <div className={`${theme.card} border rounded-xl p-5`}>
                                <div className={`text-xs ${theme.textMuted} mb-3 font-medium uppercase tracking-wider`}>Active Members</div>
                                <div className="flex items-center justify-between">
                                    <div className="text-center flex-1">
                                        <div className="text-2xl font-bold text-[#01b574]">{angMembers.length}</div>
                                        <div className={`text-xs ${theme.textMuted} mt-1`}>ANG</div>
                                    </div>
                                    <div className={`text-xs ${theme.textMuted} font-medium`}>vs</div>
                                    <div className="text-center flex-1">
                                        <div className="text-2xl font-bold text-[#f56565]">{kkMembers.length}</div>
                                        <div className={`text-xs ${theme.textMuted} mt-1`}>23KK</div>
                                    </div>
                                </div>
                                <div className={`text-[10px] ${theme.textMuted} mt-2 text-center`}>Current active roster count</div>
                            </div>
                            {/* Total Power */}
                            <div className={`${theme.card} border rounded-xl p-5`}>
                                <div className={`text-xs ${theme.textMuted} mb-3 font-medium uppercase tracking-wider`}>Total Power</div>
                                <div className="flex items-center justify-between">
                                    <div className="text-center flex-1">
                                        <div className="text-2xl font-bold text-[#01b574]">{fmtB(angTotalPower)}</div>
                                        <div className={`text-xs ${theme.textMuted} mt-1`}>ANG</div>
                                    </div>
                                    <div className={`text-xs ${theme.textMuted} font-medium`}>vs</div>
                                    <div className="text-center flex-1">
                                        <div className="text-2xl font-bold text-[#f56565]">{fmtB(kkTotalPower)}</div>
                                        <div className={`text-xs ${theme.textMuted} mt-1`}>23KK</div>
                                    </div>
                                </div>
                                <div className={`text-[10px] ${theme.textMuted} mt-2 text-center`}>Sum of all active members&apos; power</div>
                            </div>
                            {/* Total KP */}
                            <div className={`${theme.card} border rounded-xl p-5`}>
                                <div className={`text-xs ${theme.textMuted} mb-3 font-medium uppercase tracking-wider`}>Total Kill Points</div>
                                <div className="flex items-center justify-between">
                                    <div className="text-center flex-1">
                                        <div className="text-2xl font-bold text-[#01b574]">{fmtB(angTotalKP)}</div>
                                        <div className={`text-xs ${theme.textMuted} mt-1`}>ANG</div>
                                    </div>
                                    <div className={`text-xs ${theme.textMuted} font-medium`}>vs</div>
                                    <div className="text-center flex-1">
                                        <div className="text-2xl font-bold text-[#f56565]">{fmtB(kkTotalKP)}</div>
                                        <div className={`text-xs ${theme.textMuted} mt-1`}>23KK</div>
                                    </div>
                                </div>
                                <div className={`text-[10px] ${theme.textMuted} mt-2 text-center`}>Sum of all active members&apos; kills</div>
                            </div>
                        </div>

                        {/* Power Comparison Chart */}
                        <div className={`${theme.card} border rounded-xl p-5`}>
                            <div className={`text-sm font-semibold mb-1`}>Avg Power Per Member Over Time</div>
                            <div className={`text-xs ${theme.textMuted} mb-3`}>Total power divided by members with data on each date. Dates with &lt;50% member coverage are excluded to avoid skewed averages. Hover for member count details.</div>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={compChartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis
                                            dataKey="timestamp"
                                            type="number"
                                            scale="time"
                                            domain={[compTicks[0] || 'dataMin', compTicks[compTicks.length - 1] || 'dataMax']}
                                            ticks={compTicks}
                                            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                            axisLine={{ stroke: 'var(--border)' }}
                                            tickLine={{ stroke: 'var(--border)' }}
                                            tickFormatter={(ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; }}
                                        />
                                        <YAxis
                                            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                            axisLine={{ stroke: 'var(--border)' }}
                                            tickLine={{ stroke: 'var(--border)' }}
                                            tickFormatter={(v) => fmtB(v)}
                                            width={55}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'var(--background-card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }}
                                            formatter={(value, name, props) => {
                                                const v = typeof value === 'number' ? value : 0;
                                                const entry = props?.payload;
                                                const isAng = name === 'angAvgPow';
                                                const count = isAng ? entry?.angCount : entry?.kkCount;
                                                const total = isAng ? angMembers.length : kkMembers.length;
                                                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                                const label = isAng ? allianceDisplay('ANG') : allianceDisplay('23KK');
                                                return [`${fmtB(v)} (${count}/${total} members, ${pct}%)`, label];
                                            }}
                                            labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        />
                                        <Legend formatter={(value) => value === 'angAvgPow' ? allianceDisplay('ANG') : allianceDisplay('23KK')} />
                                        <Line type="monotone" dataKey="angAvgPow" name="angAvgPow" stroke="#01b574" strokeWidth={2} dot={{ fill: '#01b574', r: 3 }} connectNulls />
                                        <Line type="monotone" dataKey="kkAvgPow" name="kkAvgPow" stroke="#f56565" strokeWidth={2} dot={{ fill: '#f56565', r: 3 }} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* KP Comparison Chart */}
                        <div className={`${theme.card} border rounded-xl p-5`}>
                            <div className={`text-sm font-semibold mb-1`}>Avg Kill Points Per Member Over Time</div>
                            <div className={`text-xs ${theme.textMuted} mb-3`}>Total KP divided by members with data on each date. Dates with &lt;50% member coverage are excluded to avoid skewed averages. Hover for member count details.</div>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={compChartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis
                                            dataKey="timestamp"
                                            type="number"
                                            scale="time"
                                            domain={[compTicks[0] || 'dataMin', compTicks[compTicks.length - 1] || 'dataMax']}
                                            ticks={compTicks}
                                            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                            axisLine={{ stroke: 'var(--border)' }}
                                            tickLine={{ stroke: 'var(--border)' }}
                                            tickFormatter={(ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; }}
                                        />
                                        <YAxis
                                            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                            axisLine={{ stroke: 'var(--border)' }}
                                            tickLine={{ stroke: 'var(--border)' }}
                                            tickFormatter={(v) => fmtB(v)}
                                            width={55}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'var(--background-card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }}
                                            formatter={(value, name, props) => {
                                                const v = typeof value === 'number' ? value : 0;
                                                const entry = props?.payload;
                                                const isAng = name === 'angAvgKP';
                                                const count = isAng ? entry?.angCount : entry?.kkCount;
                                                const total = isAng ? angMembers.length : kkMembers.length;
                                                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                                const label = isAng ? allianceDisplay('ANG') : allianceDisplay('23KK');
                                                return [`${fmtB(v)} (${count}/${total} members, ${pct}%)`, label];
                                            }}
                                            labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        />
                                        <Legend formatter={(value) => value === 'angAvgKP' ? allianceDisplay('ANG') : allianceDisplay('23KK')} />
                                        <Line type="monotone" dataKey="angAvgKP" name="angAvgKP" stroke="#01b574" strokeWidth={2} dot={{ fill: '#01b574', r: 3 }} connectNulls />
                                        <Line type="monotone" dataKey="kkAvgKP" name="kkAvgKP" stroke="#f56565" strokeWidth={2} dot={{ fill: '#f56565', r: 3 }} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Per-Member Averages Table */}
                        <div className={`${theme.card} border rounded-xl p-5`}>
                            <div className={`text-sm font-semibold mb-1`}>Per-Member Averages (Current Roster)</div>
                            <div className={`text-xs ${theme.textMuted} mb-4`}>Average stats per active member based on latest roster data. Useful for comparing typical member strength between alliances.</div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className={`border-b ${theme.border}`}>
                                            <th className={`px-2 sm:px-4 py-2 text-left ${theme.textMuted} text-xs font-medium`}>Alliance</th>
                                            <th className={`px-2 sm:px-4 py-2 text-right ${theme.textMuted} text-xs font-medium`}>Avg Power</th>
                                            <th className={`px-2 sm:px-4 py-2 text-right ${theme.textMuted} text-xs font-medium`}>Avg KP</th>
                                            <th className={`px-2 sm:px-4 py-2 text-right ${theme.textMuted} text-xs font-medium`}>Avg T4</th>
                                            <th className={`px-2 sm:px-4 py-2 text-right ${theme.textMuted} text-xs font-medium`}>Avg T5</th>
                                            <th className={`px-2 sm:px-4 py-2 text-right ${theme.textMuted} text-xs font-medium`}>Avg Honor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className={`border-b ${theme.border}`}>
                                            <td className="px-2 sm:px-4 py-3 font-semibold text-[#01b574]">ANG</td>
                                            <td className="px-2 sm:px-4 py-3 text-right">{fmtB(angAvgPower)}</td>
                                            <td className="px-2 sm:px-4 py-3 text-right">{fmtB(angAvgKP)}</td>
                                            <td className="px-2 sm:px-4 py-3 text-right">{fmtB(angAvgT4)}</td>
                                            <td className="px-2 sm:px-4 py-3 text-right">{fmtB(angAvgT5)}</td>
                                            <td className="px-2 sm:px-4 py-3 text-right">{angAvgHonor > 0 ? fmtB(angAvgHonor) : '-'}</td>
                                        </tr>
                                        <tr>
                                            <td className="px-2 sm:px-4 py-3 font-semibold text-[#f56565]">23KK</td>
                                            <td className="px-2 sm:px-4 py-3 text-right">{fmtB(kkAvgPower)}</td>
                                            <td className="px-2 sm:px-4 py-3 text-right">{fmtB(kkAvgKP)}</td>
                                            <td className="px-2 sm:px-4 py-3 text-right">{fmtB(kkAvgT4)}</td>
                                            <td className="px-2 sm:px-4 py-3 text-right">{fmtB(kkAvgT5)}</td>
                                            <td className="px-2 sm:px-4 py-3 text-right">{kkAvgHonor > 0 ? fmtB(kkAvgHonor) : '-'}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    );
                })()}

                <footer className={`mt-8 pt-4 border-t ${theme.border} text-center`}>
                    <p className={`text-xs ${theme.textMuted}`}>Angmar Nazgul Guards - Rise of Kingdoms</p>
                    <p className={`text-[10px] ${theme.textMuted} mt-1 opacity-50`}>
                        Use CSV import to update roster data
                    </p>
                </footer>
            </div>

        </div>
        </AppSidebar>
    );
}
