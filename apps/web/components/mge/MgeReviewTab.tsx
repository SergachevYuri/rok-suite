'use client';

import { useState, useMemo, useCallback } from 'react';
import { Check, X, Users, CheckCircle, MessageSquare } from 'lucide-react';
import {
  updateApplicationStatus,
  convertApprovedToSelections,
  type MgeEvent,
  type MgeApplication,
  type MgeApplicationStatus,
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

type TriageFilter = 'all' | 'undecided' | 'ranked' | 'skipped';

function formatPower(power: number): string {
  if (power >= 1_000_000) return `${(power / 1_000_000).toFixed(1)}M`;
  if (power >= 1_000) return `${(power / 1_000).toFixed(0)}K`;
  return power.toString();
}

function InvestmentBar({ score, max = 178 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{score}</span>
    </div>
  );
}

function ApplicantCard({
  app,
  tiers,
  onTriage,
  onNoteChange,
  onTierChange,
}: {
  app: MgeApplication;
  tiers: { tier_label: string }[];
  onTriage: (status: 'approved' | 'declined' | 'pending') => void;
  onNoteChange: (note: string) => void;
  onTierChange: (tier: string) => void;
}) {
  const score = app.commander_level && app.skill_levels && app.commander_stars
    ? commanderInvestmentScore(app.commander_level, app.skill_levels, app.commander_stars)
    : 0;

  const isRanked = app.status === 'approved';
  const isSkipped = app.status === 'declined';
  const isPending = app.status === 'pending';

  const skillsMaxed = app.skill_levels?.every(s => s === 5);

  return (
    <div
      className={`rounded-lg border p-3 transition-fast ${
        isRanked ? 'border-emerald-500/30 bg-emerald-500/5' :
        isSkipped ? 'border-red-500/20 bg-red-500/5 opacity-60' :
        'border-transparent'
      }`}
      style={isPending ? { backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' } : undefined}
    >
      {/* Top row: name + stats + triage buttons */}
      <div className="flex items-start gap-3">
        {/* Name & info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
              {app.applicant_name}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {app.applicant_alliance ? allianceDisplay(app.applicant_alliance) : ''}
              {app.applicant_power ? ` · ${formatPower(app.applicant_power)}` : ''}
            </span>
          </div>
          {/* Commander stats inline */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Lv.{app.commander_level || '?'}
            </span>
            <span className={`text-xs font-mono ${skillsMaxed ? 'text-yellow-500' : ''}`}
              style={!skillsMaxed ? { color: 'var(--foreground)' } : undefined}>
              {app.skill_levels ? formatSkillLevels(app.skill_levels) : '-'}
            </span>
            <span className="text-xs text-yellow-500">
              {app.commander_stars ? '★'.repeat(Math.min(app.commander_stars, 6)) : ''}
            </span>
            <InvestmentBar score={score} />
            {app.preferred_tier && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                wants {app.preferred_tier}
              </span>
            )}
          </div>
          {/* Player notes */}
          {app.notes && (
            <div className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <MessageSquare size={9} />
              {app.notes}
            </div>
          )}
        </div>

        {/* Triage buttons */}
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onTriage(isRanked ? 'pending' : 'approved')}
            className={`p-1.5 rounded-md transition-fast ${
              isRanked
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10'
            }`}
            title={isRanked ? 'Undo rank' : 'Rank'}
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => onTriage(isSkipped ? 'pending' : 'declined')}
            className={`p-1.5 rounded-md transition-fast ${
              isSkipped
                ? 'bg-red-500/20 text-red-400'
                : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
            }`}
            title={isSkipped ? 'Undo skip' : 'Skip'}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Bottom row: tier assignment + officer notes (only when ranked) */}
      {isRanked && (
        <div className="flex gap-2 mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          {tiers.length > 0 && (
            <select
              value={app.assigned_tier || ''}
              onChange={e => onTierChange(e.target.value)}
              className="text-xs py-1.5 px-2 rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-28 shrink-0"
              style={{ backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              <option value="">Assign tier...</option>
              {tiers.map(t => (
                <option key={t.tier_label} value={t.tier_label}>{t.tier_label}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            defaultValue={app.officer_notes || ''}
            onBlur={e => {
              if (e.target.value !== (app.officer_notes || '')) {
                onNoteChange(e.target.value);
              }
            }}
            placeholder="Officer notes..."
            className="flex-1 text-xs py-1.5 px-2 rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            style={{ backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
        </div>
      )}
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
    let ranked = 0, skipped = 0, undecided = 0;
    for (const app of apps) {
      if (app.status === 'approved') ranked++;
      else if (app.status === 'declined') skipped++;
      else if (app.status === 'pending') undecided++;
    }
    return { ranked, skipped, undecided, total: apps.length };
  }, [apps]);

  // Filtered and sorted by investment score
  const sortedApps = useMemo(() => {
    let filtered = apps;
    if (triageFilter === 'undecided') filtered = apps.filter(a => a.status === 'pending');
    else if (triageFilter === 'ranked') filtered = apps.filter(a => a.status === 'approved');
    else if (triageFilter === 'skipped') filtered = apps.filter(a => a.status === 'declined');

    return [...filtered].sort((a, b) => {
      // Ranked first, then pending, then skipped
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

  const handleTriage = useCallback(async (appId: number, status: 'approved' | 'declined' | 'pending') => {
    const app = apps.find(a => a.id === appId);
    const tier = status === 'approved' ? (app?.assigned_tier || app?.preferred_tier || null) : null;
    const ok = await updateApplicationStatus(appId, status, app?.officer_notes || null, tier);
    if (ok) onUpdate();
  }, [apps, onUpdate]);

  const handleNoteChange = useCallback(async (appId: number, note: string) => {
    const app = apps.find(a => a.id === appId);
    await updateApplicationStatus(appId, app?.status || 'pending', note || null, app?.assigned_tier || null);
    onUpdate();
  }, [apps, onUpdate]);

  const handleTierChange = useCallback(async (appId: number, tier: string) => {
    const app = apps.find(a => a.id === appId);
    await updateApplicationStatus(appId, app?.status || 'approved', app?.officer_notes || null, tier || null);
    onUpdate();
  }, [apps, onUpdate]);

  const handleFinalize = async () => {
    if (!confirm('Convert all ranked applications to selections and finalize this event?')) return;
    setFinalizing(true);
    const ok = await convertApprovedToSelections(event.id);
    if (ok) onUpdate();
    setFinalizing(false);
  };

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
      {/* Summary line + filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="text-emerald-400 font-medium">{counts.ranked} ranked</span>
          {', '}
          <span className="text-red-400">{counts.skipped} skipped</span>
          {', '}
          <span>{counts.undecided} undecided</span>
        </span>
        <div className="flex-1" />
        <div className="flex gap-1">
          {([
            { key: 'all', label: 'All' },
            { key: 'undecided', label: 'Undecided' },
            { key: 'ranked', label: 'Ranked' },
            { key: 'skipped', label: 'Skipped' },
          ] as { key: TriageFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTriageFilter(key)}
              className={`px-2 py-1 text-xs rounded-md transition-fast ${
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
      <div className="space-y-2">
        {sortedApps.map(app => (
          <ApplicantCard
            key={app.id}
            app={app}
            tiers={tiers}
            onTriage={status => handleTriage(app.id, status)}
            onNoteChange={note => handleNoteChange(app.id, note)}
            onTierChange={tier => handleTierChange(app.id, tier)}
          />
        ))}
      </div>

      {/* Finalize button (admin only) */}
      {isAdmin && counts.ranked > 0 && event.status !== 'finalized' && event.status !== 'completed' && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={handleFinalize}
            disabled={finalizing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-fast disabled:opacity-40"
          >
            <CheckCircle size={14} />
            {finalizing ? 'Finalizing...' : `Finalize Event (${counts.ranked} ranked)`}
          </button>
        </div>
      )}
    </div>
  );
}
