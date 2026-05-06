'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Globe, Lock, RotateCcw, Search, Sparkles, Upload, UserPlus, Users } from 'lucide-react';
import { CandidatesPanel } from '@/components/migration/CandidatesPanel';
import { GlobalCandidatesPanel } from '@/components/migration/GlobalCandidatesPanel';
import { CopyablePlayerCell } from '@/components/migration/CopyablePlayerCell';
import { SortableTh, useTableSort } from '@/components/migration/SortableTh';
import {
  listAllScans,
  loadUnifiedScanPlayers,
  unifiedToDkpPlayer,
  compareUnifiedScans,
  capabilitiesOf,
  parseMigrantCsv,
  type MigrantDecisionRow,
  type ScanRef,
  type UnifiedScanPlayer,
  type ScanCompareResult,
} from '@/lib/zero-list/scan-data';
import { computeScores, DEFAULT_CONFIG, type Config, type ScoredPlayer } from '@/lib/dkp/scoring';
import { loadSharedConfig } from '@/app/dkp/data';
import { bulkAddToZeroList, refreshZeroListFromScan } from '@/lib/supabase/use-migration-cases';

interface Props {
  isOfficer: boolean;
  isAdmin: boolean;
  actorName: string | null;
}

type SubTab = 'global' | 'candidates' | 'browse' | 'compare' | 'migrants' | 'location';

function fmtM(n: number | null | undefined): string {
  if (n == null || n === 0) return '—';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString();
}

