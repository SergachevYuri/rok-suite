'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Lock, RotateCcw, Search, Upload, UserPlus, Users } from 'lucide-react';
import {
  listScans,
  loadScanPlayers,
  scanPlayerToDkpPlayer,
  compareScans,
  parseMigrantCsv,
  type MigrantDecisionRow,
  type ScanCompareResult,
} from '@/lib/zero-list/scan-data';
import type { Scan, ScanPlayer } from '@/lib/kingdom/types';
import { computeScores, DEFAULT_CONFIG, type Config, type ScoredPlayer } from '@/lib/dkp/scoring';
import { loadSharedConfig } from '@/app/dkp/data';
import { bulkAddToZeroList, refreshZeroListFromScan } from '@/lib/supabase/use-migration-cases';

interface Props {
  isOfficer: boolean;
  isAdmin: boolean;
  actorName: string | null;
}

type SubTab = 'browse' | 'compare' | 'migrants' | 'location';

function fmtM(n: number | null | undefined): string {
  if (n == null || n === 0) return '—';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString();
}

function fmtDelta(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n / 1_000_000).toFixed(2)}M`;
}

function fmtScanLabel(s: Scan): string {
  const date = new Date(s.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${date} ${s.label ? `· ${s.label}` : ''} (${s.kingdom_count} players)`;
}

