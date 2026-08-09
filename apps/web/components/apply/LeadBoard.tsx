'use client';

// Officer-only "Lead Board": the applications reorganized into lead slots
// (unit x rally/garrison + leadership garrison), with the officer rating, the
// in-game readiness, and any verified skill notes. Two views:
//   - Tops:  Rally Leads / Garrison Leads, showing COMPLETE (ready) leads per
//            unit, or the top 2-3 candidates when none are complete yet.
//   - Category: the full per-slot breakdown.
// Filter chips narrow by unit and role. Everything reads live from the same
// applications the review tab uses; readiness / verified-skills are parsed from
// each application's notes ([Lead readiness ...] / [Skills verified ...]).

import { useMemo, useState } from 'react';
import { Crown, Star, RefreshCw, UserPlus, Copy, Check } from 'lucide-react';
import { useLeaderApplications } from '@/lib/supabase/use-leader-applications';

type Unit = 'infantry' | 'archer' | 'cavalry' | 'leadership';
type Role = 'rally' | 'garrison';

const UNIT_LABEL: Record<Unit, string> = {
  infantry: 'Infantry',
  archer: 'Archer',
  cavalry: 'Cavalry',
  leadership: 'Leadership',
};

const RALLY_UNITS: Unit[] = ['infantry', 'archer', 'cavalry'];
const GARRISON_UNITS: Unit[] = ['infantry', 'archer', 'cavalry', 'leadership'];

// Full per-slot list (Category view), in a natural order.
const SLOTS: { key: string; unit: Unit; role: Role; label: string }[] = [
  { key: 'infantry/rally', unit: 'infantry', role: 'rally', label: 'Infantry — Rally' },
  { key: 'infantry/garrison', unit: 'infantry', role: 'garrison', label: 'Infantry — Garrison' },
  { key: 'archer/rally', unit: 'archer', role: 'rally', label: 'Archer — Rally' },
  { key: 'archer/garrison', unit: 'archer', role: 'garrison', label: 'Archer — Garrison' },
  { key: 'cavalry/rally', unit: 'cavalry', role: 'rally', label: 'Cavalry — Rally' },
  { key: 'cavalry/garrison', unit: 'cavalry', role: 'garrison', label: 'Cavalry — Garrison' },
  { key: 'leadership/garrison', unit: 'leadership', role: 'garrison', label: 'Leadership — Garrison' },
];

