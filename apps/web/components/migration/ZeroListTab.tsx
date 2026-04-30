'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { CopyablePlayerCell } from '@/components/migration/CopyablePlayerCell';
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
  const [guideOpen, setGuideOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('zero-list-guide-collapsed') === '0';
  });
  const toggleGuide = () => setGuideOpen((o) => {
    const next = !o;
    try { window.localStorage.setItem('zero-list-guide-collapsed', next ? '0' : '1'); } catch {}
    return next;
  });

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
      {/* How this works — collapsible */}
      <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] overflow-hidden">
        <button
          onClick={toggleGuide}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--background-hover)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">How the Zero List works</span>
            {!guideOpen && <span className="text-[11px] text-[var(--text-muted)]">click to expand</span>}
          </div>
          <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] text-sm text-[var(--text-secondary)] space-y-4">
            <p className="text-xs text-[var(--text-muted)]">
              The Zero List is the <strong>kingdom-wide kill queue</strong>. It&apos;s a single continuous list — no deadline, no exception workflow. Power members come here to grab coords and attack. Admins manage who&apos;s on it. Cycle cases marked <em>To Zero</em> automatically appear here too (with a <span className="inline-block px-1 py-0 rounded text-[9px] font-semibold border bg-violet-500/15 text-violet-400 border-violet-500/30">from cycle</span> badge) — no manual sync needed.
            </p>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Power member, going on a hunt</div>
              <ol className="space-y-1 text-xs list-decimal pl-5">
                <li>Open this Zero List tab. The default filter is &quot;Active&quot; — that&apos;s everyone who still needs to be dealt with.</li>
                <li>Pick a target — usually highest power first, or whoever&apos;s closest to your city.</li>
                <li>Click the <strong>(x, y)</strong> cell. It copies <code className="text-[var(--text-secondary)]">x,y</code> to your clipboard.</li>
                <li>In game: open Map → click the magnifying glass → paste the coords → teleport / scout / attack.</li>
                <li>You don&apos;t mark anything here — just attack. Admins update the status when the zero is confirmed.</li>
              </ol>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Admin, target gets zeroed</div>
              <ol className="space-y-1 text-xs list-decimal pl-5">
                <li>When you commit power members to zero a target, click <strong>To Zero</strong> on their row. State turns orange — &quot;decision made, action pending&quot;.</li>
                <li>After the attack lands and the player is at near-zero power, click <strong>Confirm Zeroed</strong>. State turns red — done.</li>
                <li>If they bailed and left the kingdom before you finished, click <strong>Emigrated</strong> instead.</li>
                <li>If they messaged you and have a legit reason to stay, click <strong>Except</strong> with a reason.</li>
              </ol>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Admin, adding people</div>
              <p className="text-xs">You don&apos;t add people <em>on this tab</em> — switch to the <strong>Scans</strong> tab. The default sub-tab there is <strong>Find Candidates</strong>:</p>
              <ol className="space-y-1 text-xs list-decimal pl-5 mt-1">
                <li>Each card has a count badge. The biggest number is where the work is.</li>
                <li>Open the card, look at the rows.</li>
                <li>Check the boxes you want, click <strong>Add to Zero List</strong>.</li>
                <li>Come back here — they&apos;re queued.</li>
              </ol>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Admin, fresh coordinates before a war</div>
              <ol className="space-y-1 text-xs list-decimal pl-5">
                <li>Open <strong>Scans → Location Upload</strong>.</li>
                <li>Drop your <code className="text-[var(--text-secondary)]">scan_3923.csv</code> file. Leave &quot;Save as kingdom scan&quot; checked.</li>
                <li>Within a second, every Zero List entry whose Gov ID is in the file gets fresh coords + power + alliance.</li>
                <li>Power members can now click coords on this tab and get accurate locations.</li>
              </ol>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">What each state means</div>
              <ul className="text-xs space-y-1">
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]">Notified</span> On the list, no action yet. Default state for new additions.</li>
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-orange-500/15 text-orange-400 border-orange-500/30">To Zero</span> Decision made. Power members should attack.</li>
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-rose-500/15 text-rose-400 border-rose-500/30">Zeroed</span> Confirmed dead in-game. Done.</li>
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-green-500/15 text-green-400 border-green-500/30">Emigrated</span> Left the kingdom on their own.</li>
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-amber-500/15 text-amber-400 border-amber-500/30">Excepted</span> Admin granted a pass. They stay.</li>
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-slate-500/15 text-slate-300 border-slate-500/30">AFK</span> Inactive but staying. Treated as zero for kingdom-power calculation.</li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Things you might miss</div>
              <ul className="text-xs space-y-1 list-disc pl-5">
                <li>The (x, y) cell is a <strong>button</strong> — click it to copy. The little copy icon turns into a green checkmark for ~1.5s when it works.</li>
                <li>The Active filter (default) hides terminal cases. Switch to <em>Zeroed</em> or <em>All</em> to see history.</li>
                <li>If the (x, y) cell is empty (em dash), the player was added from auto-scrape data. Run <em>Location Upload</em> to backfill from a fresh location CSV.</li>
                <li>Power and Officer roles are <strong>both view-only</strong> here. Only Admin sees action buttons.</li>
                <li>Don&apos;t click the trash icon casually — it&apos;s a hard delete with no undo. Use a state like Excepted or AFK if you want to keep the record.</li>
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* Role-specific status line */}
      {!isOfficer && (
        <section className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300">
          You're signed in as <strong>Power</strong> — view-only on this list. Use the coords to attack; ping an admin to mark targets zeroed.
        </section>
      )}
      {isOfficer && !isAdmin && (
        <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-3 text-xs text-[var(--text-secondary)]">
          You're signed in as <strong>Officer</strong> — view-only on the Zero List. Admins curate this list from the Scans tab.
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
        <CopyablePlayerCell name={c.username} govId={c.character_id} />
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
        {c.source_kind === 'cycle' && (
          <span className="ml-1 inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold border bg-violet-500/15 text-violet-400 border-violet-500/30" title="Auto-carried from a Cycle. Resolve via the Cycle tab or via actions on this row.">
            from cycle
          </span>
        )}
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
          {isAdmin && c.source_kind === 'zero_list' && (
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
