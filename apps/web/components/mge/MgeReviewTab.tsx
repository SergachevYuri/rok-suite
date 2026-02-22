'use client';

import { useState, useMemo, useCallback } from 'react';
import { Users, CheckCircle, Info, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import {
  updateApplicationStatus,
  convertApprovedToSelections,
  deleteApplication,
  type MgeEvent,
  type MgeApplication,
} from '@/lib/supabase/use-mge';
import {
  formatSkillLevels,
  commanderInvestmentScore,
  commanderInvestmentBreakdown,
  goldHeadsToExpertise,
  type InvestmentBreakdown,
} from '@/lib/mge/helpers';
import { allianceDisplay } from '@/lib/alliances';

interface MgeReviewTabProps {
  event: MgeEvent;
  isAdmin: boolean;
  onUpdate: () => void;
}

function formatPower(power: number): string {
  if (power >= 1_000_000) return `${(power / 1_000_000).toFixed(1)}M`;
  if (power >= 1_000) return `${(power / 1_000).toFixed(0)}K`;
  return power.toString();
}

function InvestmentBar({
  score,
  max = 188,
  breakdown,
}: {
  score: number;
  max?: number;
  breakdown?: InvestmentBreakdown | null;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const pct = Math.min(100, (score / max) * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-red-500';

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2"
        onClick={() => setShowTooltip(!showTooltip)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="w-24 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--text-secondary)' }}>{score}/{max}</span>
      </button>

      {showTooltip && breakdown && (
        <div className="absolute bottom-full left-0 mb-2 z-20">
          <div
            className="p-3 rounded-lg border shadow-lg text-sm whitespace-nowrap"
            style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
          >
            <p className="font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
              Investment Score
            </p>
            <div className="space-y-1">
              <div className="flex justify-between gap-6">
                <span style={{ color: 'var(--text-muted)' }}>Level</span>
                <span className="tabular-nums font-medium" style={{ color: 'var(--foreground)' }}>
                  {breakdown.levelScore}/{breakdown.levelMax}
                </span>
              </div>
              <div className="flex justify-between gap-6">
                <span style={{ color: 'var(--text-muted)' }}>Skills (&times;5)</span>
                <span className="tabular-nums font-medium" style={{ color: 'var(--foreground)' }}>
                  {breakdown.skillScore}/{breakdown.skillMax}
                </span>
              </div>
              <div className="flex justify-between gap-6">
                <span style={{ color: 'var(--text-muted)' }}>Stars (&times;3)</span>
                <span className="tabular-nums font-medium" style={{ color: 'var(--foreground)' }}>
                  {breakdown.starsScore}/{breakdown.starsMax}
                </span>
              </div>
              {breakdown.equipmentScore > 0 && (
                <div className="flex justify-between gap-6">
                  <span style={{ color: 'var(--text-muted)' }}>Equipment</span>
                  <span className="tabular-nums font-medium" style={{ color: 'var(--foreground)' }}>
                    {breakdown.equipmentScore}/{breakdown.equipmentMax}
                  </span>
                </div>
              )}
              <div
                className="border-t pt-1.5 mt-1.5 flex justify-between gap-6 font-semibold"
                style={{ borderColor: 'var(--border)' }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>Total</span>
                <span className="tabular-nums" style={{ color: 'var(--foreground)' }}>
                  {breakdown.total}/{breakdown.max}
                </span>
              </div>
              {breakdown.goldHeadsNeeded > 0 && (
                <div className="flex justify-between gap-6 text-yellow-500">
                  <span>Heads to expertise</span>
                  <span className="tabular-nums font-medium">{breakdown.goldHeadsNeeded}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Missing info badges for an application */
function MissingBadges({ app }: { app: MgeApplication }) {
  const missing: { label: string; color: string }[] = [];
  if (!app.screenshot_url) {
    missing.push({ label: 'No screenshot', color: 'bg-orange-500/15 text-orange-400' });
  }
  if (app.screenshot_url && app.equipment_rating == null) {
    missing.push({ label: 'Needs gear rating', color: 'bg-orange-500/15 text-orange-400' });
  }
  if (app.status === 'pending') {
    missing.push({ label: 'No decision', color: 'bg-red-500/15 text-red-400' });
  }
  if (missing.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {missing.map(m => (
        <span key={m.label} className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.color}`}>
          {m.label}
        </span>
      ))}
    </div>
  );
}

function ApplicantCard({
  app,
  tiers,
  showMissingBadges,
  isAdmin,
  onDecision,
  onNoteChange,
  onEquipmentRating,
  onDelete,
}: {
  app: MgeApplication;
  tiers: { tier_label: string }[];
  showMissingBadges: boolean;
  isAdmin: boolean;
  onDecision: (tier: string | null, status: 'approved' | 'declined' | 'pending') => void;
  onNoteChange: (note: string) => void;
  onEquipmentRating: (rating: number | null) => void;
  onDelete: () => void;
}) {
  const breakdown = app.commander_level && app.skill_levels && app.commander_stars
    ? commanderInvestmentBreakdown(app.commander_level, app.skill_levels, app.commander_stars, app.equipment_rating)
    : null;
  const score = breakdown?.total ?? 0;
  const headsNeeded = app.skill_levels ? goldHeadsToExpertise(app.skill_levels) : null;

  const [showScreenshot, setShowScreenshot] = useState(false);

  const isAssigned = app.status === 'approved';
  const isSkipped = app.status === 'declined';
  const skillsMaxed = app.skill_levels?.every(s => s === 5);

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
      className={`rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3 transition-fast ${
        isAssigned ? 'border-emerald-500/30 bg-emerald-500/5' :
        isSkipped ? 'border-red-500/20 bg-red-500/5 opacity-60' :
        ''
      }`}
      style={!isAssigned && !isSkipped ? { backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' } : undefined}
    >
      {/* Missing info badges */}
      {showMissingBadges && <MissingBadges app={app} />}

      {/* Header: Name + Alliance + Power + Preference + Notes */}
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
          <span className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>
            {app.applicant_name}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {app.applicant_alliance ? allianceDisplay(app.applicant_alliance) : ''}
          </span>
          {app.preferred_tier && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
              Prefers {app.preferred_tier}
            </span>
          )}
          {app.notes && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              &ldquo;{app.notes}&rdquo;
            </span>
          )}
        </div>
        {app.applicant_power && (
          <span className="text-sm shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {formatPower(app.applicant_power)}
          </span>
        )}
      </div>

      {/* Stats row: Level, Skills, Stars, Score bar, Heads */}
      <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          Lv.{app.commander_level || '?'}
        </span>
        <span className={`text-sm font-mono ${skillsMaxed ? 'text-yellow-500 font-semibold' : ''}`}
          style={!skillsMaxed ? { color: 'var(--foreground)' } : undefined}>
          {app.skill_levels ? formatSkillLevels(app.skill_levels) : '-'}
        </span>
        <span className="text-sm text-yellow-500">
          {app.commander_stars ? '\u2605'.repeat(Math.min(app.commander_stars, 6)) : ''}
        </span>
        <InvestmentBar score={score} breakdown={breakdown} />
        {headsNeeded !== null && headsNeeded > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-medium shrink-0">
            {headsNeeded} heads
          </span>
        )}
        {headsNeeded === 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium shrink-0">
            Expertised
          </span>
        )}
      </div>

      {/* Screenshot + Gear rating row (inline) */}
      {app.screenshot_url && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <button
              type="button"
              onClick={() => setShowScreenshot(true)}
              className="shrink-0"
            >
              <img
                src={app.screenshot_url}
                alt="Commander screenshot"
                className="h-12 rounded border object-cover hover:brightness-110 transition-fast"
                style={{ borderColor: 'var(--border)' }}
              />
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }} title="Rate equipment quality from screenshot (1=poor, 10=maxed)">Gear</span>
              <div className="flex gap-px">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onEquipmentRating(n === app.equipment_rating ? null : n)}
                    className={`w-5 h-5 text-[10px] rounded transition-fast ${
                      n <= (app.equipment_rating || 0)
                        ? 'bg-blue-500/30 text-blue-400 font-semibold'
                        : 'hover:bg-blue-500/10'
                    }`}
                    style={n > (app.equipment_rating || 0) ? { backgroundColor: 'var(--background-secondary)', color: 'var(--text-muted)' } : undefined}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {app.equipment_rating != null && (
                <span className="text-xs text-blue-400 font-medium tabular-nums">{app.equipment_rating}/10</span>
              )}
            </div>
          </div>
          {showScreenshot && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
              onClick={() => setShowScreenshot(false)}
            >
              <div className="relative max-w-[90vw] max-h-[90vh]">
                <img
                  src={app.screenshot_url}
                  alt="Commander screenshot"
                  className="max-w-full max-h-[85vh] rounded-lg object-contain"
                />
                <button
                  onClick={() => setShowScreenshot(false)}
                  className="absolute -top-3 -right-3 p-1.5 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-fast"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Decision + Officer notes */}
      <div className="flex gap-2 items-center">
        <select
          value={dropdownValue}
          onChange={e => handleDropdownChange(e.target.value)}
          className={`shrink-0 py-1.5 px-2 rounded-md border text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-32 sm:w-36 ${
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
        <input
          type="text"
          defaultValue={app.officer_notes || ''}
          onBlur={e => {
            if (e.target.value !== (app.officer_notes || '')) {
              onNoteChange(e.target.value);
            }
          }}
          title="Internal notes — only visible to officers"
          placeholder="Officer notes..."
          className="flex-1 min-w-0 text-sm py-1.5 px-2 rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          style={{ backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        />
        {isAdmin && (
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 p-1.5 rounded-md text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-fast"
            title="Delete application (admin)"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Collapsible section wrapper */
function ReviewSection({
  title,
  count,
  defaultOpen,
  accentColor,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  accentColor?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left mb-2 group"
      >
        {open ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        <span className={`text-base font-semibold ${accentColor || ''}`} style={!accentColor ? { color: 'var(--foreground)' } : undefined}>
          {title}
        </span>
        <span className="text-sm font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-muted)' }}>
          {count}
        </span>
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

export function MgeReviewTab({ event, isAdmin, onUpdate }: MgeReviewTabProps) {
  const [finalizing, setFinalizing] = useState(false);

  const apps = event.mge_applications || [];
  const tiers = event.mge_rank_tiers || [];

  // Group apps by status
  const { needsReview, assigned, skipped, withdrawn } = useMemo(() => {
    const needsReview: MgeApplication[] = [];
    const assigned: MgeApplication[] = [];
    const skipped: MgeApplication[] = [];
    const withdrawn: MgeApplication[] = [];

    for (const app of apps) {
      if (app.status === 'pending' || app.status === 'waitlisted') needsReview.push(app);
      else if (app.status === 'approved') assigned.push(app);
      else if (app.status === 'declined') skipped.push(app);
      else if (app.status === 'withdrawn') withdrawn.push(app);
    }

    const scoreOf = (a: MgeApplication) =>
      a.commander_level && a.skill_levels && a.commander_stars
        ? commanderInvestmentScore(a.commander_level, a.skill_levels, a.commander_stars, a.equipment_rating)
        : 0;

    // Needs review: screenshot first, then by score
    needsReview.sort((a, b) => {
      const aHasScreenshot = a.screenshot_url ? 1 : 0;
      const bHasScreenshot = b.screenshot_url ? 1 : 0;
      if (aHasScreenshot !== bHasScreenshot) return bHasScreenshot - aHasScreenshot;
      return scoreOf(b) - scoreOf(a);
    });

    // Assigned: by score desc
    assigned.sort((a, b) => scoreOf(b) - scoreOf(a));

    // Skipped: by score desc
    skipped.sort((a, b) => scoreOf(b) - scoreOf(a));

    return { needsReview, assigned, skipped, withdrawn };
  }, [apps]);

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

  const handleEquipmentRating = useCallback(async (appId: number, rating: number | null) => {
    const app = apps.find(a => a.id === appId);
    await updateApplicationStatus(
      appId,
      app?.status || 'pending',
      app?.officer_notes || null,
      app?.assigned_tier || null,
      rating
    );
    onUpdate();
  }, [apps, onUpdate]);

  const handleDelete = useCallback(async (appId: number, appName: string) => {
    if (!confirm(`Delete ${appName}'s application? This cannot be undone.`)) return;
    const ok = await deleteApplication(appId);
    if (ok) onUpdate();
  }, [onUpdate]);

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

  const renderCards = (list: MgeApplication[], showMissing: boolean) =>
    list.map(app => (
      <ApplicantCard
        key={app.id}
        app={app}
        tiers={tiers}
        showMissingBadges={showMissing}
        isAdmin={isAdmin}
        onDecision={(tier, status) => handleDecision(app.id, tier, status)}
        onNoteChange={note => handleNoteChange(app.id, note)}
        onEquipmentRating={rating => handleEquipmentRating(app.id, rating)}
        onDelete={() => handleDelete(app.id, app.applicant_name)}
      />
    ));

  return (
    <div className="p-4 md:p-5">
      {/* Instructions */}
      <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/15">
        <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <p className="font-medium text-blue-400">How to review</p>
          <ol className="list-decimal list-inside space-y-0.5" style={{ color: 'var(--text-muted)' }}>
            <li>Review <strong>screenshot</strong> and rate <strong>equipment</strong> (1-10)</li>
            <li>Tap the <strong>score bar</strong> to see level/skill/star breakdown</li>
            <li>Use the <strong>dropdown</strong> to assign a rank or skip</li>
            <li>Add <strong>officer notes</strong> if needed</li>
            <li>When all reviewed, admin clicks <strong>Finalize</strong></li>
          </ol>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5 text-base">
        <span className="font-medium" style={{ color: 'var(--foreground)' }}>{apps.length} applicants</span>
        <span style={{ color: 'var(--text-muted)' }}>&mdash;</span>
        <span className="text-emerald-400 font-medium">{assigned.length} assigned</span>
        <span className="text-red-400">{skipped.length} skipped</span>
        <span style={{ color: 'var(--text-muted)' }}>{needsReview.length} undecided</span>
      </div>

      {/* Sections */}
      <ReviewSection title="Needs Review" count={needsReview.length} defaultOpen={true} accentColor="text-orange-400">
        {renderCards(needsReview, true)}
      </ReviewSection>

      <ReviewSection title="Assigned" count={assigned.length} defaultOpen={true} accentColor="text-emerald-400">
        {renderCards(assigned, false)}
      </ReviewSection>

      <ReviewSection title="Skipped" count={skipped.length} defaultOpen={false} accentColor="text-red-400">
        {renderCards(skipped, false)}
      </ReviewSection>

      <ReviewSection title="Withdrawn" count={withdrawn.length} defaultOpen={false} accentColor="text-zinc-400">
        {renderCards(withdrawn, false)}
      </ReviewSection>

      {/* Finalize button (admin only) */}
      {isAdmin && assigned.length > 0 && event.status !== 'finalized' && event.status !== 'completed' && (
        <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={handleFinalize}
            disabled={finalizing}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md text-base font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-fast disabled:opacity-40"
          >
            <CheckCircle size={18} />
            {finalizing ? 'Finalizing...' : `Finalize Event (${assigned.length} assigned)`}
          </button>
        </div>
      )}
    </div>
  );
}
