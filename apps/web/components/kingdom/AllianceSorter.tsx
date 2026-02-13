'use client';

import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { useLatestScan, saveAssignments } from '@/lib/supabase/use-kingdom-scan';
import { assignAlliances } from '@/lib/kingdom/assign';
import { DEFAULT_ALLIANCE_CONFIGS, SORTER_ALLIANCE_COLORS, formatNumber, toSorterTag } from '@/lib/kingdom/config';
import type { AllianceConfig, PlayerAssignment, AssignmentStatus, ScanPlayer } from '@/lib/kingdom/types';

const EDITOR_PASSWORD = 'carn-dum';

const STATUS_STYLES: Record<AssignmentStatus, { bg: string; text: string; icon: React.ReactNode }> = {
  STAY: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', icon: <Check size={12} /> },
  MOVE: { bg: 'bg-sky-500/10', text: 'text-sky-500', icon: <ArrowRight size={12} /> },
  INCOMING: { bg: 'bg-violet-500/10', text: 'text-violet-500', icon: <ArrowRight size={12} /> },
  ILLEGAL: { bg: 'bg-red-500/10', text: 'text-red-500', icon: <ShieldX size={12} /> },
  UNASSIGNED: { bg: 'bg-gray-500/10', text: 'text-gray-400', icon: <HelpCircle size={12} /> },
};

type SortField = 'name' | 'power' | 'kill_points' | 'current' | 'assigned' | 'status';
type SortDir = 'asc' | 'desc';