export function ScansTab({ isOfficer, isAdmin, actorName }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('browse');
  const [scans, setScans] = useState<Scan[]>([]);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loadingScans, setLoadingScans] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [s, cfg] = await Promise.all([listScans(), loadSharedConfig<Config>()]);
        setScans(s);
        if (cfg) setConfig(cfg);
      } catch (e) {
        console.error('Failed to load scans/config', e);
      } finally {
        setLoadingScans(false);
      }
    })();
  }, []);

  if (!isOfficer) {
    return (
      <div className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
        <Lock className="mx-auto text-[var(--text-muted)] mb-3" />
        Scans are visible at officer level and above.
      </div>
    );
  }

  return (
    <div>
      {/* Sub-tabs */}
      <nav className="mb-4 flex gap-1 border-b border-[var(--border)]">
        {([
          { id: 'browse' as const, label: 'Browse Scan', icon: Users, adminOnly: false },
          { id: 'compare' as const, label: 'Compare', icon: ArrowUp, adminOnly: false },
          { id: 'migrants' as const, label: 'Migrant CSV', icon: UserPlus, adminOnly: true },
          { id: 'location' as const, label: 'Location Upload', icon: Upload, adminOnly: true },
        ]).map((t) => {
          if (t.adminOnly && !isAdmin) return null;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                subTab === t.id
                  ? 'border-[#4318ff] text-[var(--foreground)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </nav>

      {loadingScans ? (
        <div className="text-sm text-[var(--text-muted)] py-8 text-center">Loading scans…</div>
      ) : scans.length === 0 ? (
        <div className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
          No kingdom scans uploaded yet. Upload one from the Kingdom Stats page.
        </div>
      ) : (
        <>
          {subTab === 'browse' && <BrowsePanel scans={scans} config={config} isAdmin={isAdmin} actorName={actorName} />}
          {subTab === 'compare' && <ComparePanel scans={scans} isAdmin={isAdmin} actorName={actorName} />}
          {subTab === 'migrants' && isAdmin && <MigrantsPanel scans={scans} actorName={actorName} />}
          {subTab === 'location' && isAdmin && <LocationPanel scans={scans} />}
        </>
      )}
    </div>
  );
}

// ─── Browse: single-scan view with DKP scoring ───────────────────────────────

function BrowsePanel({ scans, config, isAdmin, actorName }: { scans: Scan[]; config: Config; isAdmin: boolean; actorName: string | null }) {
  const [scanId, setScanId] = useState<number>(scans[0].id);
  const [topN, setTopN] = useState<number>(400);
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<ScanPlayer[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    loadScanPlayers(scanId)
      .then(setPlayers)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [scanId]);

  const scored = useMemo(() => {
    if (players.length === 0) return [] as ScoredPlayer[];
    const dkpPlayers = players.map(scanPlayerToDkpPlayer);
    return computeScores(dkpPlayers, { ...config, rankedTopN: topN, rankedMode: 'topN' });
  }, [players, config, topN]);

  const sorted = useMemo(() => [...scored].sort((a, b) => b.power - a.power).slice(0, topN), [scored, topN]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return sorted.filter((p) => p.username.toLowerCase().includes(q) || (qDigits.length >= 3 && String(p.characterId).includes(qDigits)));
  }, [sorted, search]);

  const playerByGov = useMemo(() => {
    const m = new Map<number, ScanPlayer>();
    for (const p of players) m.set(p.governor_id, p);
    return m;
  }, [players]);

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.characterId)));
  };

  const addSelectedToZeroList = async () => {
    const selectedScored = filtered.filter((p) => selected.has(p.characterId));
    if (selectedScored.length === 0) return;
    if (!confirm(`Add ${selectedScored.length} player${selectedScored.length === 1 ? '' : 's'} to the Zero List?`)) return;
    const entries = selectedScored.map((p) => {
      const sp = playerByGov.get(p.characterId);
      return {
        characterId: p.characterId,
        username: p.username,
        power: p.power,
        x: sp?.x ?? null,
        y: sp?.y ?? null,
        alliance: sp?.current_alliance || null,
        lastSeenScanId: scanId,
        addedBy: actorName ?? 'admin',
        reason: 'top-N browse',
      };
    });
    try {
      await bulkAddToZeroList(entries);
      setSelected(new Set());
      alert(`Added ${entries.length} entries. Some may have been skipped (already on Zero List).`);
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div>
      <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Scan:</label>
        <select
          value={scanId}
          onChange={(e) => setScanId(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm focus:outline-none"
        >
          {scans.map((s) => (
            <option key={s.id} value={s.id}>{fmtScanLabel(s)}</option>
          ))}
        </select>
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider ml-2">Top N:</label>
        <input
          type="number"
          min={1}
          max={2000}
          value={topN}
          onChange={(e) => setTopN(Math.max(1, Math.min(2000, Number(e.target.value) || 400)))}
          className="w-20 px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm font-mono focus:outline-none"
        />
        <div className="ml-auto flex items-center gap-2">
          <Search size={12} className="text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter…"
            className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm w-48"
          />
        </div>
      </section>

      {isAdmin && selected.size > 0 && (
        <section className="mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
          <span className="text-sm text-orange-300">{selected.size} selected</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 text-xs rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)]"
            >
              Clear
            </button>
            <button
              onClick={addSelectedToZeroList}
              className="px-3 py-1.5 text-xs rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-200 hover:bg-orange-500/30"
            >
              Add to Zero List
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
        <div className="overflow-auto max-h-[calc(100vh-340px)] rounded-xl">
          {loading ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading {fmtScanLabel(scans.find((s) => s.id === scanId)!) || ''}…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider shadow-[0_1px_0_var(--border)]">
                <tr>
                  {isAdmin && (
                    <th className="px-3 py-2 text-left w-8">
                      <input
                        type="checkbox"
                        checked={selected.size > 0 && selected.size === filtered.length}
                        onChange={toggleAll}
                      />
                    </th>
                  )}
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-right">Power</th>
                  <th className="px-3 py-2 text-right">P/KP Ratio</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-left">Alliance</th>
                  <th className="px-3 py-2 text-left">Coords</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const sp = playerByGov.get(p.characterId);
                  return (
                    <tr key={p.characterId} className="border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors">
                      {isAdmin && (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(p.characterId)}
                            onChange={() => {
                              const next = new Set(selected);
                              if (next.has(p.characterId)) next.delete(p.characterId);
                              else next.add(p.characterId);
                              setSelected(next);
                            }}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="text-[var(--foreground)]">{p.username}</div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono">{p.characterId}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM(p.power)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {p.kpRatio > 0 ? p.kpRatio.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {p.bandScore > 0 ? p.bandScore.toFixed(1) : '—'}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{sp?.current_alliance || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                        {sp?.x != null && sp?.y != null ? `(${sp.x}, ${sp.y})` : '—'}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                      No players match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Compare: scan A vs scan B ───────────────────────────────────────────────

function ComparePanel({ scans, isAdmin, actorName }: { scans: Scan[]; isAdmin: boolean; actorName: string | null }) {
  const [aId, setAId] = useState<number>(scans[Math.min(1, scans.length - 1)].id);
  const [bId, setBId] = useState<number>(scans[0].id);
  const [threshold, setThreshold] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanCompareResult | null>(null);
  const [view, setView] = useState<'growers' | 'shrinkers' | 'newPlayers' | 'departed'>('growers');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const runCompare = useCallback(async () => {
    if (aId === bId) {
      setResult(null);
      return;
    }
    setLoading(true);
    setSelected(new Set());
    try {
      const [pa, pb] = await Promise.all([loadScanPlayers(aId), loadScanPlayers(bId)]);
      setResult(compareScans(pa, pb, { growerThreshold: threshold }));
    } catch (e) {
      console.error('Compare failed', e);
    } finally {
      setLoading(false);
    }
  }, [aId, bId, threshold]);

  useEffect(() => {
    void runCompare();
  }, [runCompare]);

  const rows = useMemo(() => {
    if (!result) return [] as Array<{ governorId: number; name: string; alliance: string | null; left: number | null; right: number; delta: number | null; x: number | null; y: number | null }>;
    if (view === 'growers' || view === 'shrinkers') {
      return result[view].map((g) => ({
        governorId: g.governorId,
        name: g.name,
        alliance: g.alliance,
        left: g.powerA,
        right: g.powerB,
        delta: g.deltaPower,
        x: g.x,
        y: g.y,
      }));
    }
    return result[view].map((g) => ({
      governorId: g.governorId,
      name: g.name,
      alliance: g.alliance,
      left: null,
      right: g.power,
      delta: null,
      x: g.x,
      y: g.y,
    }));
  }, [result, view]);

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.governorId)));
  };

  const addSelected = async () => {
    if (selected.size === 0) return;
    const chosen = rows.filter((r) => selected.has(r.governorId));
    if (!confirm(`Add ${chosen.length} player${chosen.length === 1 ? '' : 's'} to the Zero List?`)) return;
    const reasonByView = { growers: 'power growth', shrinkers: 'power drop (pre-zero?)', newPlayers: 'new arrival', departed: 'no longer in scan' }[view];
    try {
      await bulkAddToZeroList(
        chosen.map((r) => ({
          characterId: r.governorId,
          username: r.name,
          power: r.right,
          x: r.x,
          y: r.y,
          alliance: r.alliance,
          lastSeenScanId: bId,
          addedBy: actorName ?? 'admin',
          reason: `compare: ${reasonByView}`,
        })),
      );
      setSelected(new Set());
      alert(`Added ${chosen.length} entries. Duplicates were skipped.`);
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div>
      <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">A:</label>
        <select value={aId} onChange={(e) => setAId(Number(e.target.value))} className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm focus:outline-none">
          {scans.map((s) => (<option key={s.id} value={s.id}>{fmtScanLabel(s)}</option>))}
        </select>
        <span className="text-[var(--text-muted)]">→</span>
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">B:</label>
        <select value={bId} onChange={(e) => setBId(Number(e.target.value))} className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm focus:outline-none">
          {scans.map((s) => (<option key={s.id} value={s.id}>{fmtScanLabel(s)}</option>))}
        </select>
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider ml-2">Δ threshold (M):</label>
        <input
          type="number"
          min={0}
          step={0.1}
          value={(threshold / 1_000_000).toFixed(1)}
          onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0) * 1_000_000)}
          className="w-20 px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm font-mono focus:outline-none"
        />
        <button onClick={() => void runCompare()} className="ml-auto p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]" title="Re-run compare">
          <RotateCcw size={14} />
        </button>
      </section>

      {/* View pills */}
      <section className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          { id: 'growers', label: 'Power growers', color: 'orange', icon: ArrowUp },
          { id: 'shrinkers', label: 'Power drops', color: 'amber', icon: ArrowDown },
          { id: 'newPlayers', label: 'New arrivals', color: 'cyan', icon: UserPlus },
          { id: 'departed', label: 'Departed', color: 'slate', icon: Users },
        ] as const).map((v) => {
          const count = result ? result[v.id].length : 0;
          const Icon = v.icon;
          const active = view === v.id;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`p-3 rounded-xl border text-left transition-colors ${active ? 'bg-[var(--background-secondary)] border-[var(--foreground)]/30' : 'bg-[var(--background-card)] border-[var(--border)] hover:bg-[var(--background-hover)]'}`}
            >
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] uppercase tracking-wider"><Icon size={10} /> {v.label}</div>
              <div className="text-2xl font-semibold text-[var(--foreground)] mt-1">{count}</div>
            </button>
          );
        })}
      </section>

      {isAdmin && selected.size > 0 && (
        <section className="mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
          <span className="text-sm text-orange-300">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)]">Clear</button>
            <button onClick={addSelected} className="px-3 py-1.5 text-xs rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-200 hover:bg-orange-500/30">Add to Zero List</button>
          </div>
        </section>
      )}

      {/* Results table */}
      <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
        <div className="overflow-auto max-h-[calc(100vh-440px)] rounded-xl">
          {loading ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">Comparing scans…</div>
          ) : !result ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">Pick two different scans.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider shadow-[0_1px_0_var(--border)]">
                <tr>
                  {isAdmin && (
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox" checked={selected.size > 0 && selected.size === rows.length} onChange={toggleAll} />
                    </th>
                  )}
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-right">{view === 'growers' || view === 'shrinkers' ? 'Power A' : 'Power'}</th>
                  {(view === 'growers' || view === 'shrinkers') && <th className="px-3 py-2 text-right">Power B</th>}
                  {(view === 'growers' || view === 'shrinkers') && <th className="px-3 py-2 text-right">Δ</th>}
                  <th className="px-3 py-2 text-left">Alliance</th>
                  <th className="px-3 py-2 text-left">Coords</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.governorId} className="border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors">
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.governorId)}
                          onChange={() => {
                            const next = new Set(selected);
                            if (next.has(r.governorId)) next.delete(r.governorId); else next.add(r.governorId);
                            setSelected(next);
                          }}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="text-[var(--foreground)]">{r.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">{r.governorId}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.left != null ? fmtM(r.left) : fmtM(r.right)}</td>
                    {(view === 'growers' || view === 'shrinkers') && <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM(r.right)}</td>}
                    {(view === 'growers' || view === 'shrinkers') && (
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${r.delta && r.delta > 0 ? 'text-orange-400' : 'text-amber-400'}`}>
                        {r.delta != null ? fmtDelta(r.delta) : ''}
                      </td>
                    )}
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.alliance || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{r.x != null && r.y != null ? `(${r.x}, ${r.y})` : '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={isAdmin ? 7 : 6} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">No matches in this view.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Migrants: upload CSV, match against latest scan, add non-Yes to Zero List ──

function MigrantsPanel({ scans, actorName }: { scans: Scan[]; actorName: string | null }) {
  const [scanId, setScanId] = useState<number>(scans[0].id);
  const [csvRows, setCsvRows] = useState<MigrantDecisionRow[] | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [scanPlayers, setScanPlayers] = useState<ScanPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [topN, setTopN] = useState<number>(400);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [hideYes, setHideYes] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadScanPlayers(scanId).then(setScanPlayers).catch((e) => console.error(e)).finally(() => setLoading(false));
  }, [scanId]);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const { rows, errors } = parseMigrantCsv(text);
    setCsvRows(rows);
    setCsvErrors(errors);
  };

  const decisionByGov = useMemo(() => {
    const m = new Map<number, MigrantDecisionRow['decision']>();
    for (const r of csvRows ?? []) m.set(r.governorId, r.decision);
    return m;
  }, [csvRows]);

  // Top N from the scan, joined with decision
  const candidates = useMemo(() => {
    const sorted = [...scanPlayers].sort((a, b) => b.power - a.power).slice(0, topN);
    return sorted.map((p) => ({
      governorId: p.governor_id,
      name: p.name,
      power: p.power,
      alliance: p.current_alliance || null,
      x: p.x,
      y: p.y,
      decision: decisionByGov.get(p.governor_id) ?? 'unknown',
    }));
  }, [scanPlayers, topN, decisionByGov]);

  const filtered = useMemo(() => {
    return hideYes ? candidates.filter((c) => c.decision !== 'yes') : candidates;
  }, [candidates, hideYes]);

  const counts = useMemo(() => {
    const out = { yes: 0, no: 0, maybe: 0, unknown: 0 };
    for (const c of candidates) out[c.decision]++;
    return out;
  }, [candidates]);

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.governorId)));
  };

  const addSelected = async () => {
    if (selected.size === 0) return;
    const chosen = filtered.filter((c) => selected.has(c.governorId));
    if (!confirm(`Add ${chosen.length} player${chosen.length === 1 ? '' : 's'} to the Zero List?`)) return;
    try {
      await bulkAddToZeroList(
        chosen.map((c) => ({
          characterId: c.governorId,
          username: c.name,
          power: c.power,
          x: c.x,
          y: c.y,
          alliance: c.alliance,
          lastSeenScanId: scanId,
          addedBy: actorName ?? 'admin',
          reason: `migrant ${c.decision}`,
        })),
      );
      setSelected(new Set());
      alert(`Added ${chosen.length} entries. Duplicates were skipped.`);
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div>
      <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Match against scan:</label>
        <select value={scanId} onChange={(e) => setScanId(Number(e.target.value))} className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm focus:outline-none">
          {scans.map((s) => (<option key={s.id} value={s.id}>{fmtScanLabel(s)}</option>))}
        </select>
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider ml-2">Top N:</label>
        <input
          type="number"
          min={1}
          max={2000}
          value={topN}
          onChange={(e) => setTopN(Math.max(1, Math.min(2000, Number(e.target.value) || 400)))}
          className="w-20 px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm font-mono focus:outline-none"
        />
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
          <input type="checkbox" checked={hideYes} onChange={(e) => setHideYes(e.target.checked)} />
          Hide approved (Yes)
        </label>
      </section>

      <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-3 py-1.5 rounded-lg bg-[#4318ff] text-white text-xs font-medium hover:bg-[#3a14e0] cursor-pointer">
            <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} className="hidden" />
            Upload migrant CSV
          </label>
          {csvRows && (
            <span className="text-xs text-[var(--text-secondary)]">
              {csvRows.length} rows · Yes: {counts.yes} · No: {counts.no} · Maybe: {counts.maybe} · Unknown: {counts.unknown}
            </span>
          )}
        </div>
        {csvErrors.length > 0 && (
          <ul className="mt-3 text-xs text-rose-400 list-disc pl-5">
            {csvErrors.map((e, i) => (<li key={i}>{e}</li>))}
          </ul>
        )}
        {!csvRows && csvErrors.length === 0 && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Export the migrant-applications Google Sheet as CSV. Required columns: <code className="text-[var(--text-secondary)]">Governor ID</code> and <code className="text-[var(--text-secondary)]">Decision</code> (Yes/No/Maybe).
          </p>
        )}
      </section>

      {selected.size > 0 && (
        <section className="mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
          <span className="text-sm text-orange-300">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)]">Clear</button>
            <button onClick={addSelected} className="px-3 py-1.5 text-xs rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-200 hover:bg-orange-500/30">Add to Zero List</button>
          </div>
        </section>
      )}

      <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
        <div className="overflow-auto max-h-[calc(100vh-440px)] rounded-xl">
          {loading ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading scan…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th className="px-3 py-2 text-left w-8">
                    <input type="checkbox" checked={selected.size > 0 && selected.size === filtered.length} onChange={toggleAll} />
                  </th>
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-right">Power</th>
                  <th className="px-3 py-2 text-left">Alliance</th>
                  <th className="px-3 py-2 text-left">Decision</th>
                  <th className="px-3 py-2 text-left">Coords</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.governorId} className="border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(c.governorId)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(c.governorId)) next.delete(c.governorId); else next.add(c.governorId);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-[var(--foreground)]">{c.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">{c.governorId}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM(c.power)}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{c.alliance || '—'}</td>
                    <td className="px-3 py-2">
                      <DecisionBadge d={c.decision} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{c.x != null && c.y != null ? `(${c.x}, ${c.y})` : '—'}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">No candidates.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function DecisionBadge({ d }: { d: 'yes' | 'no' | 'maybe' | 'unknown' }) {
  const styles: Record<typeof d, string> = {
    yes: 'bg-green-500/15 text-green-400 border-green-500/30',
    no: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    maybe: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    unknown: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  const labels = { yes: 'Yes', no: 'No', maybe: 'Maybe', unknown: 'Not on sheet' };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${styles[d]}`}>{labels[d]}</span>;
}

