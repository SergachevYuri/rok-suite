'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Lock,
  Unlock,
  Play,
  Save,
  Download,
  Loader2,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Search,
  Users,
  ArrowRight,
  Check,
  Minus,
  AlertTriangle,
  ShieldX,
  HelpCircle,
  Shield,
  Plus,
  X,
  LayoutGrid,
  List,
  GripVertical,
  RotateCcw,
  CheckCircle2,
  History,
  Trash2,
  BookmarkPlus,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLatestScan, saveAssignments, saveSingleAssignment, refreshMigrantsOnScan } from '@/lib/supabase/use-kingdom-scan';
import { fetchMigrantSheet, fetchInactivesSheet } from '@/lib/kingdom/parse';
import { useR4R5Members } from '@/lib/supabase/use-alliance-roster';
import { assignAlliances, suggestThresholds } from '@/lib/kingdom/assign';
import { DEFAULT_ALLIANCE_CONFIGS, SORTER_ALLIANCE_COLORS, MIGRANT_SHEET_URL, INACTIVES_SHEET_URL, formatNumber, toSorterTag } from '@/lib/kingdom/config';
import { matchesSearch } from '@/lib/search';
import type { AllianceConfig, PlayerAssignment, AssignmentStatus, ScanPlayer } from '@/lib/kingdom/types';
import { useSorterVersions, saveSorterVersion, loadSorterVersion, deleteSorterVersion } from '@/lib/supabase/use-sorter-versions';
import { useNameHistory } from '@/lib/supabase/use-name-history';
import { NameHistoryBadge } from './NameHistoryBadge';
import SorterBoardView from './SorterBoardView';

import { ADMIN_PASSWORD as EDITOR_PASSWORD } from '@/lib/auth-passwords';

/** Migration statuses that should be separated into the flagged section */
const FLAGGED_MIGRATION_STATUSES = new Set(['ILLEGAL', 'PENDING', 'INACTIVE']);

const STATUS_STYLES: Record<AssignmentStatus, { bg: string; text: string; icon: React.ReactNode }> = {
  STAY: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', icon: <Check size={12} /> },
  MOVE: { bg: 'bg-sky-500/10', text: 'text-sky-500', icon: <ArrowRight size={12} /> },
  INCOMING: { bg: 'bg-violet-500/10', text: 'text-violet-500', icon: <ArrowRight size={12} /> },
  ILLEGAL: { bg: 'bg-red-500/10', text: 'text-red-500', icon: <ShieldX size={12} /> },
  UNASSIGNED: { bg: 'bg-gray-500/10', text: 'text-gray-400', icon: <HelpCircle size={12} /> },
};

type SortField = 'name' | 'power' | 'kill_points' | 'current' | 'assigned' | 'status';
type SortDir = 'asc' | 'desc';

type ViewMode = 'table' | 'board';