function firstMatch(notes: string | null, re: RegExp): string | null {
  if (!notes) return null;
  const m = notes.match(re);
  return m ? m[1].trim() : null;
}
const READINESS_RE = /\[Lead readiness[^:]*:\s*([^\n]*)/i;
const SKILLS_RE = /\[Skills verified[^:]*:\s*([^\n]*)/i;
const READINESS_LABEL: Record<string, string> = { ready: 'READY', near: 'NEAR', not_ready: 'NOT READY', review: 'REVIEW' };

interface Candidate {
  govId: string;
  name: string;
  rating: number | null;
  primary: string | null;
  secondary: string | null;
  readiness: string | null;
  skills: string | null;
  direct: boolean;
  appliedAt: string;
}

/** A "complete" lead = officer/in-game readiness says READY. */
function isComplete(c: Candidate): boolean {
  return (c.readiness || '').toUpperCase().startsWith('READY');
}
/** READY > NEAR > (blank) > NOT READY. */
function readinessRank(r: string | null): number {
  if (!r) return 2;
  const u = r.toUpperCase();
  if (u.startsWith('READY')) return 4;
  if (u.startsWith('NEAR')) return 3;
  if (u.startsWith('REVIEW')) return 1;
  if (u.startsWith('NOT')) return 0;
  return 1;
}
function readinessTone(r: string | null): string {
  if (!r) return 'bg-[var(--background-secondary)] text-[var(--text-muted)] border-[var(--border)]';
  const u = r.toUpperCase();
  if (u.startsWith('READY')) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (u.startsWith('NEAR')) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  if (u.startsWith('REVIEW')) return 'bg-violet-500/15 text-violet-400 border-violet-500/30';
  if (u.startsWith('NOT')) return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
}

export function LeadBoard() {
  const { apps, loading, error, reload } = useLeaderApplications();
  const [copied, setCopied] = useState<string | null>(null);
  const [view, setView] = useState<'tops' | 'category'>('tops');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [unitFilter, setUnitFilter] = useState<'all' | Unit>('all');

  const { slotMap, bySlot, total, directCount } = useMemo(() => {
    const readinessByGov = new Map<string, string>();
    const skillsByGov = new Map<string, string>();
    const directByGov = new Set<string>();
    for (const a of apps) {
      // Prefer the structured readiness column; fall back to the legacy
      // "[Lead readiness ...]" note for anything not migrated.
      const r = a.readiness
        ? READINESS_LABEL[a.readiness] + (a.readiness_note ? ` - ${a.readiness_note}` : '')
        : firstMatch(a.notes, READINESS_RE);
      if (r && !readinessByGov.has(a.gov_id)) readinessByGov.set(a.gov_id, r);
      const s = firstMatch(a.notes, SKILLS_RE);
      if (s && !skillsByGov.has(a.gov_id)) skillsByGov.set(a.gov_id, s);
      if (a.notes && /Direct reach-out/i.test(a.notes)) directByGov.add(a.gov_id);
    }

    const buckets = new Map<string, Map<string, Candidate>>();
    for (const s of SLOTS) buckets.set(s.key, new Map());
    for (const a of apps) {
      for (const role of a.leader_application_roles || []) {
        const key = `${role.unit_type}/${role.role_type}`;
        const bucket = buckets.get(key);
        if (!bucket) continue;
        const existing = bucket.get(a.gov_id);
        if (existing && existing.appliedAt >= a.created_at) continue;
        bucket.set(a.gov_id, {
          govId: a.gov_id,
          name: a.name,
          rating: a.rating,
          primary: role.primary_commander_name,
          secondary: role.secondary_commander_name,
          readiness: readinessByGov.get(a.gov_id) ?? null,
          skills: skillsByGov.get(a.gov_id) ?? null,
          direct: directByGov.has(a.gov_id),
          appliedAt: a.created_at,
        });
      }
    }

    const sortCands = (arr: Candidate[]) =>
      [...arr].sort((x, y) => {
        const rr = readinessRank(y.readiness) - readinessRank(x.readiness);
        if (rr) return rr;
        const sr = (y.rating ?? -1) - (x.rating ?? -1);
        if (sr) return sr;
        return x.name.localeCompare(y.name);
      });

    const slotMap = new Map<string, Candidate[]>();
    for (const s of SLOTS) slotMap.set(s.key, sortCands([...(buckets.get(s.key)?.values() ?? [])]));
    const bySlot = SLOTS.map((s) => ({ slot: s, list: slotMap.get(s.key) ?? [] }));
    const total = bySlot.reduce((n, b) => n + b.list.length, 0);
    return { slotMap, bySlot, total, directCount: directByGov.size };
  }, [apps]);

  const buildText = (topOnly: boolean): string => {
    const date = new Date().toISOString().slice(0, 10);
    const lines: string[] = [`LEAD BOARD - ${date}${topOnly ? ' (ready/near)' : ''}`, ''];
    for (const { slot, list } of bySlot) {
      const rows = topOnly
        ? list.filter((c) => ['READY', 'NEAR'].some((k) => (c.readiness || '').toUpperCase().startsWith(k)))
        : list;
      if (rows.length === 0) continue;
      lines.push(slot.label.toUpperCase());
      rows.forEach((c, i) => {
        const rating = c.rating != null ? `${c.rating}*` : 'unrated';
        const pair = c.secondary ? `${c.primary} + ${c.secondary}` : c.primary || '?';
        const skills = c.skills ? ` - ${c.skills}` : '';
        lines.push(`${i + 1}. ${c.name}${c.direct ? ' [DIRECT]' : ''} (${rating}) - ${pair} - ${c.readiness || 'no readiness'}${skills}`);
      });
      lines.push('');
    }
    return lines.join('\n').trim();
  };

  const copy = async (topOnly: boolean) => {
    const text = buildText(topOnly);
    const flag = topOnly ? 'top' : 'all';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(flag);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(flag);
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setTimeout(() => setCopied(null), 1800);
  };

  if (loading) return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;
  if (error) return <p className="text-sm text-rose-400">Failed to load: {error}</p>;

  const unitAllowed = (u: Unit) => unitFilter === 'all' || unitFilter === u;
  const roleAllowed = (r: Role) => roleFilter === 'all' || roleFilter === r;

  return (
    <div>
      {/* Header: counts + copy/refresh */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-[var(--text-muted)]">
          {total} candidate slot{total === 1 ? '' : 's'} · {apps.length} application{apps.length === 1 ? '' : 's'}
          {directCount > 0 && <> · {directCount} direct</>}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => copy(true)} title="Copy READY / NEAR candidates"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#4318ff] text-white hover:bg-[#3a14e0] transition-colors">
            {copied === 'top' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{copied === 'top' ? 'Copied' : 'Copy top'}
          </button>
          <button type="button" onClick={() => copy(false)} title="Copy the whole board"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--background-secondary)] transition-colors">
            {copied === 'all' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{copied === 'all' ? 'Copied' : 'Copy all'}
          </button>
          <button type="button" onClick={() => reload()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--background-secondary)] transition-colors">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Controls: view toggle + filters */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden">
          <Seg active={view === 'tops'} onClick={() => setView('tops')}>Tops</Seg>
          <Seg active={view === 'category'} onClick={() => setView('category')}>By category</Seg>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={roleFilter === 'all'} onClick={() => setRoleFilter('all')}>All roles</Chip>
          <Chip active={roleFilter === 'rally'} onClick={() => setRoleFilter('rally')}>Rally</Chip>
          <Chip active={roleFilter === 'garrison'} onClick={() => setRoleFilter('garrison')}>Garrison</Chip>
          <span className="w-px h-4 bg-[var(--border)] mx-0.5" />
          <Chip active={unitFilter === 'all'} onClick={() => setUnitFilter('all')}>All units</Chip>
          <Chip active={unitFilter === 'infantry'} onClick={() => setUnitFilter('infantry')}>Inf</Chip>
          <Chip active={unitFilter === 'archer'} onClick={() => setUnitFilter('archer')}>Archer</Chip>
          <Chip active={unitFilter === 'cavalry'} onClick={() => setUnitFilter('cavalry')}>Cav</Chip>
          <Chip active={unitFilter === 'leadership'} onClick={() => setUnitFilter('leadership')}>Ldr</Chip>
        </div>
      </div>

      {view === 'tops' ? (
        <div className="space-y-7">
          {roleAllowed('rally') && (
            <RoleTops title="Rally Leads" role="rally" units={RALLY_UNITS.filter(unitAllowed)} slotMap={slotMap} />
          )}
          {roleAllowed('garrison') && (
            <RoleTops title="Garrison Leads" role="garrison" units={GARRISON_UNITS.filter(unitAllowed)} slotMap={slotMap} />
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {bySlot
            .filter(({ slot }) => roleAllowed(slot.role) && unitAllowed(slot.unit))
            .map(({ slot, list }) => (
              <section key={slot.key}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{slot.label}</h3>
                  <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{list.length}</span>
                </div>
                {list.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] italic px-1">No applicants</p>
                ) : (
                  <div className="rounded-xl border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
                    {list.map((c, i) => <CandidateRow key={c.govId} rank={i + 1} c={c} />)}
                  </div>
                )}
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

/** One role section (Rally or Garrison) in the Tops view: per unit, show the
 *  complete (READY) leads, or the top 2-3 candidates when none are complete. */
function RoleTops({ title, role, units, slotMap }: { title: string; role: Role; units: Unit[]; slotMap: Map<string, Candidate[]> }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-[var(--foreground)] mb-3">{title}</h2>
      {units.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">No units match the filter.</p>
      ) : (
        <div className="space-y-4">
          {units.map((unit) => {
            const list = slotMap.get(`${unit}/${role}`) ?? [];
            const complete = list.filter(isComplete);
            const showComplete = complete.length > 0;
            const rows = showComplete ? complete : list.slice(0, 3);
            return (
              <div key={unit}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-medium text-[var(--foreground)]">{UNIT_LABEL[unit]}</span>
                  {list.length === 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/30">no candidates</span>
                  ) : showComplete ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      {complete.length} complete
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30">
                      no complete lead — top {rows.length}
                    </span>
                  )}
                </div>
                {rows.length > 0 && (
                  <div className="rounded-xl border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
                    {rows.map((c, i) => <CandidateRow key={c.govId} rank={i + 1} c={c} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CandidateRow({ rank, c }: { rank: number; c: Candidate }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2.5 bg-[var(--background-card)]">
      <div className="flex items-center gap-2 min-w-0 sm:w-52 sm:flex-shrink-0">
        <span className="w-5 text-right text-xs tabular-nums text-[var(--text-muted)]">{rank}</span>
        <span className="font-medium text-sm text-[var(--foreground)] truncate" title={c.name}>{c.name}</span>
        {c.direct && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-violet-500/15 text-violet-400 border border-violet-500/30 flex-shrink-0">
            <UserPlus className="w-2.5 h-2.5" /> direct
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5 sm:w-24 sm:flex-shrink-0">
        {c.rating != null ? (
          Array.from({ length: 5 }).map((_, n) => (
            <Star key={n} className={`w-3 h-3 ${n < c.rating! ? 'text-amber-400 fill-amber-400' : 'text-[var(--text-muted)]/30'}`} />
          ))
        ) : (
          <span className="text-[10px] text-[var(--text-muted)] italic">unrated</span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-xs text-[var(--text-secondary)] truncate">
        <Crown className="inline w-3 h-3 text-amber-400/70 mr-1 -mt-0.5" />
        {c.primary || '?'}
        {c.secondary ? <span className="text-[var(--text-muted)]"> + {c.secondary}</span> : null}
      </div>
      <div className="sm:w-36 sm:flex-shrink-0">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${readinessTone(c.readiness)}`}>
          {c.readiness || 'no readiness'}
        </span>
      </div>
      {c.skills && (
        <div className="sm:w-40 sm:flex-shrink-0 text-[10px] text-[var(--text-muted)] truncate cursor-help" title={c.skills}>
          {c.skills}
        </div>
      )}
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-[#4318ff] text-white' : 'bg-[var(--background-card)] text-[var(--text-muted)] hover:text-[var(--foreground)]'}`}>
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
        active
          ? 'bg-[var(--foreground)]/10 text-[var(--foreground)] border-[var(--foreground)]/30'
          : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--foreground)]'
      }`}>
      {children}
    </button>
  );
}