// ─── Location upload: refresh coords on existing zero-list entries ───────────

function LocationPanel({ scans }: { scans: Scan[] }) {
  const [scanId, setScanId] = useState<number>(scans[0].id);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const players = await loadScanPlayers(scanId);
      const rows = players.map((p) => ({
        governorId: p.governor_id,
        x: p.x,
        y: p.y,
        power: p.power,
        alliance: p.current_alliance || null,
      }));
      const { updated } = await refreshZeroListFromScan(scanId, rows);
      setResult(`Updated ${updated} zero-list ${updated === 1 ? 'entry' : 'entries'} with fresh coordinates and power.`);
    } catch (e) {
      setResult(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-6">
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Refresh Zero List from a scan</h3>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Match all current Zero List entries against the selected kingdom scan and update their coordinates,
        last-seen power, and current alliance. This <strong>only updates existing rows</strong> — it doesn't add or
        remove anyone.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Scan:</label>
        <select value={scanId} onChange={(e) => setScanId(Number(e.target.value))} className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm focus:outline-none">
          {scans.map((s) => (<option key={s.id} value={s.id}>{fmtScanLabel(s)}</option>))}
        </select>
        <button onClick={run} disabled={busy} className="px-3 py-1.5 rounded-lg bg-[#4318ff] text-white text-xs font-medium hover:bg-[#3a14e0] disabled:opacity-60">
          {busy ? 'Updating…' : 'Refresh coords'}
        </button>
      </div>
      {result && <div className="mt-4 text-sm text-[var(--text-secondary)]">{result}</div>}
    </section>
  );
}