export default function AllianceSorter() {
  const { scan, players, loading, refetch } = useLatestScan();
  const { members: r4r5Members } = useR4R5Members();
  const { versions, refetch: refetchVersions } = useSorterVersions(scan?.id ?? null);

  // Name history
  const nameHistoryGovIds = useMemo(() => players.map(p => p.governor_id), [players]);
  const nameHistoryCurrentNames = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of players) m.set(p.governor_id, p.name);
    return m;
  }, [players]);
  const { nameHistory } = useNameHistory(nameHistoryGovIds, nameHistoryCurrentNames);

  // Admin
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');

  // Configs
  const [configs, setConfigs] = useState<AllianceConfig[]>(DEFAULT_ALLIANCE_CONFIGS.map(c => ({ ...c })));
  const [assignments, setAssignments] = useState<PlayerAssignment[]>([]);
  const [hasRun, setHasRun] = useState(false);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<'saving' | 'saved' | 'error' | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Exempt R4/R5
  const [exemptIds, setExemptIds] = useState<Set<number>>(new Set());
  const [showExemptSection, setShowExemptSection] = useState(false);
  const [manualExemptInput, setManualExemptInput] = useState('');

  // Flagged section
  const [showFlagged, setShowFlagged] = useState(false);

  // Versions
  const [showVersions, setShowVersions] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);

  // View
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AssignmentStatus | 'ALL'>('ALL');
  const [allianceFilter, setAllianceFilter] = useState('ALL');
  const [sortField, setSortField] = useState<SortField>('power');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Auto-populate exempt list from R4/R5 roster data
  useEffect(() => {
    if (r4r5Members.length > 0 && players.length > 0) {
      const scanGovIds = new Set(players.map(p => p.governor_id));
      const autoExempt = new Set<number>();
      for (const m of r4r5Members) {
        if (scanGovIds.has(m.governorId)) {
          autoExempt.add(m.governorId);
        }
      }
      setExemptIds(autoExempt);
    }
  }, [r4r5Members, players]);

  // Auto-refresh migration statuses from Google Sheets when scan loads
  const hasRefreshedRef = useRef(false);
  useEffect(() => {
    if (!scan || players.length === 0 || hasRefreshedRef.current) return;
    hasRefreshedRef.current = true;
    (async () => {
      try {
        const [migrants, inactives] = await Promise.all([
          fetchMigrantSheet(MIGRANT_SHEET_URL),
          fetchInactivesSheet(INACTIVES_SHEET_URL),
        ]);
        const result = await refreshMigrantsOnScan(scan.id, migrants, inactives);
        if (result.statusChanges > 0) {
          await refetch(); // Reload players with updated migration statuses
        }
      } catch {
        // Silently continue — stale statuses are better than a broken page
      }
    })();
  }, [scan, players.length, refetch]);

  // Cleanup save indicator timer on unmount
  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  const showSaveIndicator = useCallback((status: 'saved' | 'error') => {
    setSaveIndicator(status);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveIndicator(null), 3000);
  }, []);

  const autoSaveSingle = useCallback(async (assignment: PlayerAssignment) => {
    if (!scan) return;
    setSaveIndicator('saving');
    const ok = await saveSingleAssignment(scan.id, assignment);
    showSaveIndicator(ok ? 'saved' : 'error');
  }, [scan, showSaveIndicator]);

  const autoSaveAll = useCallback(async (allAssignments: PlayerAssignment[]) => {
    if (!scan || allAssignments.length === 0) return;
    setSaveIndicator('saving');
    setIsSaving(true);
    const ok = await saveAssignments(scan.id, allAssignments);
    showSaveIndicator(ok ? 'saved' : 'error');
    setIsSaving(false);
    if (ok) await refetch();
  }, [scan, refetch, showSaveIndicator]);

  // Assignment index
  const assignmentMap = useMemo(() => {
    const map = new Map<number, PlayerAssignment>();
    for (const a of assignments) map.set(a.governorId, a);
    return map;
  }, [assignments]);

  // Use saved assignments from Supabase if available and sorter hasn't been run.
  // ALL players must appear — those without assignments default based on migration status.
  const effectiveAssignments = useMemo(() => {
    if (hasRun) return assignmentMap;
    const map = new Map<number, PlayerAssignment>();
    for (const p of players) {
      if (p.assignment_status) {
        // Flagged players with stale assignments should be forced to unassigned
        const isFlagged = FLAGGED_MIGRATION_STATUSES.has(p.migration_status);
        const isManualOverride = p.assignment_reason === 'Manual override';
        if (isFlagged && p.assigned_alliance && !isManualOverride) {
          map.set(p.governor_id, {
            governorId: p.governor_id,
            assignedAlliance: '',
            status: 'ILLEGAL',
            reason: `Flagged — ${p.migration_status.toLowerCase()} in migration tracker`,
          });
        } else {
          map.set(p.governor_id, {
            governorId: p.governor_id,
            assignedAlliance: p.assigned_alliance || '',
            status: p.assignment_status,
            reason: p.assignment_reason || '',
          });
        }
      } else {
        // No assignment yet — create default entry so player is visible
        const isFlagged = FLAGGED_MIGRATION_STATUSES.has(p.migration_status);
        const isAccepted = p.migration_status === 'ACCEPTED';
        const currentTag = isAccepted ? toSorterTag(p.current_alliance) : '';
        map.set(p.governor_id, {
          governorId: p.governor_id,
          assignedAlliance: isFlagged ? '' : (isAccepted ? currentTag : ''),
          status: isFlagged ? 'ILLEGAL' : (isAccepted ? 'INCOMING' : 'UNASSIGNED'),
          reason: isFlagged
            ? `Flagged — ${p.migration_status.toLowerCase()} in migration tracker`
            : isAccepted
              ? `Accepted migrant — assigned to ${currentTag}`
              : 'Not yet sorted',
        });
      }
    }
    return map;
  }, [players, hasRun, assignmentMap]);

  // Check if a player is flagged (ILLEGAL/PENDING/INACTIVE migration status without a manual alliance override)
  const isFlaggedPlayer = useCallback((p: ScanPlayer, assignment?: PlayerAssignment) => {
    if (!FLAGGED_MIGRATION_STATUSES.has(p.migration_status)) return false;
    // If manually assigned to an alliance, they graduate to the main sort
    if (assignment?.assignedAlliance && assignment.reason === 'Manual override') return false;
    return true;
  }, []);

  // Status counts (excluding flagged players)
  const statusCounts = useMemo(() => {
    const counts: Record<AssignmentStatus, number> = { STAY: 0, MOVE: 0, INCOMING: 0, ILLEGAL: 0, UNASSIGNED: 0 };
    for (const a of effectiveAssignments.values()) {
      const player = players.find(p => p.governor_id === a.governorId);
      if (player && isFlaggedPlayer(player, a)) continue;
      counts[a.status]++;
    }
    return counts;
  }, [effectiveAssignments, players, isFlaggedPlayer]);

  // Alliance fill rates
  const allianceFill = useMemo(() => {
    const fill: Record<string, { count: number; cap: number; totalPower: number; totalKp: number }> = {};
    for (const cfg of configs) {
      fill[cfg.tag] = { count: 0, cap: cfg.cap, totalPower: 0, totalKp: 0 };
    }
    for (const a of effectiveAssignments.values()) {
      if (a.assignedAlliance && fill[a.assignedAlliance]) {
        fill[a.assignedAlliance].count++;
        const player = players.find(p => p.governor_id === a.governorId);
        if (player) {
          fill[a.assignedAlliance].totalPower += player.power;
          fill[a.assignedAlliance].totalKp += player.kill_points;
        }
      }
    }
    return fill;
  }, [effectiveAssignments, configs, players]);

  // Separate flagged players from the main sort
  const flaggedData = useMemo(() => {
    return players
      .filter(p => isFlaggedPlayer(p, effectiveAssignments.get(p.governor_id)))
      .map(p => ({ player: p, assignment: effectiveAssignments.get(p.governor_id) }))
      .sort((a, b) => b.player.power - a.player.power);
  }, [players, effectiveAssignments, isFlaggedPlayer]);

  // Merge players with assignments for table display (excluding flagged)
  const tableData = useMemo(() => {
    let result = players
      .filter(p => !isFlaggedPlayer(p, effectiveAssignments.get(p.governor_id)))
      .map(p => ({
        player: p,
        assignment: effectiveAssignments.get(p.governor_id),
      }));

    if (search.trim()) {
      result = result.filter(r => matchesSearch(search, r.player.name, r.player.governor_id));
    }

    if (statusFilter !== 'ALL') {
      result = result.filter(r => r.assignment?.status === statusFilter);
    }

    if (allianceFilter !== 'ALL') {
      result = result.filter(r => r.assignment?.assignedAlliance === allianceFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.player.name.localeCompare(b.player.name); break;
        case 'power': cmp = a.player.power - b.player.power; break;
        case 'kill_points': cmp = a.player.kill_points - b.player.kill_points; break;
        case 'current': cmp = (a.player.current_alliance || '').localeCompare(b.player.current_alliance || ''); break;
        case 'assigned': cmp = (a.assignment?.assignedAlliance || '').localeCompare(b.assignment?.assignedAlliance || ''); break;
        case 'status': cmp = (a.assignment?.status || '').localeCompare(b.assignment?.status || ''); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [players, effectiveAssignments, isFlaggedPlayer, search, statusFilter, allianceFilter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handlePasswordSubmit = () => {
    if (password === EDITOR_PASSWORD) {
      setIsAdmin(true);
      setShowPasswordPrompt(false);
      setPassword('');
    }
  };

  const handleRunSorter = () => {
    const result = assignAlliances(players, configs, exemptIds.size > 0 ? exemptIds : undefined);
    setAssignments(result);
    setHasRun(true);
    autoSaveAll(result);
  };

  const handleSuggest = () => {
    const exempt = exemptIds.size > 0 ? exemptIds : undefined;
    const suggested = suggestThresholds(players, configs, exempt);
    setConfigs(suggested);
    // Auto-run with the new configs
    const result = assignAlliances(players, suggested, exempt);
    setAssignments(result);
    setHasRun(true);
    autoSaveAll(result);
  };

  const handleSave = async () => {
    if (!scan) return;
    const toSave = assignments.length > 0
      ? assignments
      : [...effectiveAssignments.values()];
    if (toSave.length === 0) return;
    setIsSaving(true);
    setSaveIndicator('saving');
    const ok = await saveAssignments(scan.id, toSave);
    showSaveIndicator(ok ? 'saved' : 'error');
    if (ok) await refetch();
    setIsSaving(false);
  };

  const handleReassign = (governorId: number, newAlliance: string) => {
    const player = players.find(p => p.governor_id === governorId);
    if (!player) return;

    const currentTag = toSorterTag(player.current_alliance);
    const newStatus: AssignmentStatus = !newAlliance
      ? 'UNASSIGNED'
      : newAlliance === currentTag
        ? 'STAY'
        : 'MOVE';

    const newAssignment: PlayerAssignment = {
      governorId,
      assignedAlliance: newAlliance,
      status: newStatus,
      reason: 'Manual override',
    };

    setAssignments(prev => {
      const existing = prev.findIndex(a => a.governorId === governorId);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = newAssignment;
        return next;
      }
      return [...prev, newAssignment];
    });
    setHasRun(true);
    autoSaveSingle(newAssignment);
  };

  const allianceTags = configs.map(c => c.tag);

  const handleExportCSV = () => {
    const headers = ['Governor ID', 'Name', 'Power', 'Kill Points', 'Current Alliance', 'Assigned Alliance', 'Status', 'Reason'];
    const rows = tableData.map(({ player, assignment }) => [
      player.governor_id,
      `"${player.name}"`,
      player.power,
      player.kill_points,
      toSorterTag(player.current_alliance),
      assignment?.assignedAlliance || '',
      assignment?.status || '',
      `"${assignment?.reason || ''}"`,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alliance-sorter-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveVersion = async () => {
    if (!scan || !versionName.trim()) return;
    const toSave = assignments.length > 0 ? assignments : [...effectiveAssignments.values()];
    if (toSave.length === 0) return;

    if (versions.some(v => v.name === versionName.trim())) {
      if (!window.confirm(`A version named "${versionName.trim()}" already exists. Overwrite it?`)) return;
    }

    setIsSavingVersion(true);
    const id = await saveSorterVersion(scan.id, versionName.trim(), configs, toSave, [...exemptIds]);
    if (id) {
      setVersionName('');
      await refetchVersions();
    }
    setIsSavingVersion(false);
  };

  const handleRestoreVersion = async (versionId: number, name: string) => {
    if (!window.confirm(`Restore version "${name}"? This will replace all current assignments and configs.`)) return;
    setIsLoadingVersion(true);
    const version = await loadSorterVersion(versionId);
    if (version) {
      setConfigs(version.configs);
      setExemptIds(new Set(version.exempt_ids));
      setAssignments(version.assignments);
      setHasRun(true);
      await autoSaveAll(version.assignments);
    }
    setIsLoadingVersion(false);
  };

  const handleDeleteVersion = async (versionId: number, name: string) => {
    if (!window.confirm(`Delete version "${name}"? This cannot be undone.`)) return;
    await deleteSorterVersion(versionId);
    await refetchVersions();
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const updateConfig = (index: number, field: keyof AllianceConfig, value: string) => {
    setConfigs(prev => {
      const next = [...prev];
      const cfg = { ...next[index] };
      if (field === 'cap' || field === 'rank') {
        (cfg as Record<string, number | string | null>)[field] = parseInt(value) || 0;
      } else if (field === 'minPower') {
        cfg.minPower = parseFloat(value) * 1_000_000;
      } else if (field === 'minKp') {
        cfg.minKp = value ? parseFloat(value) * 1_000_000 : null;
      } else if (field === 'maxPowerKpRatio') {
        cfg.maxPowerKpRatio = value ? parseFloat(value) : null;
      } else if (field === 'tag') {
        cfg.tag = value;
      }
      next[index] = cfg;
      return next;
    });
  };

  const toggleThreshold = (index: number, field: 'minKp' | 'maxPowerKpRatio') => {
    setConfigs(prev => {
      const next = [...prev];
      const cfg = { ...next[index] };
      if (field === 'minKp') {
        cfg.minKp = cfg.minKp === null ? 5_000_000 : null;
      } else {
        cfg.maxPowerKpRatio = cfg.maxPowerKpRatio === null ? 2 : null;
      }
      next[index] = cfg;
      return next;
    });
  };

  const setThresholdMode = (index: number, mode: 'all' | 'any') => {
    setConfigs(prev => {
      const next = [...prev];
      const cfg = { ...next[index] };
      cfg.thresholdMode = mode;
      next[index] = cfg;
      return next;
    });
  };

  const configSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleConfigDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setConfigs(prev => {
      const oldIndex = prev.findIndex(c => c.tag === active.id);
      const newIndex = prev.findIndex(c => c.tag === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next.map((cfg, i) => ({ ...cfg, rank: i + 1 }));
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--foreground)]">Alliance Sorter</h1>
            {scan && (
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Using scan: {scan.label} &middot; {players.length} players
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[var(--background-secondary)] text-[var(--text-secondary)] hover:text-[var(--foreground)] border border-[var(--border)] transition-colors"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            {!isAdmin ? (
              <button
                onClick={() => setShowPasswordPrompt(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[var(--background-secondary)] text-[var(--text-secondary)] hover:text-[var(--foreground)] border border-[var(--border)] transition-colors"
              >
                <Lock size={16} />
                <span className="hidden sm:inline">Admin</span>
              </button>
            ) : (
              <button
                onClick={() => setIsAdmin(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-amber-500/10 text-amber-500 border border-amber-500/30 transition-colors"
              >
                <Unlock size={16} />
                <span className="hidden sm:inline">Admin Mode</span>
              </button>
            )}
          </div>
        </div>

        {/* Password prompt */}
        {showPasswordPrompt && (
          <div className="mb-6 p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
            <div className="flex items-center gap-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                placeholder="Enter admin password..."
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-amber-500/50"
                autoFocus
              />
              <button
                onClick={handlePasswordSubmit}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                Unlock
              </button>
              <button
                onClick={() => { setShowPasswordPrompt(false); setPassword(''); }}
                className="px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Admin: Config Editor */}
        {isAdmin && players.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
              <ArrowUpDown size={18} className="text-amber-500" />
              Alliance Thresholds
            </h2>

            <DndContext sensors={configSensors} collisionDetection={closestCenter} onDragEnd={handleConfigDragEnd}>
              <SortableContext items={configs.map(c => c.tag)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
                  {configs.map((cfg, i) => (
                    <SortableConfigCard
                      key={cfg.tag}
                      cfg={cfg}
                      index={i}
                      updateConfig={updateConfig}
                      toggleThreshold={toggleThreshold}
                      setThresholdMode={setThresholdMode}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Exempt R4/R5 Section */}
            <div className="mb-4">
              <button
                onClick={() => setShowExemptSection(!showExemptSection)}
                className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                <Shield size={16} className="text-amber-500" />
                Exempt Players (R4/R5)
                <span className="text-xs text-[var(--text-muted)]">({exemptIds.size})</span>
                {showExemptSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showExemptSection && (
                <div className="mt-3 p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Exempt players stay in their current alliance regardless of thresholds. R4/R5 from roster are auto-added.
                  </p>

                  {/* Auto-populated R4/R5 list */}
                  {r4r5Members.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {r4r5Members
                        .filter(m => players.some(p => p.governor_id === m.governorId))
                        .map(m => {
                          const isExempt = exemptIds.has(m.governorId);
                          return (
                            <button
                              key={m.governorId}
                              onClick={() => {
                                setExemptIds(prev => {
                                  const next = new Set(prev);
                                  if (isExempt) next.delete(m.governorId);
                                  else next.add(m.governorId);
                                  return next;
                                });
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                                isExempt
                                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                                  : 'bg-[var(--background-card)] text-[var(--text-muted)] border border-[var(--border)] line-through'
                              }`}
                              title={`${m.name} (${m.role}) — ${m.alliance}`}
                            >
                              <Shield size={10} />
                              {m.name}
                              <span className="opacity-60">{m.role}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}

                  {/* Manual add */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={manualExemptInput}
                      onChange={(e) => setManualExemptInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const id = parseInt(manualExemptInput);
                          if (id && players.some(p => p.governor_id === id)) {
                            setExemptIds(prev => new Set(prev).add(id));
                            setManualExemptInput('');
                          }
                        }
                      }}
                      placeholder="Add Governor ID..."
                      className="flex-1 px-2 py-1 rounded bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-xs focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      onClick={() => {
                        const id = parseInt(manualExemptInput);
                        if (id && players.some(p => p.governor_id === id)) {
                          setExemptIds(prev => new Set(prev).add(id));
                          setManualExemptInput('');
                        }
                      }}
                      className="px-2 py-1 rounded bg-amber-500/10 text-amber-500 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSuggest}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-amber-500 text-amber-500 hover:bg-amber-500/10 transition-colors"
              >
                <ArrowUpDown size={16} />
                Suggest Thresholds
              </button>
              <button
                onClick={handleRunSorter}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                <Play size={16} />
                Run Sorter
              </button>
              {effectiveAssignments.size > 0 && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Assignments
                </button>
              )}
              {saveIndicator === 'saving' && (
                <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
                  <Loader2 size={14} className="animate-spin" />
                  Saving...
                </span>
              )}
              {saveIndicator === 'saved' && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-500">
                  <CheckCircle2 size={14} />
                  Saved
                </span>
              )}
              {saveIndicator === 'error' && (
                <span className="flex items-center gap-1.5 text-sm text-red-500">
                  <AlertTriangle size={14} />
                  Failed to save
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              All changes auto-save immediately — drag-and-drop moves, manual reassignments, and sorter runs are saved to the database as they happen. Use the Save button to force a full re-save.
            </p>

            {/* Saved Versions */}
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <button
                onClick={() => setShowVersions(!showVersions)}
                className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                <History size={16} />
                Saved Versions
                {versions.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--background-secondary)] text-[var(--text-muted)]">
                    {versions.length}
                  </span>
                )}
                {showVersions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showVersions && (
                <div className="mt-3 space-y-3">
                  {/* Save current state */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={versionName}
                      onChange={e => setVersionName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveVersion()}
                      placeholder="Version name..."
                      className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--text-muted)]"
                    />
                    <button
                      onClick={handleSaveVersion}
                      disabled={isSavingVersion || !versionName.trim() || effectiveAssignments.size === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                    >
                      {isSavingVersion ? <Loader2 size={14} className="animate-spin" /> : <BookmarkPlus size={14} />}
                      Save
                    </button>
                  </div>

                  {/* Version list */}
                  {isLoadingVersion && (
                    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                      <Loader2 size={14} className="animate-spin" />
                      Restoring version...
                    </div>
                  )}

                  {versions.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">No saved versions yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {versions.map(v => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--foreground)] truncate">{v.name}</span>
                              <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{formatTimeAgo(v.created_at)}</span>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] mt-0.5">
                              {v.player_count} players &middot; {v.stay_count} stay &middot; {v.move_count} move &middot; {v.unassigned_count} unassigned
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleRestoreVersion(v.id, v.name)}
                              disabled={isLoadingVersion}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-amber-500 text-amber-500 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
                            >
                              <RotateCcw size={12} />
                              Restore
                            </button>
                            <button
                              onClick={() => handleDeleteVersion(v.id, v.name)}
                              className="p-1 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Alliance Fill Rates */}
        {effectiveAssignments.size > 0 && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {configs.map(cfg => {
              const fill = allianceFill[cfg.tag] || { count: 0, cap: cfg.cap, totalPower: 0, totalKp: 0 };
              const pct = cfg.cap > 0 ? Math.min((fill.count / cfg.cap) * 100, 100) : 0;
              const color = SORTER_ALLIANCE_COLORS[cfg.tag] || '#666';
              const avgPower = fill.count > 0 ? Math.round(fill.totalPower / fill.count) : 0;
              const avgKp = fill.count > 0 ? Math.round(fill.totalKp / fill.count) : 0;
              return (
                <div key={cfg.tag} className="p-3 rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium text-[var(--foreground)]">{cfg.tag}</span>
                  </div>
                  <div className="text-lg font-semibold text-[var(--foreground)]">
                    {fill.count}<span className="text-xs text-[var(--text-muted)] font-normal">/{cfg.cap}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--background-secondary)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  {fill.count > 0 && (
                    <div className="mt-2 space-y-0.5 text-xs text-[var(--text-muted)]">
                      <div className="flex justify-between">
                        <span>Power</span>
                        <span className="font-medium text-[var(--foreground)]">{formatNumber(fill.totalPower)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Pwr</span>
                        <span className="font-medium text-[var(--foreground)]">{formatNumber(avgPower)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>KP</span>
                        <span className="font-medium text-[var(--foreground)]">{formatNumber(fill.totalKp)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg KP</span>
                        <span className="font-medium text-[var(--foreground)]">{formatNumber(avgKp)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Status Summary — clickable filters */}
        {effectiveAssignments.size > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {(Object.entries(statusCounts) as [AssignmentStatus, number][]).map(([status, count]) => {
              if (count === 0) return null;
              const style = STATUS_STYLES[status];
              const isActive = statusFilter === status;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(isActive ? 'ALL' : status)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? `${style.bg} ${style.text} ring-2 ring-offset-1 ring-offset-[var(--background)] ring-current`
                      : statusFilter === 'ALL'
                        ? `${style.bg} ${style.text}`
                        : `${style.bg} ${style.text} opacity-40`
                  }`}
                >
                  {style.icon}
                  {status}: {count}
                </button>
              );
            })}
            {statusFilter !== 'ALL' && (
              <button
                onClick={() => setStatusFilter('ALL')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                <RotateCcw size={12} />
                View All
              </button>
            )}
          </div>
        )}

        {/* View toggle + Filters */}
        {players.length > 0 && effectiveAssignments.size > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-amber-500 text-white'
                    : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <List size={14} />
                Table
              </button>
              <button
                onClick={() => setViewMode('board')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'board'
                    ? 'bg-amber-500 text-white'
                    : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <LayoutGrid size={14} />
                Board
              </button>
            </div>
          </div>
        )}

        {/* Filters (table view only) */}
        {players.length > 0 && viewMode === 'table' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or governor ID..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <select
              value={allianceFilter}
              onChange={(e) => setAllianceFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none"
            >
              <option value="ALL">All Alliances</option>
              {configs.map(cfg => (
                <option key={cfg.tag} value={cfg.tag}>{cfg.tag}</option>
              ))}
            </select>
          </div>
        )}

        {/* Board View */}
        {players.length > 0 && viewMode === 'board' && effectiveAssignments.size > 0 && (
          <SorterBoardView
            players={players.filter(p => !isFlaggedPlayer(p, effectiveAssignments.get(p.governor_id)))}
            assignments={[...effectiveAssignments.values()].filter(a => {
              const player = players.find(p => p.governor_id === a.governorId);
              return !player || !isFlaggedPlayer(player, a);
            })}
            configs={configs}
            statusFilter={statusFilter}
            nameHistory={nameHistory}
            onAssignmentsChange={(updated) => {
              // Find the changed assignment by diffing
              const changed = updated.find(a => {
                const prev = effectiveAssignments.get(a.governorId);
                return !prev || prev.assignedAlliance !== a.assignedAlliance || prev.status !== a.status;
              });
              setAssignments(updated);
              setHasRun(true);
              if (changed) autoSaveSingle(changed);
            }}
          />
        )}

        {/* Table View */}
        {players.length > 0 && viewMode === 'table' ? (
          <>
            {/* Count + mobile sort */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-[var(--text-muted)]">
                Showing {tableData.length} of {players.length - flaggedData.length} players
              </div>
              <div className="flex items-center gap-2 md:hidden">
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="px-2 py-1 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-xs focus:outline-none"
                >
                  <option value="power">Power</option>
                  <option value="kill_points">KP</option>
                  <option value="name">Name</option>
                  <option value="current">Current</option>
                  <option value="assigned">Assigned</option>
                  <option value="status">Status</option>
                </select>
                <button
                  onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-1 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-muted)]"
                >
                  {sortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-2">
              {tableData.map(({ player, assignment }) => (
                <AssignmentCard key={player.governor_id} player={player} assignment={assignment} allianceTags={allianceTags} onReassign={handleReassign} previousNames={nameHistory.get(player.governor_id) || []} />
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--background-secondary)] border-b border-[var(--border)]">
                      <SortableHeader field="name" label="Name" current={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader field="power" label="Power" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                      <SortableHeader field="kill_points" label="KP" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                      <SortableHeader field="current" label="Current" current={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader field="assigned" label="Assigned" current={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader field="status" label="Status" current={sortField} dir={sortDir} onSort={handleSort} />
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map(({ player, assignment }) => (
                      <AssignmentRow key={player.governor_id} player={player} assignment={assignment} allianceTags={allianceTags} onReassign={handleReassign} previousNames={nameHistory.get(player.governor_id) || []} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : players.length === 0 ? (
          <div className="text-center py-20 text-[var(--text-muted)]">
            <ArrowUpDown size={40} className="mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">No scan data available</p>
            <p className="text-sm mt-1">Upload scan data in the Migration Tracker first.</p>
          </div>
        ) : null}

        {/* Flagged Players Section */}
        {flaggedData.length > 0 && (
          <div className="mt-8 border border-red-500/20 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowFlagged(!showFlagged)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-red-500/[0.05] hover:bg-red-500/[0.08] transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400" />
                <span className="text-sm font-medium text-red-400">
                  Flagged — Needs Action
                </span>
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-red-500/10 text-red-400 font-medium">
                  {flaggedData.length}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>Migrate out or zero</span>
                {showFlagged ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {showFlagged && (
              <div className="p-4">
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  These players are flagged as illegal, pending, or inactive from the migration tracker. Assign them to an alliance manually to include them in the sort.
                </p>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {flaggedData.map(({ player, assignment }) => (
                    <AssignmentCard key={player.governor_id} player={player} assignment={assignment} allianceTags={allianceTags} onReassign={handleReassign} previousNames={nameHistory.get(player.governor_id) || []} />
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block rounded-xl border border-[var(--border)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--background-secondary)] border-b border-[var(--border)]">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Name</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-[var(--text-muted)] uppercase">Power</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-[var(--text-muted)] uppercase">KP</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Current</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Migration</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Assign To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flaggedData.map(({ player, assignment }) => (
                        <tr key={player.governor_id} className="border-b border-[var(--border)] bg-red-500/[0.02]">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-[var(--foreground)]">{player.name}</div>
                            <div className="text-xs text-[var(--text-muted)]">#{player.governor_id}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-[var(--foreground)]">
                            {formatNumber(player.power)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-[var(--foreground)]">
                            {player.kill_points > 0 ? formatNumber(player.kill_points) : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                            {toSorterTag(player.current_alliance) || '-'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              player.migration_status === 'ILLEGAL'
                                ? 'bg-red-500/10 text-red-500'
                                : player.migration_status === 'PENDING'
                                  ? 'bg-amber-500/10 text-amber-500'
                                  : 'bg-gray-500/10 text-gray-400'
                            }`}>
                              {player.migration_status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={assignment?.assignedAlliance || ''}
                              onChange={(e) => handleReassign(player.governor_id, e.target.value)}
                              className="px-1.5 py-0.5 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-sm font-medium text-[var(--foreground)] focus:outline-none focus:border-amber-500/50 cursor-pointer"
                            >
                              <option value="">—</option>
                              {allianceTags.map(tag => (
                                <option key={tag} value={tag}>{tag}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AssignmentCard({ player, assignment, allianceTags, onReassign, previousNames }: {
  player: ScanPlayer;
  assignment?: PlayerAssignment;
  allianceTags: string[];
  onReassign: (governorId: number, newAlliance: string) => void;
  previousNames?: string[];
}) {
  const status = assignment?.status;
  const style = status ? STATUS_STYLES[status] : null;
  const assignedTag = assignment?.assignedAlliance || '';
  const assignedColor = SORTER_ALLIANCE_COLORS[assignedTag] || undefined;

  return (
    <div className={`p-3 rounded-xl bg-[var(--background-card)] border border-[var(--border)] ${
      status === 'ILLEGAL' ? 'border-red-500/20 bg-red-500/[0.03]' : ''
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-medium text-sm text-[var(--foreground)] truncate flex items-center gap-1">
            {player.name}
            <NameHistoryBadge previousNames={previousNames || []} />
          </div>
          <div className="text-xs text-[var(--text-muted)]">#{player.governor_id}</div>
        </div>
        {style && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${style.bg} ${style.text}`}>
            {style.icon}
            {status}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[var(--text-muted)]">Power</div>
          <div className="font-mono text-[var(--foreground)]">{formatNumber(player.power)}</div>
        </div>
        <div>
          <div className="text-[var(--text-muted)]">KP</div>
          <div className="font-mono text-[var(--foreground)]">{player.kill_points > 0 ? formatNumber(player.kill_points) : '-'}</div>
        </div>
        <div>
          <div className="text-[var(--text-muted)]">Current</div>
          <div className="text-[var(--text-secondary)]">{toSorterTag(player.current_alliance) || '-'}</div>
        </div>
        <div>
          <div className="text-[var(--text-muted)]">Assigned</div>
          <div className="flex items-center gap-1">
            {assignedColor && <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: assignedColor }} />}
            <select
              value={assignedTag}
              onChange={(e) => onReassign(player.governor_id, e.target.value)}
              className="px-1 py-0.5 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-medium text-[var(--foreground)] focus:outline-none cursor-pointer"
            >
              <option value="">—</option>
              {allianceTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {assignment?.reason && (
        <div className="mt-2 text-xs text-[var(--text-muted)] truncate">{assignment.reason}</div>
      )}
    </div>
  );
}

function SortableHeader({ field, label, current, dir, onSort, align }: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  align?: 'right';
}) {
  const active = current === field;
  return (
    <th
      className={`px-3 py-2.5 text-xs font-medium text-[var(--text-muted)] uppercase cursor-pointer select-none hover:text-[var(--foreground)] transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {active ? (
          dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </div>
    </th>
  );
}

function AssignmentRow({ player, assignment, allianceTags, onReassign, previousNames }: {
  player: ScanPlayer;
  assignment?: PlayerAssignment;
  allianceTags: string[];
  onReassign: (governorId: number, newAlliance: string) => void;
  previousNames?: string[];
}) {
  const status = assignment?.status;
  const style = status ? STATUS_STYLES[status] : null;
  const assignedTag = assignment?.assignedAlliance || '';
  const assignedColor = SORTER_ALLIANCE_COLORS[assignedTag] || undefined;

  return (
    <tr className={`border-b border-[var(--border)] hover:bg-[var(--background-secondary)]/50 transition-colors ${
      status === 'ILLEGAL' ? 'bg-red-500/[0.03]' : ''
    }`}>
      <td className="px-3 py-2.5">
        <div className="font-medium text-[var(--foreground)] flex items-center gap-1">
          {player.name}
          <NameHistoryBadge previousNames={previousNames || []} />
        </div>
        <div className="text-xs text-[var(--text-muted)]">#{player.governor_id}</div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-[var(--foreground)]">
        {formatNumber(player.power)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-[var(--foreground)]">
        {player.kill_points > 0 ? formatNumber(player.kill_points) : '-'}
      </td>
      <td className="px-3 py-2.5 text-[var(--text-secondary)]">
        {toSorterTag(player.current_alliance) || '-'}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {assignedColor && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: assignedColor }} />}
          <select
            value={assignedTag}
            onChange={(e) => onReassign(player.governor_id, e.target.value)}
            className="px-1.5 py-0.5 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-sm font-medium text-[var(--foreground)] focus:outline-none focus:border-amber-500/50 cursor-pointer"
          >
            <option value="">—</option>
            {allianceTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      </td>
      <td className="px-3 py-2.5">
        {style ? (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
            {style.icon}
            {status}
          </span>
        ) : '-'}
      </td>
      <td className="px-3 py-2.5 text-xs text-[var(--text-muted)] max-w-[200px] truncate">
        {assignment?.reason || '-'}
      </td>
    </tr>
  );
}

function SortableConfigCard({
  cfg,
  index,
  updateConfig,
  toggleThreshold,
  setThresholdMode,
}: {
  cfg: AllianceConfig;
  index: number;
  updateConfig: (index: number, field: keyof AllianceConfig, value: string) => void;
  toggleThreshold: (index: number, field: 'minKp' | 'maxPowerKpRatio') => void;
  setThresholdMode: (index: number, mode: 'all' | 'any') => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cfg.tag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const color = SORTER_ALLIANCE_COLORS[cfg.tag] || '#666';
  const hasSecondary = cfg.minKp !== null || cfg.maxPowerKpRatio !== null;

  const inputClass = "w-16 px-1.5 py-0.5 rounded text-sm text-center font-mono font-semibold bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:border-amber-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div ref={setNodeRef} style={style} className="p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors touch-none"
            title="Drag to reorder"
          >
            <GripVertical size={16} />
          </button>
          <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="font-bold text-base text-[var(--foreground)]">{cfg.tag}</span>
          <span className="text-sm text-[var(--text-muted)] bg-[var(--background-secondary)] px-1.5 py-0.5 rounded">#{cfg.rank}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-[var(--text-muted)]">Cap</span>
          <input
            type="number"
            value={cfg.cap}
            onChange={(e) => updateConfig(index, 'cap', e.target.value)}
            className="w-14 px-1.5 py-0.5 rounded text-sm text-center font-mono bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:border-amber-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>

      {/* Mode toggle */}
      {hasSecondary && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex rounded-md overflow-hidden border border-[var(--border)]">
            <button
              onClick={() => setThresholdMode(index, 'all')}
              className={`px-3 py-1 text-sm font-semibold transition-colors ${
                cfg.thresholdMode === 'all'
                  ? 'bg-amber-500 text-white'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              ALL
            </button>
            <button
              onClick={() => setThresholdMode(index, 'any')}
              className={`px-3 py-1 text-sm font-semibold transition-colors ${
                cfg.thresholdMode === 'any'
                  ? 'bg-sky-500 text-white'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              ANY
            </button>
          </div>
          <span className="text-sm text-[var(--text-muted)]">
            {cfg.thresholdMode === 'all' ? 'all criteria required' : 'any criteria qualifies'}
          </span>
        </div>
      )}

      {/* Threshold sliders */}
      <div className="space-y-3">
        {/* Min Power (always on) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Min Power</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={parseFloat((cfg.minPower / 1_000_000).toFixed(1))}
                onChange={(e) => updateConfig(index, 'minPower', e.target.value)}
                min={0} max={60} step={0.1}
                className={inputClass}
              />
              <span className="text-sm font-semibold text-[var(--text-muted)]">M</span>
            </div>
          </div>
          <input
            type="range"
            min={0} max={60} step={0.1}
            value={cfg.minPower / 1_000_000}
            onChange={(e) => updateConfig(index, 'minPower', e.target.value)}
            className="w-full h-2 rounded-full cursor-pointer"
            style={{ accentColor: color }}
          />
        </div>

        {/* Min KP (toggleable) */}
        <div className={cfg.minKp === null ? 'opacity-40' : ''}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleThreshold(index, 'minKp')}
                className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  cfg.minKp !== null
                    ? 'bg-amber-500 border-amber-500'
                    : 'bg-transparent border-[var(--text-muted)] hover:border-[var(--foreground)]'
                }`}
              >
                {cfg.minKp !== null && <Check size={14} className="text-white" strokeWidth={3} />}
              </button>
              <span className="text-sm font-medium text-[var(--text-secondary)]">Min KP</span>
            </div>
            {cfg.minKp !== null ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={parseFloat((cfg.minKp / 1_000_000).toFixed(1))}
                  onChange={(e) => updateConfig(index, 'minKp', e.target.value)}
                  min={0} max={30} step={0.5}
                  className={inputClass}
                />
                <span className="text-sm font-semibold text-[var(--text-muted)]">M</span>
              </div>
            ) : (
              <span className="text-sm font-mono font-semibold text-[var(--text-muted)]">—</span>
            )}
          </div>
          <input
            type="range"
            min={0} max={30} step={0.5}
            value={cfg.minKp !== null ? cfg.minKp / 1_000_000 : 0}
            onChange={(e) => updateConfig(index, 'minKp', e.target.value)}
            disabled={cfg.minKp === null}
            className="w-full h-2 rounded-full cursor-pointer disabled:cursor-default"
            style={{ accentColor: cfg.minKp !== null ? color : undefined }}
          />
        </div>

        {/* Max P:KP Ratio (toggleable) */}
        <div className={cfg.maxPowerKpRatio === null ? 'opacity-40' : ''}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleThreshold(index, 'maxPowerKpRatio')}
                className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  cfg.maxPowerKpRatio !== null
                    ? 'bg-amber-500 border-amber-500'
                    : 'bg-transparent border-[var(--text-muted)] hover:border-[var(--foreground)]'
                }`}
              >
                {cfg.maxPowerKpRatio !== null && <Check size={14} className="text-white" strokeWidth={3} />}
              </button>
              <span className="text-sm font-medium text-[var(--text-secondary)]">Max P:KP</span>
            </div>
            {cfg.maxPowerKpRatio !== null ? (
              <input
                type="number"
                value={parseFloat(cfg.maxPowerKpRatio.toFixed(1))}
                onChange={(e) => updateConfig(index, 'maxPowerKpRatio', e.target.value)}
                min={0.5} max={3} step={0.1}
                className={inputClass}
              />
            ) : (
              <span className="text-sm font-mono font-semibold text-[var(--text-muted)]">—</span>
            )}
          </div>
          <input
            type="range"
            min={0.5} max={3} step={0.1}
            value={cfg.maxPowerKpRatio ?? 2}
            onChange={(e) => updateConfig(index, 'maxPowerKpRatio', e.target.value)}
            disabled={cfg.maxPowerKpRatio === null}
            className="w-full h-2 rounded-full cursor-pointer disabled:cursor-default"
            style={{ accentColor: cfg.maxPowerKpRatio !== null ? color : undefined }}
          />
        </div>
      </div>
    </div>
  );
}