export default function AllianceSorter() {
  const { scan, players, loading, refetch } = useLatestScan();

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
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // View
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AssignmentStatus | 'ALL'>('ALL');
  const [allianceFilter, setAllianceFilter] = useState('ALL');
  const [sortField, setSortField] = useState<SortField>('power');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Assignment index
  const assignmentMap = useMemo(() => {
    const map = new Map<number, PlayerAssignment>();
    for (const a of assignments) map.set(a.governorId, a);
    return map;
  }, [assignments]);

  // Use saved assignments from Supabase if available and sorter hasn't been run
  const effectiveAssignments = useMemo(() => {
    if (hasRun) return assignmentMap;
    const map = new Map<number, PlayerAssignment>();
    for (const p of players) {
      if (p.assignment_status) {
        map.set(p.governor_id, {
          governorId: p.governor_id,
          assignedAlliance: p.assigned_alliance || '',
          status: p.assignment_status,
          reason: p.assignment_reason || '',
        });
      }
    }
    return map;
  }, [players, hasRun, assignmentMap]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<AssignmentStatus, number> = { STAY: 0, MOVE: 0, INCOMING: 0, ILLEGAL: 0, UNASSIGNED: 0 };
    for (const a of effectiveAssignments.values()) {
      counts[a.status]++;
    }
    return counts;
  }, [effectiveAssignments]);

  // Alliance fill rates
  const allianceFill = useMemo(() => {
    const fill: Record<string, { count: number; cap: number }> = {};
    for (const cfg of configs) {
      fill[cfg.tag] = { count: 0, cap: cfg.cap };
    }
    for (const a of effectiveAssignments.values()) {
      if (a.assignedAlliance && fill[a.assignedAlliance]) {
        fill[a.assignedAlliance].count++;
      }
    }
    return fill;
  }, [effectiveAssignments, configs]);

  // Merge players with assignments for table display
  const tableData = useMemo(() => {
    let result = players.map(p => ({
      player: p,
      assignment: effectiveAssignments.get(p.governor_id),
    }));

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.player.name.toLowerCase().includes(q) ||
        r.player.governor_id.toString().includes(q)
      );
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
  }, [players, effectiveAssignments, search, statusFilter, allianceFilter, sortField, sortDir]);

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
    const result = assignAlliances(players, configs);
    setAssignments(result);
    setHasRun(true);
    setSaveStatus(null);
  };

  const handleSave = async () => {
    if (!scan || assignments.length === 0) return;
    setIsSaving(true);
    setSaveStatus(null);
    const ok = await saveAssignments(scan.id, assignments);
    setSaveStatus(ok ? 'Saved!' : 'Failed to save');
    if (ok) await refetch();
    setIsSaving(false);
  };

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
      } else if (field === 'tag') {
        cfg.tag = value;
      }
      next[index] = cfg;
      return next;
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
          <div className="mb-8 p-5 rounded-xl bg-[var(--background-card)] border border-amber-500/30">
            <h2 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
              <ArrowUpDown size={18} className="text-amber-500" />
              Alliance Thresholds
            </h2>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Alliance</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Rank</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Cap</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Min Power (M)</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Min KP (M)</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map((cfg, i) => (
                    <tr key={cfg.tag} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: SORTER_ALLIANCE_COLORS[cfg.tag] || '#666' }}
                          />
                          <span className="font-medium text-[var(--foreground)]">{cfg.tag}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={cfg.rank}
                          onChange={(e) => updateConfig(i, 'rank', e.target.value)}
                          className="w-16 px-2 py-1 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={cfg.cap}
                          onChange={(e) => updateConfig(i, 'cap', e.target.value)}
                          className="w-16 px-2 py-1 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={(cfg.minPower / 1_000_000).toFixed(0)}
                          onChange={(e) => updateConfig(i, 'minPower', e.target.value)}
                          className="w-20 px-2 py-1 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={cfg.minKp !== null ? (cfg.minKp / 1_000_000).toFixed(1) : ''}
                          onChange={(e) => updateConfig(i, 'minKp', e.target.value)}
                          placeholder="—"
                          className="w-20 px-2 py-1 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRunSorter}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                <Play size={16} />
                Run Sorter
              </button>
              {hasRun && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Assignments
                </button>
              )}
              {saveStatus && (
                <span className={`text-sm ${saveStatus === 'Saved!' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {saveStatus}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Alliance Fill Rates */}
        {effectiveAssignments.size > 0 && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {configs.map(cfg => {
              const fill = allianceFill[cfg.tag] || { count: 0, cap: cfg.cap };
              const pct = cfg.cap > 0 ? Math.min((fill.count / cfg.cap) * 100, 100) : 0;
              const color = SORTER_ALLIANCE_COLORS[cfg.tag] || '#666';
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
                </div>
              );
            })}
          </div>
        )}

        {/* Status Summary */}
        {effectiveAssignments.size > 0 && (
          <div className="flex flex-wrap gap-3 mb-6">
            {(Object.entries(statusCounts) as [AssignmentStatus, number][]).map(([status, count]) => {
              if (count === 0) return null;
              const style = STATUS_STYLES[status];
              return (
                <div key={status} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                  {style.icon}
                  {status}: {count}
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        {players.length > 0 && (
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
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AssignmentStatus | 'ALL')}
              className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="STAY">Stay</option>
              <option value="MOVE">Move</option>
              <option value="INCOMING">Incoming</option>
              <option value="ILLEGAL">Illegal</option>
              <option value="UNASSIGNED">Unassigned</option>
            </select>
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

        {/* Count + mobile sort */}
        {players.length > 0 && (
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-[var(--text-muted)]">
              Showing {tableData.length} of {players.length} players
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
        )}

        {/* Assignment Table (desktop) / Cards (mobile) */}
        {players.length > 0 ? (
          <>
            {/* Mobile card view */}
            <div className="md:hidden space-y-2">
              {tableData.map(({ player, assignment }) => (
                <AssignmentCard key={player.governor_id} player={player} assignment={assignment} />
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
                      <AssignmentRow key={player.governor_id} player={player} assignment={assignment} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-[var(--text-muted)]">
            <ArrowUpDown size={40} className="mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">No scan data available</p>
            <p className="text-sm mt-1">Upload scan data in the Migration Tracker first.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AssignmentCard({ player, assignment }: { player: ScanPlayer; assignment?: PlayerAssignment }) {
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
          <div className="font-medium text-sm text-[var(--foreground)] truncate">{player.name}</div>
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
          {assignedTag ? (
            <span className="inline-flex items-center gap-1 font-medium text-[var(--foreground)]">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: assignedColor }} />
              {assignedTag}
            </span>
          ) : <span className="text-[var(--text-muted)]">-</span>}
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

function AssignmentRow({ player, assignment }: { player: ScanPlayer; assignment?: PlayerAssignment }) {
  const status = assignment?.status;
  const style = status ? STATUS_STYLES[status] : null;
  const assignedTag = assignment?.assignedAlliance || '';
  const assignedColor = SORTER_ALLIANCE_COLORS[assignedTag] || undefined;

  return (
    <tr className={`border-b border-[var(--border)] hover:bg-[var(--background-secondary)]/50 transition-colors ${
      status === 'ILLEGAL' ? 'bg-red-500/[0.03]' : ''
    }`}>
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
        {assignedTag ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--foreground)]">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: assignedColor }} />
            {assignedTag}
          </span>
        ) : '-'}
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
