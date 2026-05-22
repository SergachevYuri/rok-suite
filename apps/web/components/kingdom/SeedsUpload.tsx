'use client';

import { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Calendar, Trash2 } from 'lucide-react';
import { LockedPlaceholder } from '@/components/LockedPlaceholder';
import { createClient } from '@/lib/supabase/client';
import { meetsRole, useAuthRole } from '@/lib/auth-role';
import { cleanupDepartedKingdomPlayers } from '@/lib/kingdom/scan-cleanup';
import { insertKdSnapshots } from '@/lib/kingdom/kd-snapshots';
import { KINGDOM_ID } from '@/lib/zero-list/scan-data';

type Status = 'idle' | 'parsing' | 'preview' | 'uploading' | 'done' | 'error';

interface ParsedKdRow {
  kingdom_id: number;
  power_400: number;
  total_kp: number;
  power_rank: number;
  kp_rank: number;
}

interface ParsedPlayerRow {
  kingdom_id: number;
  player_id: number;
  name: string;
  power: number;
  kp: number;
  cityhall: number;
  rank_in_kd: number;
}

const KD_COLS = ['KD', '400_power', 'total_KP', 'Power Rank', 'KP Rank'];
const PLAYER_COLS = ['KD', 'player_id', 'name', 'Power', 'KP', 'cityhall', 'Rank_in_KD'];

/** Target table set — lets the same uploader feed either the regular seeds
 *  scan tables or the parallel cross-season ones without duplicating the
 *  parsing/upsert logic. */
export interface UploadTargetTables {
  stats: string;   // e.g. 'seeds_kd_stats' or 'cross_season_kd_stats'
  players: string; // e.g. 'seeds_kd_players' or 'cross_season_kd_players'
}

const DEFAULT_TARGET: UploadTargetTables = {
  stats: 'seeds_kd_stats',
  players: 'seeds_kd_players',
};

