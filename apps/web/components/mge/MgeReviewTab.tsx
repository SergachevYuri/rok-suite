'use client';

import { useState, useMemo, useCallback } from 'react';
import { Users, CheckCircle, MessageSquare, Info } from 'lucide-react';
import {
  updateApplicationStatus,
  convertApprovedToSelections,
  type MgeEvent,
  type MgeApplication,
} from '@/lib/supabase/use-mge';
import {
  formatSkillLevels,
  commanderInvestmentScore,
} from '@/lib/mge/helpers';
import { allianceDisplay } from '@/lib/alliances';

interface MgeReviewTabProps {
  event: MgeEvent;
  isAdmin: boolean;
  onUpdate: () => void;
}

type TriageFilter = 'all' | 'undecided' | 'assigned' | 'skipped';

function formatPower(power: number): string {
  if (power >= 1_000_000) return `${(power / 1_000_000).toFixed(1)}M`;
  if (power >= 1_000) return `${(power / 1_000).toFixed(0)}K`;
  return power.toString();
}

function InvestmentBar({ score, max = 178 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{score}/{max}</span>
    </div>
  );
}

function ApplicantCard({
  app,
  tiers,
  onDecision,
  onNoteChange,
}: {
  app: MgeApplication;
  tiers: { tier_label: string }[];
  onDecision: (tier: string | null, status: 'approved' | 'declined' | 'pending') => void;
  onNoteChange: (note: string) => void;
}) {
  const score = app.commander_level && app.skill_levels && app.commander_stars
    ? commanderInvestmentScore(app.commander_level, app.skill_levels, app.commander_stars)
    : 0;

  const isAssigned = app.status === 'approved';
  const isSkipped = app.status === 'declined';
  const skillsMaxed = app.skill_levels?.every(s => s === 5);

  // Combine tier + skip into one dropdown value
  const dropdownValue = isSkipped ? '__skip__' : (isAssigned ? (app.assigned_tier || '') : '');

  const handleDropdownChange = (value: string) => {
    if (value === '__skip__') {
      onDecision(null, 'declined');
    } else if (value === '') {
      onDecision(null, 'pending');
    } else {
      onDecision(value, 'approved');
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 transition-fast ${
        isAssigned ? 'border-emerald-500/30 bg-emerald-500/5' :
        isSkipped ? 'border-red-500/20 bg-red-500/5 opacity-50' :
        ''
      }`}
      style={!isAssigned && !isSkipped ? { backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' } : undefined}
    >
      {/* Row 1: Name + Alliance + Power */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-base" style={{ color: 'var(--foreground)' }}>
            {app.applicant_name}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {app.applicant_alliance ? allianceDisplay(app.applicant_alliance) : ''}
          </span>
        </div>
        {app.applicant_power && (
          <span className="text-sm shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {formatPower(app.applicant_power)}
          </span>
        )}
      </div>

      {/* Row 2: Commander stats */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          Lv.{app.commander_level || '?'}
        </span>
        <span className={`text-sm font-mono ${skillsMaxed ? 'text-yellow-500 font-semibold' : ''}`}
          style={!skillsMaxed ? { color: 'var(--foreground)' } : undefined}>
          {app.skill_levels ? formatSkillLevels(app.skill_levels) : '-'}
        </span>
        <span className="text-sm text-yellow-500">
          {app.commander_stars ? '★'.repeat(Math.min(app.commander_stars, 6)) : ''}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Investment:</span>
          <InvestmentBar score={score} />
        </div>
      </div>

      {/* Row 3: Player preference + notes */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {app.preferred_tier && (
          <span className="text-xs px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400">
            Prefers {app.preferred_tier}
          </span>
        )}
        {app.notes && (
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <MessageSquare size={11} />
            &ldquo;{app.notes}&rdquo;
          </span>
        )}
      </div>

      {/* Row 4: Assign rank dropdown + Officer notes */}
      <div className="flex gap-3 items-center">
        <div className="shrink-0">
          <select
            value={dropdownValue}
            onChange={e => handleDropdownChange(e.target.value)}
            className={`py-2 px-3 rounded-md border text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-40 ${
              isAssigned ? 'border-emerald-500/40 text-emerald-400' :
              isSkipped ? 'border-red-500/30 text-red-400' :
              ''
            }`}
            style={{
              backgroundColor: isAssigned ? 'rgba(16,185,129,0.1)' : isSkipped ? 'rgba(239,68,68,0.1)' : 'var(--background-secondary)',
              borderColor: !isAssigned && !isSkipped ? 'var(--border)' : undefined,
              color: !isAssigned && !isSkipped ? 'var(--foreground)' : undefined,
            }}
          >
            <option value="">— Undecided —</option>
            {tiers.map(t => (
              <option key={t.tier_label} value={t.tier_label}>{t.tier_label}</option>
            ))}
            <option value="__skip__">Skip</option>
          </select>
        </div>
        <input
          type="text"
          defaultValue={app.officer_notes || ''}
          onBlur={e => {
            if (e.target.value !== (app.officer_notes || '')) {
              onNoteChange(e.target.value);
            }
          }}
          placeholder="Officer notes..."
          className="flex-1 text-sm py-2 px-3 rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          style={{ backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        />
      </div>
    </div>
  );
}

export function MgeReviewTab({ event, isAdmin, onUpdate }: MgeReviewTabProps) {
  const [triageFilter, setTriageFilter] = useState<TriageFilter>('all');
  const [finalizing, setFinalizing] = useState(false);

  const apps = event.mge_applications || [];
  const tiers = event.mge_rank_tiers || [];

  // Counts
  const counts = useMemo(() => {
    let assigned = 0, skipped = 0, undecided = 0;
    for (const app of apps) {
      if (app.status === 'approved') assigned++;
      else if (app.status === 'declined') skipped++;
      else if (app.status === 'pending') undecided++;
    }
    return { assigned, skipped, undecided, total: apps.length };
  }, [apps]);

  // Filtered and sorted by investment score
  const sortedApps = useMemo(() => {
    let filtered = apps;
    if (triageFilter === 'undecided') filtered = apps.filter(a => a.status === 'pending');
    else if (triageFilter === 'assigned') filtered = apps.filter(a => a.status === 'approved');
    else if (triageFilter === 'skipped') filtered = apps.filter(a => a.status === 'declined');

    return [...filtered].sort((a, b) => {
      // Assigned first, then pending, then skipped
      const order = { approved: 0, pending: 1, declined: 2, waitlisted: 3, withdrawn: 4 };
      const oa = order[a.status] ?? 5;
      const ob = order[b.status] ?? 5;
      if (oa !== ob) return oa - ob;

      // Within same status, sort by score descending
      const sa = a.commander_level && a.skill_levels && a.commander_stars
        ? commanderInvestmentScore(a.commander_level, a.skill_levels, a.commander_stars) : 0;
      const sb = b.commander_level && b.skill_levels && b.commander_stars
        ? commanderInvestmentScore(b.commander_level, b.skill_levels, b.commander_stars) : 0;
      return sb - sa;
    });
  }, [apps, triageFilter]);

  const handleDecision = useCallback(async (appId: number, tier: string | null, status: 'approved' | 'declined' | 'pending') => {
    const app = apps.find(a => a.id === appId);
    const ok = await updateApplicationStatus(appId, status, app?.officer_notes || null, tier);
    if (ok) onUpdate();
  }, [apps, onUpdate]);

  const handleNoteChange = useCallback(async (appId: number, note: string) => {
    const app = apps.find(a => a.id === appId);
    await updateApplicationStatus(appId, app?.status || 'pending', note || null, app?.assigned_tier || null);
    onUpdate();
  }, [apps, onUpdate]);

  const handleFinalize = async () => {
    if (!confirm('Convert all assigned applications to selections and finalize this event?')) return;
    setFinalizing(true);
    const ok = await convertApprovedToSelections(event.id);
    if (ok) onUpdate();
    setFinalizing(false);
  };

  if (apps.length === 0) {
    return (
      <div className="p-8 text-center">
        <Users size={36} className="mx-auto mb-3 text-zinc-500" />
        <p className="text-base font-medium" style={{ color: 'var(--text-secondary)' }}>No Applications Yet</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Applications will appear here once players submit them.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5">
      {/* Instructions */}
      <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/15">
        <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Use the dropdown on each applicant to assign a rank tier, or select <strong>Skip</strong> to pass.
          The <strong>Investment</strong> bar shows how developed their commander is (level + skills + stars).
          Add officer notes as needed.
        </p>
      </div>

      {/* Summary + filter pills */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          <span className="text-emerald-400 font-medium">{counts.assigned} assigned</span>
          {' / '}
          <span className="text-red-400">{counts.skipped} skipped</span>
          {' / '}
          <span>{counts.undecided} undecided</span>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1">
          {([
            { key: 'all', label: 'All' },
            { key: 'undecided', label: 'Undecided' },
            { key: 'assigned', label: 'Assigned' },
            { key: 'skipped', label: 'Skipped' },
          ] as { key: TriageFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTriageFilter(key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-fast ${
                triageFilter === key ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-[var(--background-secondary)]'
              }`}
              style={triageFilter !== key ? { color: 'var(--text-muted)' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Applicant cards */}
      <div className="space-y-3">
        {sortedApps.map(app => (
          <ApplicantCard
            key={app.id}
            app={app}
            tiers={tiers}
            onDecision={(tier, status) => handleDecision(app.id, tier, status)}
            onNoteChange={note => handleNoteChange(app.id, note)}
          />
        ))}
      </div>

      {/* Finalize button (admin only) */}
      {isAdmin && counts.assigned > 0 && event.status !== 'finalized' && event.status !== 'completed' && (
        <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={handleFinalize}
            disabled={finalizing}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-fast disabled:opacity-40"
          >
            <CheckCircle size={16} />
            {finalizing ? 'Finalizing...' : `Finalize Event (${counts.assigned} assigned)`}
          </button>
        </div>
      )}
    </div>
  );
}
