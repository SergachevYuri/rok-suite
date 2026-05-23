'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Crown, Shield, Target, Users } from 'lucide-react';
import type { AooRegistration } from '@/lib/aoo-strategy/types';
import { formatPower } from '@/lib/supabase/use-alliance-roster';

interface LeagueSheetPanelProps {
  rows: AooRegistration[];
  /** Color theme strings from the parent (text, textMuted, card, etc.) */
  theme: Record<string, string>;
}

type LaneKey = 'top' | 'mid' | 'bot' | 'sub';

interface Flag {
  level: 'warn' | 'error';
  message: string;
}

/**
 * OL sheet inspector: a sanity check panel + a Top/Mid/Bottom/Subs grouped
 * roster view, both derived purely from the parsed OL rows.
 *
 * Stays read-only — it doesn't mutate the registration list. The team builder
 * downstream still consumes the same AooRegistration[] via mergeAooRegistrations.
 */
export function LeagueSheetPanel({ rows, theme }: LeagueSheetPanelProps) {
  const summary = useMemo(() => {
    const tops: AooRegistration[] = [];
    const mids: AooRegistration[] = [];
    const bots: AooRegistration[] = [];
    const subs: AooRegistration[] = [];
    let confirmedCount = 0;
    let coordCount = 0;
    const rallyLanes: ('t' | 'b')[] = [];
    const garrisonLanes: ('t' | 'b')[] = [];
    const flags: Flag[] = [];

    for (const r of rows) {
      if (r.confirmed) confirmedCount += 1;
      if (r.coordinator) coordCount += 1;

      if (r.sub && r.lane !== null) {
        flags.push({
          level: 'error',
          message: `${r.name || '(no name)'}: marked as Sub but also has Lane "${laneLabel(r.lane)}". Pick one.`,
        });
      }

      if (!r.confirmed && hasAnyAssignment(r)) {
        flags.push({
          level: 'warn',
          message: `${r.name || '(no name)'}: has lane/leader/sub set but Confirmed is blank. Likely forgot to tick.`,
        });
      }

      if (r.rallyLeader && r.rallyLeaderLane) rallyLanes.push(r.rallyLeaderLane);
      if (r.garrisonLeader && r.garrisonLeaderLane) garrisonLanes.push(r.garrisonLeaderLane);

      // Bucket assignment: mains by lane, subs separately. Rows with neither
      // are unassigned and don't appear in the grouped roster (they're still
      // counted via Confirmed for the Match check).
      if (r.sub) {
        subs.push(r);
      } else if (r.lane === 1) tops.push(r);
      else if (r.lane === 2) mids.push(r);
      else if (r.lane === 3) bots.push(r);
    }

    // Rally / Garrison leader expectations: exactly 2, one t and one b.
    const flagLeaderShape = (label: string, lanes: ('t' | 'b')[]) => {
      const hasT = lanes.includes('t');
      const hasB = lanes.includes('b');
      if (lanes.length !== 2 || !hasT || !hasB) {
        const parts: string[] = [];
        parts.push(`expected 2 (one top, one bottom)`);
        parts.push(`got ${lanes.length}`);
        if (!hasT) parts.push('missing top');
        if (!hasB) parts.push('missing bottom');
        flags.push({
          level: 'error',
          message: `${label}: ${parts.join(' · ')}`,
        });
      }
    };
    flagLeaderShape('Rally Leaders', rallyLanes);
    flagLeaderShape('Garrison Leaders', garrisonLanes);

    const byPower = (a: AooRegistration, b: AooRegistration) => (b.power || 0) - (a.power || 0);
    tops.sort(byPower);
    mids.sort(byPower);
    bots.sort(byPower);
    subs.sort(byPower);

    const sum = tops.length + mids.length + bots.length + subs.length;

    return {
      groups: { top: tops, mid: mids, bot: bots, sub: subs },
      counts: {
        top: tops.length,
        mid: mids.length,
        bot: bots.length,
        sub: subs.length,
        sum,
        confirmed: confirmedCount,
        coord: coordCount,
      },
      match: sum === confirmedCount,
      flags,
    };
  }, [rows]);

  if (rows.length === 0) return null;

  const { counts, match, flags, groups } = summary;

  return (
    <section className={`${theme.card} border rounded-xl mb-4 sm:mb-6 p-3 sm:p-5 space-y-4`}>
      <header className="flex items-center justify-between gap-3">
        <h2 className={`text-sm sm:text-base font-semibold uppercase tracking-wider ${theme.textMuted}`}>
          OL sheet check
        </h2>
        <span
          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
            match
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-amber-500/15 text-amber-400'
          }`}
        >
          {match ? 'Counts match' : `Sum ${counts.sum} ≠ Confirmed ${counts.confirmed}`}
        </span>
      </header>

      {/* Count tiles */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
        <CountTile label="Top" value={counts.top} tone="blue" />
        <CountTile label="Mid" value={counts.mid} tone="purple" />
        <CountTile label="Bottom" value={counts.bot} tone="rose" />
        <CountTile label="Sub" value={counts.sub} tone="zinc" />
        <CountTile label="Sum" value={counts.sum} tone={match ? 'emerald' : 'amber'} />
        <CountTile label="Confirmed" value={counts.confirmed} tone={match ? 'emerald' : 'amber'} />
        <CountTile label="Coord" value={counts.coord} tone={counts.coord === 5 ? 'emerald' : 'amber'} />
      </div>

      {/* Flags */}
      {flags.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 size={14} /> All sanity checks passed.
        </div>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {flags.map((f, i) => (
            <li
              key={i}
              className={`flex items-start gap-2 ${
                f.level === 'error' ? 'text-rose-400' : 'text-amber-400'
              }`}
            >
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span className="break-words">{f.message}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Grouped roster */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GroupCard heading="Top" iconTone="text-blue-400" players={groups.top} theme={theme} />
        <GroupCard heading="Mid" iconTone="text-purple-400" players={groups.mid} theme={theme} />
        <GroupCard heading="Bottom" iconTone="text-rose-400" players={groups.bot} theme={theme} />
        <GroupCard heading="Subs" iconTone="text-zinc-400" players={groups.sub} theme={theme} />
      </div>
    </section>
  );
}

function hasAnyAssignment(r: AooRegistration): boolean {
  return r.lane !== null || r.sub || r.rallyLeader || r.garrisonLeader || r.coordinator;
}

function laneLabel(n: number | null): string {
  if (n === 1) return 'top';
  if (n === 2) return 'mid';
  if (n === 3) return 'bottom';
  return '—';
}

const TONE_CLASSES: Record<string, string> = {
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  rose: 'text-rose-400',
  zinc: 'text-[var(--text-muted)]',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
};

function CountTile({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONE_CLASSES }) {
  return (
    <div className="rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] px-2.5 py-2 text-center">
      <div className={`text-[10px] uppercase tracking-wider text-[var(--text-muted)]`}>{label}</div>
      <div className={`text-base sm:text-lg font-semibold tabular-nums ${TONE_CLASSES[tone]}`}>{value}</div>
    </div>
  );
}

interface GroupCardProps {
  heading: string;
  iconTone: string;
  players: AooRegistration[];
  theme: Record<string, string>;
}

function GroupCard({ heading, iconTone, players, theme }: GroupCardProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)]/40">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Users size={14} className={iconTone} />
          <span className="text-sm font-semibold text-[var(--foreground)]">{heading}</span>
        </div>
        <span className={`text-xs ${theme.textMuted} tabular-nums`}>{players.length}</span>
      </div>
      {players.length === 0 ? (
        <div className={`px-3 py-3 text-xs ${theme.textMuted}`}>—</div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {players.map((p) => (
            <li key={p.govId || p.name} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{p.name}</span>
              <PlayerBadges p={p} />
              <span className={`text-xs tabular-nums ${theme.textMuted} shrink-0`}>
                {p.power ? formatPower(p.power) : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlayerBadges({ p }: { p: AooRegistration }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {p.rallyLeader && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400"
          title={`Rally lead${p.rallyLeaderLane ? ` · ${p.rallyLeaderLane.toUpperCase()}` : ''}`}
        >
          <Crown size={9} /> R{p.rallyLeaderLane ? p.rallyLeaderLane.toUpperCase() : ''}
        </span>
      )}
      {p.garrisonLeader && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-400"
          title={`Garrison lead${p.garrisonLeaderLane ? ` · ${p.garrisonLeaderLane.toUpperCase()}` : ''}`}
        >
          <Shield size={9} /> G{p.garrisonLeaderLane ? p.garrisonLeaderLane.toUpperCase() : ''}
        </span>
      )}
      {p.coordinator && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300"
          title="Coordinator"
        >
          <Target size={9} /> C
        </span>
      )}
    </div>
  );
}
