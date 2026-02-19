'use client';

import { useState, useMemo } from 'react';
import { Check, X, Clock, ArrowUpDown, Users, CheckCircle, AlertCircle, XCircle, Scale, ChevronDown } from 'lucide-react';
import {
  updateApplicationStatus,
  convertApprovedToSelections,
  type MgeEvent,
  type MgeApplication,
  type MgeApplicationStatus,
} from '@/lib/supabase/use-mge';
import {
  formatSkillLevels,
  skillLevelTotal,
  commanderInvestmentScore,
  applicationStatusColor,
  tierSortValue,
} from '@/lib/mge/helpers';
import { allianceDisplay } from '@/lib/alliances';

interface MgeReviewTabProps {
  event: MgeEvent;
  onUpdate: () => void;
}

type SortField = 'score' | 'power' | 'tier' | 'date' | 'name';
type FilterStatus = 'all' | MgeApplicationStatus;

function formatPower(power: number): string {
  if (power >= 1_000_000) return `${(power / 1_000_000).toFixed(1)}M`;
  if (power >= 1_000) return `${(power / 1_000).toFixed(0)}K`;
  return power.toString();
}

function InvestmentBar({ score, max = 178 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{score}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { bg, text } = applicationStatusColor(status);
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${bg} ${text} capitalize`}>
      {status}
    </span>
  );
}

function ComparisonPanel({
  apps,
  onClose,
  onDecide,
}: {
  apps: MgeApplication[];
  onClose: () => void;
  onDecide: (appId: number, status: MgeApplicationStatus, tier?: string) => void;
}) {
  return (
    <div className="p-4 mb-4 rounded-lg border" style={{ backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale size={16} className="text-amber-400" />
          <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            Comparing {apps.length} Applicants
          </span>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--background-card)]" style={{ color: 'var(--text-muted)' }}>
          <X size={16} />
        </button>
      </div>
      <div className={`grid gap-3 ${apps.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {apps.map(app => {
          const score = app.commander_level && app.skill_levels && app.commander_stars
            ? commanderInvestmentScore(app.commander_level, app.skill_levels, app.commander_stars)
            : 0;
          return (
            <div key={app.id} className="p-3 rounded-lg border" style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
              <div className="font-medium text-sm mb-2" style={{ color: 'var(--foreground)' }}>{app.applicant_name}</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Alliance</span>
                  <span style={{ color: 'var(--foreground)' }}>{app.applicant_alliance ? allianceDisplay(app.applicant_alliance) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Power</span>
                  <span style={{ color: 'var(--foreground)' }}>{app.applicant_power ? formatPower(app.applicant_power) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Level</span>
                  <span style={{ color: 'var(--foreground)' }}>{app.commander_level || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Skills</span>
                  <span className={app.skill_levels?.every(s => s === 5) ? 'text-yellow-500 font-medium' : ''}
                    style={!app.skill_levels?.every(s => s === 5) ? { color: 'var(--foreground)' } : undefined}>
                    {app.skill_levels ? formatSkillLevels(app.skill_levels) : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Stars</span>
                  <span className="text-yellow-500">{app.commander_stars ? '★'.repeat(app.commander_stars) : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--text-muted)' }}>Score</span>
                  <InvestmentBar score={score} />
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Preferred</span>
                  <span style={{ color: 'var(--foreground)' }}>{app.preferred_tier || 'Any'}</span>
                </div>
              </div>
              {app.status === 'pending' && (
                <div className="flex gap-1.5 mt-3">
                  <button
                    onClick={() => onDecide(app.id, 'approved', app.preferred_tier || undefined)}
                    className="flex-1 px-2 py-1.5 text-xs rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-fast"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onDecide(app.id, 'declined')}
                    className="flex-1 px-2 py-1.5 text-xs rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-fast"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MgeReviewTab({ event, onUpdate }: MgeReviewTabProps) {
  const [sortBy, setSortBy] = useState<SortField>('score');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showComparison, setShowComparison] = useState(false);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [assignTier, setAssignTier] = useState('');
  const [officerNote, setOfficerNote] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  const apps = event.mge_applications || [];
  const tiers = event.mge_rank_tiers || [];

  // Summary counts
  const counts = useMemo(() => {
    const c = { total: apps.length, pending: 0, approved: 0, waitlisted: 0, declined: 0, withdrawn: 0 };
    for (const app of apps) {
      if (app.status in c) c[app.status as keyof typeof c]++;
    }
    return c;
  }, [apps]);

  // Filtered and sorted
  const sortedApps = useMemo(() => {
    let filtered = filterStatus === 'all' ? apps : apps.filter(a => a.status === filterStatus);

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'score': {
          const sa = a.commander_level && a.skill_levels && a.commander_stars
            ? commanderInvestmentScore(a.commander_level, a.skill_levels, a.commander_stars) : 0;
          const sb = b.commander_level && b.skill_levels && b.commander_stars
            ? commanderInvestmentScore(b.commander_level, b.skill_levels, b.commander_stars) : 0;
          return sb - sa;
        }
        case 'power':
          return (b.applicant_power || 0) - (a.applicant_power || 0);
        case 'tier':
          return tierSortValue(a.preferred_tier || '999') - tierSortValue(b.preferred_tier || '999');
        case 'date':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name':
          return a.applicant_name.localeCompare(b.applicant_name);
        default:
          return 0;
      }
    });
  }, [apps, filterStatus, sortBy]);

  const selectedApps = apps.filter(a => selectedIds.has(a.id));

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else if (next.size < 3) next.add(id);
    setSelectedIds(next);
  };

  const handleDecide = async (appId: number, status: MgeApplicationStatus, tier?: string) => {
    const ok = await updateApplicationStatus(appId, status, officerNote || null, tier || null);
    if (ok) {
      setDecidingId(null);
      setAssignTier('');
      setOfficerNote('');
      onUpdate();
    }
  };

  const handleFinalize = async () => {
    if (!confirm('Convert all approved applications to selections and finalize this event?')) return;
    setFinalizing(true);
    const ok = await convertApprovedToSelections(event.id);
    if (ok) onUpdate();
    setFinalizing(false);
  };

  const inputClass = 'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50';
  const inputStyle = { backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)', color: 'var(--foreground)' };

  if (apps.length === 0) {
    return (
      <div className="p-6 text-center">
        <Users size={32} className="mx-auto mb-3 text-zinc-500" />
        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No Applications Yet</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Applications will appear here once players submit them.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {[
          { label: 'Total', count: counts.total, color: 'text-zinc-300' },
          { label: 'Pending', count: counts.pending, color: 'text-amber-400' },
          { label: 'Approved', count: counts.approved, color: 'text-emerald-400' },
          { label: 'Waitlisted', count: counts.waitlisted, color: 'text-blue-400' },
          { label: 'Declined', count: counts.declined, color: 'text-red-400' },
        ].map(({ label, count, color }) => (
          <div key={label} className="text-center p-2 rounded-md" style={{ backgroundColor: 'var(--background-secondary)' }}>
            <div className={`text-lg font-bold ${color}`}>{count}</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* Status filter */}
        <div className="flex gap-1">
          {(['all', 'pending', 'approved', 'waitlisted', 'declined'] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2 py-1 text-xs rounded-md transition-fast capitalize ${
                filterStatus === s ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-[var(--background-secondary)]'
              }`}
              style={filterStatus !== s ? { color: 'var(--text-muted)' } : undefined}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {/* Sort */}
        <div className="flex items-center gap-1">
          <ArrowUpDown size={12} style={{ color: 'var(--text-muted)' }} />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortField)}
            className="text-xs py-1 px-2 rounded-md border-none focus:outline-none cursor-pointer"
            style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}
          >
            <option value="score">Investment Score</option>
            <option value="power">Power</option>
            <option value="tier">Preferred Tier</option>
            <option value="date">Submission Date</option>
            <option value="name">Name</option>
          </select>
        </div>
        {/* Compare button */}
        {selectedIds.size >= 2 && (
          <button
            onClick={() => setShowComparison(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-fast"
          >
            <Scale size={12} /> Compare ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Comparison panel */}
      {showComparison && selectedApps.length >= 2 && (
        <ComparisonPanel
          apps={selectedApps}
          onClose={() => { setShowComparison(false); setSelectedIds(new Set()); }}
          onDecide={handleDecide}
        />
      )}

      {/* Applications list */}
      <div className="space-y-1.5">
        {sortedApps.map(app => {
          const score = app.commander_level && app.skill_levels && app.commander_stars
            ? commanderInvestmentScore(app.commander_level, app.skill_levels, app.commander_stars)
            : 0;
          const isDeciding = decidingId === app.id;
          const isSelected = selectedIds.has(app.id);

          return (
            <div key={app.id}>
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-md transition-fast ${
                  isSelected ? 'ring-1 ring-purple-500/50' : ''
                }`}
                style={{ backgroundColor: 'var(--background-card)' }}
              >
                {/* Selection checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(app.id)}
                  disabled={!isSelected && selectedIds.size >= 3}
                  className="rounded shrink-0"
                />

                {/* Name + Alliance */}
                <div className="min-w-0 w-28 shrink-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{app.applicant_name}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {app.applicant_alliance ? allianceDisplay(app.applicant_alliance) : '-'}
                    {app.applicant_power ? ` · ${formatPower(app.applicant_power)}` : ''}
                  </div>
                </div>

                {/* Commander stats */}
                <div className="hidden md:flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    Lv.{app.commander_level || '?'}
                  </span>
                  <span className={`text-xs font-mono ${
                    app.skill_levels?.every(s => s === 5) ? 'text-yellow-500' : ''
                  }`} style={!app.skill_levels?.every(s => s === 5) ? { color: 'var(--foreground)' } : undefined}>
                    {app.skill_levels ? formatSkillLevels(app.skill_levels) : '-'}
                  </span>
                  <span className="text-xs text-yellow-500">
                    {app.commander_stars ? '★'.repeat(Math.min(app.commander_stars, 6)) : ''}
                  </span>
                  <InvestmentBar score={score} />
                </div>

                {/* Preferred tier */}
                <span className="text-xs shrink-0 hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                  {app.preferred_tier || '-'}
                </span>

                {/* Status */}
                <StatusBadge status={app.status} />

                {/* Actions */}
                {app.status === 'pending' && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleDecide(app.id, 'approved', app.preferred_tier || undefined)}
                      className="p-1.5 rounded-md text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/10 transition-fast"
                      title="Approve"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setDecidingId(isDeciding ? null : app.id);
                        setAssignTier(app.preferred_tier || '');
                        setOfficerNote('');
                      }}
                      className="p-1.5 rounded-md hover:bg-[var(--background-secondary)] transition-fast"
                      style={{ color: 'var(--text-muted)' }}
                      title="More options"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Expanded decision panel */}
              {isDeciding && (
                <div className="ml-6 mt-1 p-3 rounded-md border space-y-2"
                  style={{ backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)' }}>
                  <div className="flex gap-2">
                    {tiers.length > 0 && (
                      <select
                        value={assignTier}
                        onChange={e => setAssignTier(e.target.value)}
                        className={inputClass + ' flex-1'}
                        style={inputStyle}
                      >
                        <option value="">Assign tier...</option>
                        {tiers.map(t => (
                          <option key={t.tier_label} value={t.tier_label}>{t.tier_label}</option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      value={officerNote}
                      onChange={e => setOfficerNote(e.target.value)}
                      placeholder="Officer note (optional)"
                      className={inputClass + ' flex-1'}
                      style={inputStyle}
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleDecide(app.id, 'approved', assignTier || app.preferred_tier || undefined)}
                      className="px-3 py-1.5 text-xs rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-fast"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleDecide(app.id, 'waitlisted', assignTier || undefined)}
                      className="px-3 py-1.5 text-xs rounded-md bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-fast"
                    >
                      Waitlist
                    </button>
                    <button
                      onClick={() => handleDecide(app.id, 'declined')}
                      className="px-3 py-1.5 text-xs rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-fast"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => setDecidingId(null)}
                      className="px-3 py-1.5 text-xs rounded-md hover:bg-[var(--background-card)] transition-fast"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Finalize button */}
      {counts.approved > 0 && event.status !== 'finalized' && event.status !== 'completed' && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={handleFinalize}
            disabled={finalizing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-fast disabled:opacity-40"
          >
            <CheckCircle size={14} />
            {finalizing ? 'Finalizing...' : `Finalize Event (${counts.approved} approved)`}
          </button>
        </div>
      )}
    </div>
  );
}
