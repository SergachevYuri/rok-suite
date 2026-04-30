'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Lock, RotateCcw, Trash2, X } from 'lucide-react';
import {
  type MigrationCase,
  type MigrationState,
  TERMINAL_STATES,
  listZeroListCases,
  removeFromZeroList,
  markToZero,
  markAfk,
  markException,
  confirmZeroed,
  confirmMigrated,
  resetCaseToPending,
  subscribeToZeroList,
} from '@/lib/supabase/use-migration-cases';

interface Props {
  isOfficer: boolean;
  isAdmin: boolean;
  actorName: string | null;
}

const STATE_LABELS: Record<MigrationState, string> = {
  pending: 'Notified',
  claimed: 'Notified',
  contacted: 'Notified',
  excepted: 'Excepted',
  migrated: 'Emigrated',
  marked_to_zero: 'To Zero',
  zeroed: 'Zeroed',
  afk: 'AFK',
};

const STATE_STYLES: Record<MigrationState, string> = {
  pending: 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  claimed: 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  contacted: 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  excepted: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  migrated: 'bg-green-500/15 text-green-400 border-green-500/30',
  marked_to_zero: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  zeroed: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  afk: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

function fmtM(n: number | null | undefined): string {
  if (n == null) return '—';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString();
}

export function ZeroListTab({ isOfficer, isAdmin, actorName }: Props) {
  const [cases, setCases] = useState<MigrationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'all' | MigrationState>('active');
  const [search, setSearch] = useState('');

  const refetch = useCallback(async () => {
    try {
      const rows = await listZeroListCases();
      setCases(rows);
    } catch (e) {
      console.error('Zero list refresh failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    const unsub = subscribeToZeroList(() => void refetch());
    return () => unsub();
  }, [refetch]);

  const filtered = useMemo(() => {
    let list = cases;
    if (filter === 'active') list = list.filter((c) => !TERMINAL_STATES.includes(c.state));
    else if (filter !== 'all') list = list.filter((c) => c.state === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      list = list.filter(
        (c) =>
          c.username.toLowerCase().includes(q) || (qDigits.length >= 3 && String(c.character_id).includes(qDigits)),
      );
    }
    return list;
  }, [cases, filter, search]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { active: 0, all: cases.length };
    for (const c of cases) {
      if (!TERMINAL_STATES.includes(c.state)) out.active = (out.active ?? 0) + 1;
      out[c.state] = (out[c.state] ?? 0) + 1;
    }
    return out;
  }, [cases]);

  if (loading) return <div className="text-sm text-[var(--text-muted)] py-8 text-center">Loading…</div>;

  return (
    <div>
      {/* Intro banner — explains the role differences for the Zero List */}
      {!isOfficer && (
        <section className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-300">
          You can <strong>see</strong> the kill list but only admins can add or remove from it. Use the coords to scout / attack in-game; ping an admin to mark targets zeroed.
        </section>
      )}
      {isOfficer && !isAdmin && (
        <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-3 text-sm text-[var(--text-secondary)]">
          Officers see the Zero List read-only. Admins curate the list from the Scans tab.
        </section>
      )}

      {/* Filter bar */}
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or governor ID…"
          className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--foreground)]/30 w-64"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'active' | 'all' | MigrationState)}
          className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
        >
          <option value="active">Active ({counts.active ?? 0})</option>
          <option value="all">All ({counts.all ?? 0})</option>
          <option value="marked_to_zero">To Zero ({counts.marked_to_zero ?? 0})</option>
          <option value="zeroed">Zeroed ({counts.zeroed ?? 0})</option>
          <option value="migrated">Emigrated ({counts.migrated ?? 0})</option>
          <option value="excepted">Excepted ({counts.excepted ?? 0})</option>
          <option value="afk">AFK ({counts.afk ?? 0})</option>
        </select>
        <button
          onClick={() => void refetch()}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)] transition-colors"
          title="Refresh"
        >
          <RotateCcw size={14} />
        </button>
        <span className="text-xs text-[var(--text-muted)] ml-auto">{filtered.length} shown</span>
      </section>

      {/* Table */}
      <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
        <div className="overflow-auto max-h-[calc(100vh-280px)] rounded-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20 bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider shadow-[0_1px_0_var(--border)]">
              <tr>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-right">Power</th>
                <th className="px-3 py-2 text-left">Alliance</th>
                <th className="px-3 py-2 text-left">Coords</th>
                <th className="px-3 py-2 text-left">State</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <ZeroListRow
                  key={c.id}
                  caseRow={c}
                  isAdmin={isAdmin}
                  actorName={actorName}
                  onChange={() => void refetch()}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                    {cases.length === 0
                      ? isAdmin
                        ? 'Zero list is empty. Use the Scans tab → Compare or Migrant CSV to add targets.'
                        : 'Zero list is empty. Admins populate it from the Scans tab.'
                      : 'No matches.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ZeroListRow({
  caseRow: c,
  isAdmin,
  actorName,
  onChange,
}: {
  caseRow: MigrationCase;
  isAdmin: boolean;
  actorName: string | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const isActive = !TERMINAL_STATES.includes(c.state);

  const wrap = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onChange();
    } catch (e) {
      console.error('Action failed', e);
      alert(`Action failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const copyCoords = () => {
    if (c.x == null || c.y == null) return;
    const text = `${c.x},${c.y}`;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const actor = actorName?.trim() || 'admin';

  return (
    <tr className="border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors">
      <td className="px-3 py-2">
        <div className="text-[var(--foreground)]">{c.username}</div>
        <div className="text-[10px] text-[var(--text-muted)] font-mono">{c.character_id}</div>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
        {fmtM(c.last_seen_power ?? c.power_at_open)}
      </td>
      <td className="px-3 py-2 text-[var(--text-secondary)]">
        {c.last_seen_alliance || <span className="text-[var(--text-muted)]">—</span>}
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        {c.x != null && c.y != null ? (
          <button
            onClick={copyCoords}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[var(--text-secondary)] hover:bg-[var(--background-hover)] hover:text-[var(--foreground)] transition-colors"
            title="Copy coordinates"
          >
            ({c.x}, {c.y}) {copied ? <span className="text-emerald-400">✓</span> : <Copy size={10} />}
          </button>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATE_STYLES[c.state]}`}>
          {STATE_LABELS[c.state]}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {!isAdmin && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <Lock size={10} /> view only
            </span>
          )}
          {isAdmin && isActive && c.state !== 'marked_to_zero' && (
            <button
              disabled={busy}
              onClick={() => wrap(() => markToZero(c.id, actor))}
              className="px-2 py-1 text-[11px] rounded bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25"
            >
              To Zero
            </button>
          )}
          {isAdmin && c.state === 'marked_to_zero' && (
            <button
              disabled={busy}
              onClick={() => wrap(() => confirmZeroed(c.id, actor))}
              className="px-2 py-1 text-[11px] rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25"
            >
              Confirm Zeroed
            </button>
          )}
          {isAdmin && isActive && (
            <button
              disabled={busy}
              onClick={() => wrap(() => confirmMigrated(c.id, actor))}
              className="px-2 py-1 text-[11px] rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25"
              title="Player left the kingdom"
            >
              Emigrated
            </button>
          )}
          {isAdmin && isActive && (
            <button
              disabled={busy}
              onClick={() => wrap(() => markAfk(c.id, actor))}
              className="px-2 py-1 text-[11px] rounded bg-slate-500/15 text-slate-300 border border-slate-500/30 hover:bg-slate-500/25"
            >
              AFK
            </button>
          )}
          {isAdmin && isActive && c.state !== 'excepted' && (
            <button
              disabled={busy}
              onClick={() => {
                const reason = window.prompt('Exception reason?');
                if (!reason) return;
                void wrap(() => markException(c.id, actor, reason));
              }}
              className="px-2 py-1 text-[11px] rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
            >
              Except
            </button>
          )}
          {isAdmin && !isActive && (
            <button
              disabled={busy}
              onClick={() => wrap(() => resetCaseToPending(c.id))}
              className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-[var(--foreground)]"
              title="Reset to Notified"
            >
              <RotateCcw size={10} />
            </button>
          )}
          {isAdmin && (
            <button
              disabled={busy}
              onClick={() => {
                if (!confirm(`Remove ${c.username} from the Zero List? This is a hard delete.`)) return;
                void wrap(() => removeFromZeroList(c.id));
              }}
              className="px-2 py-1 text-[11px] rounded text-rose-400 hover:bg-rose-500/10"
              title="Remove from list (delete)"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