function fmtDelta(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n / 1_000_000).toFixed(2)}M`;
}

function scanRefKey(s: ScanRef): string {
  return `${s.kind}:${s.id}`;
}

function findScanRef(scans: ScanRef[], key: string): ScanRef | undefined {
  return scans.find((s) => scanRefKey(s) === key);
}

export function ScansTab({ isOfficer, isAdmin, actorName }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('global');
  const [scans, setScans] = useState<ScanRef[]>([]);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loadingScans, setLoadingScans] = useState(true);
  const [guideOpen, setGuideOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('scans-tab-guide-collapsed') === '0';
  });
  const toggleGuide = () => setGuideOpen((o) => {
    const next = !o;
    try { window.localStorage.setItem('scans-tab-guide-collapsed', next ? '0' : '1'); } catch {}
    return next;
  });

  useEffect(() => {
    void (async () => {
      try {
        const [s, cfg] = await Promise.all([listAllScans(), loadSharedConfig<Config>()]);
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
      {/* How this works */}
      <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] overflow-hidden">
        <button
          onClick={toggleGuide}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--background-hover)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">How the Scans tab works</span>
            {!guideOpen && <span className="text-[11px] text-[var(--text-muted)]">click to expand</span>}
          </div>
          <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] text-sm text-[var(--text-secondary)] space-y-4">
            <p className="text-xs text-[var(--text-muted)]">
              The Scans tab is where you <strong>find people to put on the Zero List</strong>. The default sub-tab — <strong>Find Candidates</strong> — does most of the work for you. The other sub-tabs are for specific tasks (location refresh, raw browsing, etc.).
            </p>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Find people to add to the Zero List (the main workflow)</div>
              <ol className="space-y-1 text-xs list-decimal pl-5">
                <li>You&apos;re already on <strong>Find Candidates</strong> if you just opened the tab.</li>
                <li>Look at the four cards. Each has a number on the right — that&apos;s how many candidates need attention. Open the biggest one first.</li>
                <li>The card expands to show a table. Each row has: name, gov ID, power, alliance (if known), the Decision badge (Yes/No/Maybe/etc. from the migrant sheet), and coords (if known).</li>
                <li>Pick people. Check the box on the left of each row. Or use the header checkbox to select all.</li>
                <li>An orange action bar appears at the top. Click <strong>Add to Zero List</strong>. Confirm.</li>
                <li>Switch to the <strong>Zero List</strong> tab — they&apos;re there.</li>
              </ol>
              <p className="text-[11px] text-[var(--text-muted)] mt-2">
                If a card shows 0, you have nothing to do for that category 🎉. If you want to broaden the search, change the threshold or top-N inside the card.
              </p>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Refresh coords on the Zero List before a war</div>
              <ol className="space-y-1 text-xs list-decimal pl-5">
                <li>You need a fresh location-CSV file (the format with x/y columns — e.g. <code className="text-[var(--text-secondary)]">scan_3923.csv</code>).</li>
                <li>Click the <strong>Location Upload</strong> sub-tab.</li>
                <li>Click <strong>Choose CSV</strong>, pick the file. Leave &quot;Save as kingdom scan&quot; checked unless you have a reason not to.</li>
                <li>Wait. You&apos;ll get a green message when it&apos;s done (e.g. &quot;Updated 47 zero-list entries&quot;).</li>
                <li>Open the Zero List tab — every entry with a Gov ID in the CSV now has fresh coords.</li>
              </ol>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">When to use each sub-tab</div>
              <ul className="text-xs space-y-2 list-disc pl-5">
                <li><strong>Find Candidates</strong> — 95% of the time. The default. Use this unless you have a specific reason not to.</li>
                <li><strong>Location Upload</strong> — when you have a fresh location CSV (e.g. <code className="text-[var(--text-secondary)]">scan_3923.csv</code>) and want coords on the Zero List. The CSV is processed in-browser and not saved — re-upload whenever you want a fresh refresh.</li>
                <li><strong>Browse Scan</strong> — when you want to manually scroll through the whole kingdom (e.g. you&apos;re looking for someone specific by name).</li>
                <li><strong>Compare</strong> — when you want to drill into one specific scan-pair and see the raw growers/shrinkers/new/departed split. Find Candidates already does this in cards 1 and 2 — Compare is just a manual override.</li>
                <li><strong>Migrant CSV</strong> — when you want to see <em>everyone</em> in the top-N joined with the migrant sheet, including approved (Yes) people. Find Candidates filters Yes out automatically — Migrant CSV doesn&apos;t.</li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Three different scan things</div>
              <ul className="text-xs space-y-1.5 list-disc pl-5">
                <li><strong>Auto-scrape</strong> (in the Browse / Compare picker) — daily snapshot from the official Lilith API. Always fresh. Power, KP, CH level only. <em>No coords, no alliance, no kill breakdown.</em></li>
                <li><strong>Kingdom scan</strong> (a.k.a. Davide scan, in the Browse / Compare picker) — the rich power/stats snapshot uploaded via <em>/kingdom/migration-tracker</em>. Has kills, deaths, gathered, helps. Sometimes coords too if a location CSV was merged in at upload time.</li>
                <li><strong>Location scan</strong> (Location Upload sub-tab only — <em>not</em> in the Browse / Compare picker) — coordinate-focused CSV like <code className="text-[var(--text-secondary)]">scan_3923.csv</code>. Used purely to refresh coords on the Zero List. Ephemeral — not saved.</li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Common gotchas</div>
              <ul className="text-xs space-y-1 list-disc pl-5">
                <li>Don&apos;t see <em>Add to Zero List</em> buttons or checkboxes? You&apos;re not signed in as admin. Power and Officer can browse but not add.</li>
                <li>Migrant CSV decisions don&apos;t match what&apos;s in the sheet? Click <strong>Refresh from sheet</strong> in that sub-tab. The fetched copy is cached for 60s.</li>
                <li>Power-growers card is empty? Either no one grew, or the &quot;vs:&quot; baseline is too recent. Pick an older scan in the &quot;vs:&quot; dropdown inside the card.</li>
                <li>Adding the same person twice doesn&apos;t do anything — duplicates on the Zero List are silently skipped (matched by Gov ID).</li>
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* Sub-tabs */}
      <nav className="mb-4 flex gap-1 border-b border-[var(--border)] overflow-x-auto -mx-1 px-1 scrollbar-hide">
        {([
          { id: 'global' as const, label: 'Global', icon: Globe, adminOnly: false },
          { id: 'candidates' as const, label: 'Find Candidates', icon: Sparkles, adminOnly: false },
          { id: 'location' as const, label: 'Location Upload', icon: Upload, adminOnly: true },
          { id: 'browse' as const, label: 'Browse Scan', icon: Users, adminOnly: false },
          { id: 'compare' as const, label: 'Compare', icon: ArrowUp, adminOnly: false },
          { id: 'migrants' as const, label: 'Migrant CSV', icon: UserPlus, adminOnly: true },
        ]).map((t) => {
          if (t.adminOnly && !isAdmin) return null;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap ${
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
          {subTab === 'global' && <GlobalCandidatesPanel isAdmin={isAdmin} actorName={actorName} />}
          {subTab === 'candidates' && <CandidatesPanel isAdmin={isAdmin} actorName={actorName} />}
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

function BrowsePanel({ scans, config, isAdmin, actorName }: { scans: ScanRef[]; config: Config; isAdmin: boolean; actorName: string | null }) {
  const [scanKey, setScanKey] = useState<string>(scanRefKey(scans[0]));
  const ref = findScanRef(scans, scanKey) ?? scans[0];
  const caps = capabilitiesOf(ref.kind);
  const [topN, setTopN] = useState<number>(400);
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<UnifiedScanPlayer[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    loadUnifiedScanPlayers(ref)
      .then(setPlayers)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [scanKey]);

  const scored = useMemo(() => {
    if (players.length === 0) return [] as ScoredPlayer[];
    const dkpPlayers = players.map(unifiedToDkpPlayer);
    return computeScores(dkpPlayers, { ...config, rankedTopN: topN, rankedMode: 'topN' });
  }, [players, config, topN]);

  const sorted = useMemo(() => [...scored].sort((a, b) => b.power - a.power).slice(0, topN), [scored, topN]);

  type BSortField = 'username' | 'power' | 'kpRatio' | 'bandScore' | 'alliance';
  const sort = useTableSort<BSortField>('power', {
    username: 'asc',
    power: 'desc',
    kpRatio: 'desc',
    bandScore: 'desc',
    alliance: 'asc',
  });

  const playerByGov = useMemo(() => {
    const m = new Map<number, UnifiedScanPlayer>();
    for (const p of players) m.set(p.governorId, p);
    return m;
  }, [players]);

  const filtered = useMemo(() => {
    let list = sorted;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      list = list.filter((p) => p.username.toLowerCase().includes(q) || (qDigits.length >= 3 && String(p.characterId).includes(qDigits)));
    }
    const sign = sort.dir === 'asc' ? 1 : -1;
    const out = [...list].sort((a, b) => {
      let cmp = 0;
      if (sort.field === 'username') cmp = a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
      else if (sort.field === 'power') cmp = a.power - b.power;
      else if (sort.field === 'kpRatio') cmp = a.kpRatio - b.kpRatio;
      else if (sort.field === 'bandScore') cmp = a.bandScore - b.bandScore;
      else if (sort.field === 'alliance') {
        const aa = (playerByGov.get(a.characterId)?.alliance ?? '').toLowerCase();
        const bb = (playerByGov.get(b.characterId)?.alliance ?? '').toLowerCase();
        cmp = aa.localeCompare(bb);
      }
      if (cmp === 0) cmp = b.power - a.power;
      else cmp *= sign;
      return cmp;
    });
    return out;
  }, [sorted, search, sort.field, sort.dir, playerByGov]);

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
        alliance: sp?.alliance ?? null,
        lastSeenScanId: ref.kind === 'davide' ? Number(ref.id) : null,
        addedBy: actorName ?? 'admin',
        reason: `${ref.kind === 'davide' ? 'Davide' : 'Auto-scrape'} scan top-N browse`,
      };
    });
    try {
      const { added, skipped } = await bulkAddToZeroList(entries);
      setSelected(new Set());
      alert(`Added ${added}.${skipped > 0 ? ` ${skipped} ${skipped === 1 ? 'was' : 'were'} already on the Zero List.` : ''}`);
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div>
      <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Scan:</label>
        <select
          value={scanKey}
          onChange={(e) => setScanKey(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm focus:outline-none min-w-[280px]"
        >
          {scans.map((s) => (
            <option key={scanRefKey(s)} value={scanRefKey(s)}>{s.label}</option>
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

      {!caps.hasCoords && (
        <section className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-300">
          This scan source <strong>doesn&apos;t include coordinates, alliance, or kill/death breakdown</strong> — only power, KP, CH level. Switch to a Davide upload for full data, or run <em>Location Upload</em> after adding to refresh coords from a richer scan.
        </section>
      )}

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
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading {ref.label}…</div>
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
                  <SortableTh label="Player" field="username" active={sort.field} dir={sort.dir} onSort={sort.toggle} />
                  <SortableTh label="Power" field="power" align="right" active={sort.field} dir={sort.dir} onSort={sort.toggle} />
                  <SortableTh label="P/KP Ratio" field="kpRatio" align="right" active={sort.field} dir={sort.dir} onSort={sort.toggle} />
                  <SortableTh label="Score" field="bandScore" align="right" active={sort.field} dir={sort.dir} onSort={sort.toggle} />
                  {caps.hasAlliance && <SortableTh label="Alliance" field="alliance" active={sort.field} dir={sort.dir} onSort={sort.toggle} />}
                  {caps.hasCoords && <th className="px-3 py-2 text-left">Coords</th>}
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
                        <CopyablePlayerCell name={p.username} govId={p.characterId} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM(p.power)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {p.kpRatio > 0 ? p.kpRatio.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {p.bandScore > 0 ? p.bandScore.toFixed(1) : '—'}
                      </td>
                      {caps.hasAlliance && <td className="px-3 py-2 text-[var(--text-secondary)]">{sp?.alliance || '—'}</td>}
                      {caps.hasCoords && (
                        <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                          {sp?.x != null && sp?.y != null ? `(${sp.x}, ${sp.y})` : '—'}
                        </td>
                      )}
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

function ComparePanel({ scans, isAdmin, actorName }: { scans: ScanRef[]; isAdmin: boolean; actorName: string | null }) {
  const [aKey, setAKey] = useState<string>(scanRefKey(scans[Math.min(1, scans.length - 1)]));
  const [bKey, setBKey] = useState<string>(scanRefKey(scans[0]));
  const aRef = findScanRef(scans, aKey) ?? scans[Math.min(1, scans.length - 1)];
  const bRef = findScanRef(scans, bKey) ?? scans[0];
  const [threshold, setThreshold] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanCompareResult | null>(null);
  const [view, setView] = useState<'growers' | 'shrinkers' | 'newPlayers' | 'departed'>('growers');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const runCompare = useCallback(async () => {
    if (aKey === bKey) {
      setResult(null);
      return;
    }
    setLoading(true);
    setSelected(new Set());
    try {
      const [pa, pb] = await Promise.all([loadUnifiedScanPlayers(aRef), loadUnifiedScanPlayers(bRef)]);
      setResult(compareUnifiedScans(pa, pb, { growerThreshold: threshold }));
    } catch (e) {
      console.error('Compare failed', e);
    } finally {
      setLoading(false);
    }
  }, [aKey, bKey, aRef, bRef, threshold]);

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
      const { added, skipped } = await bulkAddToZeroList(
        chosen.map((r) => ({
          characterId: r.governorId,
          username: r.name,
          power: r.right,
          x: r.x,
          y: r.y,
          alliance: r.alliance,
          lastSeenScanId: bRef.kind === 'davide' ? Number(bRef.id) : null,
          addedBy: actorName ?? 'admin',
          reason: `compare: ${reasonByView}`,
        })),
      );
      setSelected(new Set());
      alert(`Added ${added}.${skipped > 0 ? ` ${skipped} ${skipped === 1 ? 'was' : 'were'} already on the Zero List.` : ''}`);
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div>
      <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">A:</label>
        <select value={aKey} onChange={(e) => setAKey(e.target.value)} className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm focus:outline-none min-w-[260px]">
          {scans.map((s) => (<option key={scanRefKey(s)} value={scanRefKey(s)}>{s.label}</option>))}
        </select>
        <span className="text-[var(--text-muted)]">→</span>
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">B:</label>
        <select value={bKey} onChange={(e) => setBKey(e.target.value)} className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm focus:outline-none min-w-[260px]">
          {scans.map((s) => (<option key={scanRefKey(s)} value={scanRefKey(s)}>{s.label}</option>))}
        </select>
        <label
          className="text-xs text-[var(--text-muted)] uppercase tracking-wider ml-2 cursor-help"
          title="Players whose absolute power change between A and B is smaller than this are filtered out. 0.5M ignores everyday noise; 5M shows only big movers."
        >
          Δ threshold (M):
        </label>
        <input
          type="number"
          min={0}
          step={0.1}
          value={(threshold / 1_000_000).toFixed(1)}
          onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0) * 1_000_000)}
          className="w-20 px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm font-mono focus:outline-none"
          title="Power change in millions. Players whose |power_B − power_A| is less than this don't appear in the Power Growers / Power Drops view."
        />
        <button onClick={() => void runCompare()} className="ml-auto p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]" title="Re-run compare">
          <RotateCcw size={14} />
        </button>
      </section>
      <p className="-mt-2 mb-3 text-[11px] text-[var(--text-muted)] px-1">
        <strong>Δ threshold:</strong> minimum absolute power change (in millions) for a player to appear in <em>Power growers</em> or <em>Power drops</em>. Set to 0 to see everyone with any movement; raise it to filter out everyday noise.
      </p>

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
                      <CopyablePlayerCell name={r.name} govId={r.governorId} />
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

interface RemoteMigrantRow {
  governorId: number;
  decision: 'yes' | 'no' | 'maybe' | 'unknown';
  decisionRaw: string;
  name: string;
  playerType: string;
  timeZone: string;
}

function MigrantsPanel({ scans, actorName }: { scans: ScanRef[]; actorName: string | null }) {
  const [scanKey, setScanKey] = useState<string>(scanRefKey(scans[0]));
  const ref = findScanRef(scans, scanKey) ?? scans[0];
  const [csvRows, setCsvRows] = useState<RemoteMigrantRow[] | MigrantDecisionRow[] | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [scanPlayers, setScanPlayers] = useState<UnifiedScanPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [topN, setTopN] = useState<number>(400);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [hideYes, setHideYes] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadUnifiedScanPlayers(ref).then(setScanPlayers).catch((e) => console.error(e)).finally(() => setLoading(false));
  }, [scanKey]);

  // Auto-fetch on first mount so the user doesn't have to click anything.
  useEffect(() => {
    void fetchFromSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFromSheet = async () => {
    setFetching(true);
    setCsvErrors([]);
    try {
      const res = await fetch('/api/migrant-sheet', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setCsvErrors([data.error ?? `HTTP ${res.status}`]);
        return;
      }
      setCsvRows(data.rows as RemoteMigrantRow[]);
      setFetchedAt(data.fetchedAt ?? new Date().toISOString());
      setSheetUrl(data.sheetUrl ?? null);
    } catch (e) {
      setCsvErrors([`Fetch failed: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setFetching(false);
    }
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const { rows, errors } = parseMigrantCsv(text);
    setCsvRows(rows);
    setCsvErrors(errors);
    setFetchedAt(null);
    setSheetUrl(null);
  };

  const decisionByGov = useMemo(() => {
    const m = new Map<number, 'yes' | 'no' | 'maybe' | 'unknown'>();
    for (const r of csvRows ?? []) m.set(r.governorId, r.decision);
    return m;
  }, [csvRows]);

  const rawDecisionByGov = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of csvRows ?? []) {
      // Remote rows include decisionRaw; local-uploaded rows don't.
      if ('decisionRaw' in r) m.set(r.governorId, (r as RemoteMigrantRow).decisionRaw);
    }
    return m;
  }, [csvRows]);

  // Top N from the scan, joined with decision
  const candidates = useMemo(() => {
    const sorted = [...scanPlayers].sort((a, b) => b.power - a.power).slice(0, topN);
    return sorted.map((p) => ({
      governorId: p.governorId,
      name: p.name,
      power: p.power,
      alliance: p.alliance,
      x: p.x,
      y: p.y,
      decision: decisionByGov.get(p.governorId) ?? 'unknown' as const,
      decisionRaw: rawDecisionByGov.get(p.governorId) ?? '',
    }));
  }, [scanPlayers, topN, decisionByGov, rawDecisionByGov]);

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
      const { added, skipped } = await bulkAddToZeroList(
        chosen.map((c) => ({
          characterId: c.governorId,
          username: c.name,
          power: c.power,
          x: c.x,
          y: c.y,
          alliance: c.alliance,
          lastSeenScanId: ref.kind === 'davide' ? Number(ref.id) : null,
          addedBy: actorName ?? 'admin',
          reason: `migrant ${c.decision}`,
        })),
      );
      setSelected(new Set());
      alert(`Added ${added}.${skipped > 0 ? ` ${skipped} ${skipped === 1 ? 'was' : 'were'} already on the Zero List.` : ''}`);
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div>
      <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Match against scan:</label>
        <select value={scanKey} onChange={(e) => setScanKey(e.target.value)} className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm focus:outline-none min-w-[260px]">
          {scans.map((s) => (<option key={scanRefKey(s)} value={scanRefKey(s)}>{s.label}</option>))}
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
          <button
            onClick={() => void fetchFromSheet()}
            disabled={fetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4318ff] text-white text-xs font-medium hover:bg-[#3a14e0] disabled:opacity-60"
          >
            <RotateCcw size={12} className={fetching ? 'animate-spin' : ''} />
            {fetching ? 'Fetching…' : csvRows ? 'Refresh from sheet' : 'Fetch from Google Sheet'}
          </button>
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] cursor-pointer">
            <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} className="hidden" />
            Or upload CSV
          </label>
          {csvRows && (
            <span className="text-xs text-[var(--text-secondary)]">
              {csvRows.length} rows · Yes: {counts.yes} · No: {counts.no} · Maybe: {counts.maybe} · Unknown: {counts.unknown}
            </span>
          )}
          {fetchedAt && (
            <span className="ml-auto text-[10px] text-[var(--text-muted)]">
              Fetched {new Date(fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              {sheetUrl && (
                <>
                  {' · '}
                  <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                    open sheet ↗
                  </a>
                </>
              )}
            </span>
          )}
        </div>
        {csvErrors.length > 0 && (
          <ul className="mt-3 text-xs text-rose-400 list-disc pl-5">
            {csvErrors.map((e, i) => (<li key={i}>{e}</li>))}
          </ul>
        )}
        {!csvRows && csvErrors.length === 0 && !fetching && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Auto-fetches the K23 migrant-applications sheet on load. Click Refresh after edits in the sheet, or upload a CSV manually if you need to override.
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
                      <CopyablePlayerCell name={c.name} govId={c.governorId} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM(c.power)}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{c.alliance || '—'}</td>
                    <td className="px-3 py-2">
                      <DecisionBadge d={c.decision} raw={c.decisionRaw} />
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

function DecisionBadge({ d, raw }: { d: 'yes' | 'no' | 'maybe' | 'unknown'; raw?: string }) {
  const styles: Record<typeof d, string> = {
    yes: 'bg-green-500/15 text-green-400 border-green-500/30',
    no: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    maybe: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    unknown: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  const fallback = { yes: 'Yes', no: 'No', maybe: 'Maybe', unknown: 'Not on sheet' };
  const label = raw && raw.trim().length > 0 ? raw : fallback[d];
  const title = d === 'no' && raw && /found/i.test(raw) ? 'Mapped to "No" because they should not be in K23' : raw && raw !== fallback[d] ? `Raw: ${raw}` : undefined;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${styles[d]}`} title={title}>
      {label}
    </span>
  );
}

// ─── Location upload: refresh coords on existing zero-list entries ───────────

function LocationPanel({ scans }: { scans: ScanRef[] }) {
  // Only Davide-source scans have coords. Auto-scrape (seeds) doesn't, so filter.
  const davideScans = useMemo(() => scans.filter((s) => s.kind === 'davide'), [scans]);
  const [scanKey, setScanKey] = useState<string>(davideScans[0] ? scanRefKey(davideScans[0]) : '');
  const ref = davideScans.find((s) => scanRefKey(s) === scanKey) ?? davideScans[0];
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runFromExisting = async () => {
    if (!ref) return;
    setBusy(true);
    setResult(null);
    try {
      const players = await loadUnifiedScanPlayers(ref);
      const rows = players.map((p) => ({
        governorId: p.governorId,
        name: p.name,
        x: p.x,
        y: p.y,
        power: p.power,
        alliance: p.alliance,
      }));
      const { updated, renamed } = await refreshZeroListFromScan(Number(ref.id), rows);
      const renameNote = renamed > 0 ? ` · ${renamed} renamed` : '';
      setResult(`Updated ${updated} zero-list ${updated === 1 ? 'entry' : 'entries'} from ${ref.label}.${renameNote}`);
    } catch (e) {
      setResult(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runFromCsv = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      const { parseSnapshotCSV } = await import('@/lib/kingdom/parse');
      const parsed = parseSnapshotCSV(text);
      if (parsed.length === 0) {
        setResult('CSV had no valid rows. Expected columns: player_id, player_name, player_power, player_kills, player_ch, player_alliance, x, y, shield_time_left.');
        return;
      }
      const rows = parsed.map((p) => ({
        governorId: p.playerId,
        name: p.playerName,
        x: p.x,
        y: p.y,
        power: p.playerPower,
        alliance: p.playerAlliance || null,
      }));

      // Persist to location_scans so coords surface in Find Candidates / Top 400.
      // This is separate from kingdom_scans on purpose.
      let savedMsg = '';
      try {
        const { uploadLocationScan } = await import('@/lib/zero-list/scan-data');
        const points = parsed.map((p) => ({
          governorId: p.playerId,
          name: p.playerName,
          power: p.playerPower,
          kills: p.playerKills,
          alliance: p.playerAlliance || null,
          x: p.x,
          y: p.y,
          castleHall: p.playerCh,
          shieldTimeLeft: p.shieldTimeLeft || null,
        }));
        const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const id = await uploadLocationScan(`${today} · ${file.name}`, points, null);
        savedMsg = ` Saved as location scan #${id} — coords now available in Find Candidates.`;
      } catch (e) {
        savedMsg = ` (Couldn't save the location scan: ${e instanceof Error ? e.message : String(e)} — coord refresh on Zero List still ran.)`;
      }

      const { updated, renamed } = await refreshZeroListFromScan(null, rows);
      const renameNote = renamed > 0 ? ` ${renamed} ${renamed === 1 ? 'name was' : 'names were'} updated.` : '';
      setResult(
        `Parsed ${parsed.length} rows from ${file.name}. Updated ${updated} Zero List ${updated === 1 ? 'entry' : 'entries'} with fresh coordinates, power, and alliance.${renameNote}${savedMsg}`,
      );
    } catch (e) {
      setResult(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Direct CSV upload — primary path */}
      <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-6">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Upload location scan CSV</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-2">
          Drop a location-scan CSV (e.g. <code className="text-[var(--text-secondary)]">scan_3923.csv</code>). Matches by Gov ID and pushes coordinates + last-seen power + alliance to every Zero List entry. <strong>Only updates existing rows</strong> — doesn&apos;t add or remove anyone.
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Saved separately from kingdom scans (in <code className="text-[var(--text-secondary)]">location_scans</code>). The latest one is auto-applied to <em>Find Candidates</em> rows so the Top 400 list shows coordinates. Location scans and kingdom (Davide) scans are <strong>different things</strong> — they don&apos;t replace each other and this won&apos;t appear in Browse / Compare.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-3 py-1.5 rounded-lg bg-[#4318ff] text-white text-xs font-medium hover:bg-[#3a14e0] cursor-pointer disabled:opacity-60">
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void runFromCsv(f); e.target.value = ''; }}
              className="hidden"
            />
            {busy ? 'Working…' : 'Choose CSV'}
          </label>
          <span className="text-xs text-[var(--text-muted)]">columns: <code className="text-[var(--text-secondary)]">player_id, player_name, player_power, player_kills, player_ch, player_alliance, x, y, shield_time_left</code></span>
        </div>
      </section>

      {/* Existing-scan refresh — kept as alternate for kingdom scans that happen to have coords */}
      {davideScans.length > 0 && (
        <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-6">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Or refresh from a saved kingdom scan</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            If a Migration-Tracker upload merged a location CSV into its kingdom-stats snapshot, that <code className="text-[var(--text-secondary)]">kingdom_scans</code> row carries coords too. Pick it here to refresh Zero-List coords without re-uploading.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Kingdom scan:</label>
            <select
              value={scanKey}
              onChange={(e) => setScanKey(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm focus:outline-none min-w-[260px]"
            >
              {davideScans.map((s) => (
                <option key={scanRefKey(s)} value={scanRefKey(s)}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={runFromExisting}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] disabled:opacity-60"
            >
              {busy ? 'Updating…' : 'Refresh from saved scan'}
            </button>
          </div>
        </section>
      )}

      {result && (
        <section className={`rounded-xl border px-4 py-3 text-sm ${result.startsWith('Failed') ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
          {result}
        </section>
      )}
    </div>
  );
}
