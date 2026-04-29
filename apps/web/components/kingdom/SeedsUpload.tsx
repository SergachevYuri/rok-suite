'use client';

import { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Calendar, Trash2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_PASSWORD, OFFICER_PASSWORD } from '@/lib/auth-passwords';

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

export default function SeedsUpload({ onUploaded }: { onUploaded?: () => void }) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string>('');
  const [scanDate, setScanDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [kdRows, setKdRows] = useState<ParsedKdRow[]>([]);
  const [playerRows, setPlayerRows] = useState<ParsedPlayerRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [progress, setProgress] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Auth gate ───
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState('');

  const handlePasswordSubmit = () => {
    if (password === ADMIN_PASSWORD || password === OFFICER_PASSWORD) {
      setIsUnlocked(true);
      setPassword('');
      setPwError('');
    } else {
      setPwError('Incorrect password');
      setPassword('');
    }
  };

  const reset = () => {
    setStatus('idle');
    setError('');
    setKdRows([]);
    setPlayerRows([]);
    setFileName('');
    setProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setStatus('parsing');
    setError('');
    setFileName(file.name);
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
          .from('seeds_kd_players')
          .delete()
          .eq('scan_date', date)
          .in('kingdom_id', kdsInFile);
        if (delPlayersErr) throw new Error(`Delete players failed: ${delPlayersErr.message}`);

        const { error: delStatsErr } = await supabase
          .from('seeds_kd_stats')
          .delete()
          .eq('scan_date', date)
          .in('kingdom_id', kdsInFile);
        if (delStatsErr) throw new Error(`Delete stats failed: ${delStatsErr.message}`);
      }

      const statsBatch = kdRows.map(r => ({ scan_date: date, ...r }));
      setProgress(`Uploading ${statsBatch.length} KD rows...`);
      const { error: statsErr } = await supabase
        .from('seeds_kd_stats')
        .upsert(statsBatch, { onConflict: 'scan_date,kingdom_id' });
      if (statsErr) throw new Error(`KD stats upsert failed: ${statsErr.message}`);

      const total = playerRows.length;
      let done = 0;
      const BATCH = 500;
      for (let i = 0; i < playerRows.length; i += BATCH) {
        const batch = playerRows.slice(i, i + BATCH).map(r => ({ scan_date: date, ...r }));
        const { error: err } = await supabase
          .from('seeds_kd_players')
          .upsert(batch, { onConflict: 'scan_date,kingdom_id,player_id' });
        if (err) throw new Error(`Players upsert failed at row ${i}: ${err.message}`);
        done += batch.length;
        setProgress(`Uploading players... ${done}/${total}`);
      }

      setStatus('done');
      setProgress(`${kdRows.length} KDs · ${playerRows.length} players uploaded for ${date}`);
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
  if (!isUnlocked) {
    return (
      <div className="max-w-md">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10">
              <Lock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Restricted</h3>
              <p className="text-xs text-[var(--text-muted)]">Officer or Admin password required to upload scans</p>
            </div>
          </div>

          <div className="space-y-2">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPwError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
              placeholder="Enter password"
              className="w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            {pwError && <div className="text-xs text-red-400">{pwError}</div>}
            <button
              onClick={handlePasswordSubmit}
              disabled={!password}
              className="w-full px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white text-sm font-medium disabled:opacity-50"
            >
              Unlock
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
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
              />
              <SampleTable
                title="Players"
                cols={['KD', 'player_id', 'name', 'Power', 'KP', 'cityhall', 'Rank_in_KD']}
                rows={playerRows.slice(0, 5).map(r => [r.kingdom_id, r.player_id, r.name, r.power, r.kp, r.cityhall, r.rank_in_kd])}
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

  const kd = kdSheet.map(parseKdRow).filter(Boolean) as ParsedKdRow[];
  const players = playerSheet.map(parsePlayerRow).filter(Boolean) as ParsedPlayerRow[];

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

function SampleTable({ title, cols, rows }: { title: string; cols: string[]; rows: (string | number)[][] }) {
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
                {r.map((v, j) => <td key={j} className="px-2 py-1 tabular-nums text-[var(--foreground)]">{typeof v === 'number' ? v.toLocaleString() : v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
