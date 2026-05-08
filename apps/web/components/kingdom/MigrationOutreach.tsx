'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MailOpen, Search, Trash2, ChevronUp, ChevronDown, MessageSquare, Copy, Check } from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import {
  listOutreach,
  updateOutreach,
  removeOutreach,
  type OutreachEntry,
} from '@/lib/supabase/use-migration-outreach';
import { formatCompact } from '@/lib/supabase/use-kingdom-seeds';
import { OUTREACH_SAMPLE_MESSAGE } from '@/lib/kingdom/outreach-template';
import { SEASONS, useSeason, type Season } from '@/lib/kingdom/season-config';

type SortField = 'kingdom_id' | 'name' | 'power' | 'kp' | 'added_at' | 'contacted';
type SortDir = 'asc' | 'desc';

export default function MigrationOutreach() {
  return (
    <AuthGate require={['admin', 'officer']}>
      <MigrationOutreachInner />
    </AuthGate>
  );
}

function MigrationOutreachInner() {
  // ─── Season switch ───
  const { season, config, setSeason } = useSeason();
  const outreachTable = config.tables.outreach;

  // ─── Data ───
  const [entries, setEntries] = useState<OutreachEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── UI state ───
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'contacted' | 'pending'>('all');
  const [sortField, setSortField] = useState<SortField>('added_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Per-row local state for inline editing — flushed to DB on blur / debounced
  const [draft, setDraft] = useState<Map<number, Partial<OutreachEntry>>>(new Map());

  const [messageCopied, setMessageCopied] = useState(false);
  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(OUTREACH_SAMPLE_MESSAGE);
      setMessageCopied(true);
      window.setTimeout(() => setMessageCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOutreach(outreachTable);
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outreachTable]);

  const setDraftField = <K extends keyof OutreachEntry>(playerId: number, field: K, value: OutreachEntry[K]) => {
    setDraft((m) => {
      const next = new Map(m);
      const existing = next.get(playerId) ?? {};
      next.set(playerId, { ...existing, [field]: value });
      return next;
    });
  };

  const getEffective = <K extends keyof OutreachEntry>(e: OutreachEntry, field: K): OutreachEntry[K] => {
    const d = draft.get(e.player_id);
    if (d && Object.prototype.hasOwnProperty.call(d, field)) return d[field] as OutreachEntry[K];
    return e[field];
  };

  const flushField = async (
    playerId: number,
    field: 'contacted' | 'contacted_by' | 'response' | 'notes',
    value: boolean | string | null,
  ) => {
    try {
      await updateOutreach(playerId, { [field]: value } as Record<string, unknown>, outreachTable);
      // Mirror the saved value back into entries (so reload shows it without refetch).
      setEntries((rows) => rows.map((r) => (r.player_id === playerId ? { ...r, [field]: value, updated_at: new Date().toISOString() } : r)));
    } catch (e) {
      alert(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleToggleContacted = async (entry: OutreachEntry, next: boolean) => {
    setDraftField(entry.player_id, 'contacted', next);
    await flushField(entry.player_id, 'contacted', next);
  };

  const handleRemove = async (playerId: number) => {
    if (!confirm('Remove this player from the outreach list? Their tracking data will be deleted.')) return;
    try {
      await removeOutreach(playerId, outreachTable);
      setEntries((rows) => rows.filter((r) => r.player_id !== playerId));
    } catch (e) {
      alert(`Failed to remove: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const filteredAndSorted = useMemo(() => {
    let data = [...entries];
    if (filter === 'contacted') data = data.filter((e) => getEffective(e, 'contacted'));
    else if (filter === 'pending') data = data.filter((e) => !getEffective(e, 'contacted'));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((e) =>
        (e.name ?? '').toLowerCase().includes(q) ||
        String(e.player_id).includes(q) ||
        String(e.kingdom_id).includes(q) ||
        (e.contacted_by ?? '').toLowerCase().includes(q),
      );
    }

    data.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = (a.name ?? '').toLowerCase().localeCompare((b.name ?? '').toLowerCase());
      else if (sortField === 'added_at') cmp = a.added_at.localeCompare(b.added_at);
      else if (sortField === 'contacted') cmp = (Number(a.contacted) - Number(b.contacted));
      else cmp = (a[sortField] || 0) - (b[sortField] || 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, filter, search, sortField, sortDir, draft]);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(f);
      setSortDir(f === 'name' || f === 'kingdom_id' ? 'asc' : 'desc');
    }
  };

  const counts = useMemo(() => {
    const total = entries.length;
    const contacted = entries.filter((e) => e.contacted).length;
    return { total, contacted, pending: total - contacted };
  }, [entries]);

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/kingdom/ready-to-migrate"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] mb-2"
          >
            <ArrowLeft size={12} /> Back to Possible candidates
          </Link>
          <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <MailOpen size={26} className="text-emerald-400" />
            Migration outreach
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Track outreach to migration candidates. Mark when contacted, who contacted them, and the response.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] uppercase tracking-wider">
          Season
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value as Season)}
            className={`px-3 py-2 rounded-lg border text-sm normal-case tracking-normal focus:outline-none ${
              season === 'cross'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                : 'bg-[var(--background-card)] border-[var(--border)] text-[var(--foreground)]'
            }`}
          >
            {Object.values(SEASONS).map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ─── Sample outreach message ─── */}
      <details className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 overflow-hidden">
        <summary className="px-4 py-2.5 text-sm font-medium text-cyan-200 cursor-pointer hover:bg-cyan-500/10 transition-colors flex items-center gap-2">
          <MessageSquare size={14} className="text-cyan-300" />
          Sample outreach message
          <span className="text-xs text-[var(--text-muted)] font-normal">(click to expand)</span>
        </summary>
        <div className="px-4 py-3 border-t border-cyan-500/20 space-y-2">
          <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed">{OUTREACH_SAMPLE_MESSAGE}</pre>
          <div className="flex justify-end">
            <button
              onClick={copyMessage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-xs font-medium hover:bg-cyan-500/25 transition-colors"
            >
              {messageCopied ? (<><Check size={12} /> Copied!</>) : (<><Copy size={12} /> Copy to clipboard</>)}
            </button>
          </div>
        </div>
      </details>

      {/* Filter bar (sticky) */}
      <div className="sticky top-0 z-20 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 mb-4 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-sm">
            {(['all', 'pending', 'contacted'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 transition-colors ${filter === f ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background-card)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
              >
                {f === 'all' ? `All · ${counts.total}` : f === 'pending' ? `Pending · ${counts.pending}` : `Contacted · ${counts.contacted}`}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-[360px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by name, gov id, KD, or officer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)]"
            />
          </div>

          <span className="text-sm text-[var(--text-muted)]">
            {filteredAndSorted.length.toLocaleString()} entr{filteredAndSorted.length === 1 ? 'y' : 'ies'}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-4 text-sm text-red-300">{error}</div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[var(--text-muted)]">Loading...</div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)]">
            {entries.length === 0
              ? 'No players added yet. Use the Fill button on the Possible candidates page to add players here.'
              : 'No entries match the current filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--background-secondary)]">
                  <HeaderCell label="✓"        field="contacted"  sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <HeaderCell label="KD"       field="kingdom_id" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Player ID</th>
                  <HeaderCell label="Name"     field="name"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <HeaderCell label="Power"    field="power"      sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <HeaderCell label="KP"       field="kp"         sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Officer</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider min-w-[200px]">Response</th>
                  <HeaderCell label="Added"    field="added_at"   sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider"> </th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((e) => {
                  const contacted = getEffective(e, 'contacted') as boolean;
                  const officer = (getEffective(e, 'contacted_by') as string | null) ?? '';
                  const response = (getEffective(e, 'response') as string | null) ?? '';
                  return (
                    <tr key={e.player_id} className={`border-b border-[var(--border)] transition-colors ${contacted ? 'bg-emerald-500/5' : 'hover:bg-[var(--background-secondary)]'}`}>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={contacted}
                          onChange={(ev) => void handleToggleContacted(e, ev.target.checked)}
                          className="w-4 h-4 cursor-pointer"
                          title="Mark as contacted"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[var(--foreground)] tabular-nums">KD {e.kingdom_id}</td>
                      <td className="px-3 py-2.5 text-[var(--text-muted)] text-xs tabular-nums">{e.player_id}</td>
                      <td className="px-3 py-2.5 text-[var(--foreground)]">{e.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right text-indigo-400 tabular-nums">{formatCompact(e.power)}</td>
                      <td className="px-3 py-2.5 text-right text-red-400 tabular-nums">{formatCompact(e.kp)}</td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={officer}
                          placeholder="officer name…"
                          onChange={(ev) => setDraftField(e.player_id, 'contacted_by', ev.target.value)}
                          onBlur={(ev) => void flushField(e.player_id, 'contacted_by', ev.target.value.trim() || null)}
                          className="w-full px-2 py-1 rounded bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[var(--primary)] focus:bg-[var(--background-secondary)] text-sm focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={response}
                          placeholder="response…"
                          onChange={(ev) => setDraftField(e.player_id, 'response', ev.target.value)}
                          onBlur={(ev) => void flushField(e.player_id, 'response', ev.target.value.trim() || null)}
                          className="w-full px-2 py-1 rounded bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[var(--primary)] focus:bg-[var(--background-secondary)] text-sm focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-muted)] text-xs whitespace-nowrap">{e.added_at.slice(0, 10)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => void handleRemove(e.player_id)}
                          className="p-1.5 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Remove from outreach list"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function HeaderCell({ label, field, sortField, sortDir, onSort, align = 'left' }: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-3 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--foreground)] transition-colors select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field
          ? (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)
          : <ChevronDown size={14} className="opacity-20" />}
      </span>
    </th>
  );
}