export default function SeedsUpload({
  onUploaded,
  target = DEFAULT_TARGET,
  title,
}: {
  onUploaded?: () => void;
  /** Which Supabase tables to write to. Defaults to the regular seeds tables. */
  target?: UploadTargetTables;
  /** Optional override for the heading shown above the drop zone. */
  title?: string;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string>('');
  const [scanDate, setScanDate] = useState<string>(() => todayLocalIso());
  const [kdRows, setKdRows] = useState<ParsedKdRow[]>([]);
  const [playerRows, setPlayerRows] = useState<ParsedPlayerRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [progress, setProgress] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Auth gate (admin only). Role lives in sessionStorage via useAuthRole
  //     and is set from the single SignInButton in the header. ───
  const { role } = useAuthRole();
  const isUnlocked = meetsRole(role, 'admin');

  const reset = () => {
    setStatus('idle');
    setError('');
    setKdRows([]);
    setPlayerRows([]);
    setFileName('');
    setProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [detectedDate, setDetectedDate] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setStatus('parsing');
    setError('');
    setFileName(file.name);
    const fromName = parseDateFromFilename(file.name);
    if (fromName) {
      setScanDate(fromName);
      setDetectedDate(fromName);
    } else {
      setDetectedDate(null);
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const { kd, players } = identifyAndParse(wb);
      setKdRows(kd);
      setPlayerRows(players);
      setStatus('preview');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to parse file');
      setStatus('error');
    }
  };

  const handleUpload = async () => {
    setStatus('uploading');
    setError('');
    try {
      const supabase = createClient();
      const date = scanDate;

      if (replaceExisting) {
        const kdsInFile = Array.from(new Set([...kdRows.map(r => r.kingdom_id), ...playerRows.map(r => r.kingdom_id)]));
        setProgress(`Clearing existing rows for ${date}...`);
        const { error: delPlayersErr } = await supabase
          .from(target.players)
          .delete()
          .eq('scan_date', date)
          .in('kingdom_id', kdsInFile);
        if (delPlayersErr) throw new Error(`Delete players failed: ${delPlayersErr.message}`);

        const { error: delStatsErr } = await supabase
          .from(target.stats)
          .delete()
          .eq('scan_date', date)
          .in('kingdom_id', kdsInFile);
        if (delStatsErr) throw new Error(`Delete stats failed: ${delStatsErr.message}`);
      }

      const statsBatch = kdRows.map(r => ({ scan_date: date, ...r }));
      setProgress(`Uploading ${statsBatch.length} KD rows...`);
      const { error: statsErr } = await supabase
        .from(target.stats)
        .upsert(statsBatch, { onConflict: 'scan_date,kingdom_id' });
      if (statsErr) throw new Error(`KD stats upsert failed: ${statsErr.message}`);

      const total = playerRows.length;
      let done = 0;
      const BATCH = 500;
      for (let i = 0; i < playerRows.length; i += BATCH) {
        const batch = playerRows.slice(i, i + BATCH).map(r => ({ scan_date: date, ...r }));
        const { error: err } = await supabase
          .from(target.players)
          .upsert(batch, { onConflict: 'scan_date,kingdom_id,player_id' });
        if (err) throw new Error(`Players upsert failed at row ${i}: ${err.message}`);
        done += batch.length;
        setProgress(`Uploading players... ${done}/${total}`);
      }

      // Append a per-KD snapshot for the Comparison tab's "since last upload"
      // delta. Only for the regular seeds upload — cross-season has its own
      // tables and doesn't share the Comparison view.
      const isSeedsTarget = target.stats === 'seeds_kd_stats';
      if (isSeedsTarget && kdRows.length > 0) {
        try {
          setProgress(`Recording snapshot for ${date}...`);
          await insertKdSnapshots(date, kdRows);
        } catch (e) {
          console.warn('Snapshot insert failed', e);
        }
      }

      let cleanupSummary = '';
      // Auto-cleanup of departed K23 players — only meaningful for the regular
      // KvK upload (seeds_kd_*) AND when this scan actually contains K23 data.
      // Cross-season uploads skip this; they go to their own tables and don't
      // share the migration_cases / outreach lifecycle.
      const fileHasK23 = playerRows.some((r) => r.kingdom_id === KINGDOM_ID);
      if (isSeedsTarget && fileHasK23) {
        try {
          setProgress(`Checking for K${KINGDOM_ID} departures...`);
          const res = await cleanupDepartedKingdomPlayers(date);
          if (res.previousScanDate && res.departedCount > 0) {
            const bits: string[] = [`${res.departedCount} departed since ${res.previousScanDate}`];
            if (res.casesMigrated > 0) bits.push(`${res.casesMigrated} case(s) → migrated`);
            if (res.outreachRemoved > 0) bits.push(`${res.outreachRemoved} outreach removed`);
            if (res.crossOutreachRemoved > 0) bits.push(`${res.crossOutreachRemoved} cross-outreach removed`);
            cleanupSummary = ` · Cleanup: ${bits.join(' · ')}`;
          }
        } catch (e) {
          console.warn('Auto-cleanup failed', e);
          cleanupSummary = ' · Cleanup skipped (see console)';
        }
      }

      setStatus('done');
      setProgress(`${kdRows.length} KDs · ${playerRows.length} players uploaded for ${date}${cleanupSummary}`);
      onUploaded?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setStatus('error');
    }
  };

  const kdsInFile = useMemo(
    () => Array.from(new Set([...kdRows.map(r => r.kingdom_id), ...playerRows.map(r => r.kingdom_id)])).sort((a, b) => a - b),
    [kdRows, playerRows],
  );

  // ─── Auth gate UI ───
  // Single sign-in surface: defer to the shared LockedPlaceholder so the
  // header SignInButton is the only password entry point in the app.
  if (!isUnlocked) {
    return <LockedPlaceholder description="Admin access required to upload scans." />;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {title && (
        <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
      )}
      {/* Drop zone */}
      <div
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          status === 'idle' || status === 'error'
            ? 'border-[var(--border)] hover:border-[var(--primary)] cursor-pointer'
            : 'border-[var(--primary)]/40'
        }`}
        onClick={() => (status === 'idle' || status === 'error') && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 rounded-xl bg-[var(--primary)]/10">
            <FileSpreadsheet className="w-8 h-8 text-[var(--primary)]" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--foreground)]">
              {fileName || 'Drop your scan Excel here, or click to browse'}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              File must contain a KD aggregate sheet and a Players sheet
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {status === 'error' && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-red-400">Error</div>
            <div className="text-xs text-red-300 mt-0.5">{error}</div>
          </div>
          <button onClick={reset} className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]">Reset</button>
        </div>
      )}

      {/* Preview & confirm */}
      {(status === 'preview' || status === 'uploading' || status === 'done') && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Preview — {fileName}
            </div>
            {status !== 'uploading' && (
              <button onClick={reset} className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] flex items-center gap-1">
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Kingdoms" value={kdRows.length.toString()} color="text-indigo-400" />
            <Stat label="Players" value={playerRows.length.toLocaleString()} color="text-emerald-400" />
            <Stat label="KDs in file" value={kdsInFile.length ? kdsInFile.join(', ') : '–'} color="text-[var(--foreground)]" small />
          </div>

          {/* Date + replace toggle */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Calendar size={14} className="text-[var(--text-muted)]" />
              Scan date
              <input
                type="date"
                value={scanDate}
                onChange={(e) => setScanDate(e.target.value)}
                disabled={status === 'uploading' || status === 'done'}
                className="px-2 py-1 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm disabled:opacity-60"
              />
              {detectedDate && (
                <span className="text-xs text-emerald-400">
                  {scanDate === detectedDate ? '· detected from filename' : '· edited'}
                </span>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                disabled={status === 'uploading' || status === 'done'}
              />
              Replace existing rows for these KDs on this date
            </label>
          </div>

          {/* Sample preview tables */}
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--foreground)] py-1">
              Show sample (first 5 rows of each sheet)
            </summary>
            <div className="mt-3 space-y-3">
              <SampleTable
                title="KD aggregate"
                cols={['KD', '400_power', 'total_KP', 'Power Rank', 'KP Rank']}
                rows={kdRows.slice(0, 5).map(r => [r.kingdom_id, r.power_400, r.total_kp, r.power_rank, r.kp_rank])}
                rawCols={[0, 3, 4]}
              />
              <SampleTable
                title="Players"
                cols={['KD', 'player_id', 'name', 'Power', 'KP', 'cityhall', 'Rank_in_KD']}
                rows={playerRows.slice(0, 5).map(r => [r.kingdom_id, r.player_id, r.name, r.power, r.kp, r.cityhall, r.rank_in_kd])}
                rawCols={[0, 1, 5, 6]}
              />
            </div>
          </details>

          {/* Progress */}
          {(status === 'uploading' || status === 'done') && progress && (
            <div className={`text-xs ${status === 'done' ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
              {progress}
            </div>
          )}

          {/* Action */}
          {status === 'preview' && (
            <button
              onClick={handleUpload}
              disabled={kdRows.length === 0 || playerRows.length === 0 || !scanDate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white text-sm font-medium disabled:opacity-50"
            >
              <Upload size={14} />
              Upload to Supabase
            </button>
          )}
          {status === 'done' && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] hover:bg-[var(--background)] text-[var(--foreground)] text-sm"
            >
              Upload another file
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────────────

/** Today as YYYY-MM-DD using the user's local timezone (not UTC).
 *  Avoids the bug where uploading early in the morning local time saves the
 *  scan as "yesterday" because UTC hasn't rolled over yet. */
function todayLocalIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Try to extract a date from a filename like "Seeding_Details_28Apr.xlsx".
 * Matches "<day><MonShort>" anywhere in the filename. Year is inferred:
 * uses the current year, but if the resulting date would be in the future
 * (e.g. file from previous Dec named with month=Dec, parsed in Jan), rolls
 * back one year.
 */
function parseDateFromFilename(filename: string): string | null {
  const m = filename.toLowerCase().match(/(\d{1,2})\s*([a-z]{3,})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monKey = m[2].slice(0, 3);
  const month = MONTHS[monKey];
  if (!month || day < 1 || day > 31) return null;

  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, month - 1, day);
  // If the candidate is more than a few days in the future, assume previous year
  const diffDays = (candidate.getTime() - now.getTime()) / 86_400_000;
  if (diffDays > 7) year -= 1;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

type Row = Record<string, unknown>;

function identifyAndParse(wb: XLSX.WorkBook): { kd: ParsedKdRow[]; players: ParsedPlayerRow[] } {
  let kdSheet: Row[] | null = null;
  let playerSheet: Row[] | null = null;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: '' });
    if (json.length === 0) continue;

    const cols = Object.keys(json[0]);
    if (matchesColumns(cols, PLAYER_COLS)) playerSheet = json;
    else if (matchesColumns(cols, KD_COLS)) kdSheet = json;
  }

  if (!kdSheet) throw new Error(`KD aggregate sheet not found. Expected columns: ${KD_COLS.join(', ')}`);
  if (!playerSheet) throw new Error(`Players sheet not found. Expected columns: ${PLAYER_COLS.join(', ')}`);

  const kdRaw = kdSheet.map(parseKdRow).filter(Boolean) as ParsedKdRow[];
  const playersRaw = playerSheet.map(parsePlayerRow).filter(Boolean) as ParsedPlayerRow[];

  // Dedupe by primary key (last occurrence wins). Postgres rejects upsert
  // batches that target the same PK twice, so we collapse duplicates here.
  const kdMap = new Map<number, ParsedKdRow>();
  for (const r of kdRaw) kdMap.set(r.kingdom_id, r);
  const kd = Array.from(kdMap.values());

  const playerMap = new Map<string, ParsedPlayerRow>();
  for (const r of playersRaw) playerMap.set(`${r.kingdom_id}:${r.player_id}`, r);
  const players = Array.from(playerMap.values());

  if (kd.length === 0) throw new Error('KD sheet has no valid rows');
  if (players.length === 0) throw new Error('Players sheet has no valid rows');

  return { kd, players };
}

function matchesColumns(cols: string[], required: string[]): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_');
  const set = new Set(cols.map(norm));
  return required.every(c => set.has(norm(c)));
}

function getCol(row: Row, name: string): unknown {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_');
  const target = norm(name);
  for (const k of Object.keys(row)) {
    if (norm(k) === target) return row[k];
  }
  return undefined;
}

function toInt(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.trunc(v);
  const s = String(v).trim();
  if (!s) return 0;
  // Strip thousand separators (dots and spaces). Keep leading minus only.
  const cleaned = s.replace(/[.\s,]/g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

function parseKdRow(r: Row): ParsedKdRow | null {
  const kingdom_id = toInt(getCol(r, 'KD'));
  if (!kingdom_id) return null;
  return {
    kingdom_id,
    power_400:  toInt(getCol(r, '400_power')),
    total_kp:   toInt(getCol(r, 'total_KP')),
    power_rank: toInt(getCol(r, 'Power Rank')),
    kp_rank:    toInt(getCol(r, 'KP Rank')),
  };
}

function parsePlayerRow(r: Row): ParsedPlayerRow | null {
  const kingdom_id = toInt(getCol(r, 'KD'));
  const player_id  = toInt(getCol(r, 'player_id'));
  if (!kingdom_id || !player_id) return null;
  return {
    kingdom_id,
    player_id,
    name:       String(getCol(r, 'name') ?? '').trim(),
    power:      toInt(getCol(r, 'Power')),
    kp:         toInt(getCol(r, 'KP')),
    cityhall:   toInt(getCol(r, 'cityhall')),
    rank_in_kd: toInt(getCol(r, 'Rank_in_KD')),
  };
}

// ─────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────

function Stat({ label, value, color, small }: { label: string; value: string; color: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{label}</div>
      <div className={`${small ? 'text-xs' : 'text-lg font-bold'} ${color} truncate`} title={value}>{value}</div>
    </div>
  );
}

function SampleTable({ title, cols, rows, rawCols = [] }: {
  title: string;
  cols: string[];
  rows: (string | number)[][];
  /** Column indices that should render numbers raw (no thousand-separator formatting). */
  rawCols?: number[];
}) {
  const rawSet = new Set(rawCols);
  const fmt = (v: string | number, j: number) => {
    if (typeof v !== 'number') return v;
    return rawSet.has(j) ? String(v) : v.toLocaleString();
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{title}</div>
      <div className="rounded border border-[var(--border)] overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[var(--background-secondary)]">
            <tr>{cols.map(c => <th key={c} className="px-2 py-1.5 text-left text-[var(--text-muted)] font-medium">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                {r.map((v, j) => <td key={j} className="px-2 py-1 tabular-nums text-[var(--foreground)]">{fmt(v, j)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
