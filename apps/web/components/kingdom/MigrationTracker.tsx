'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Upload,
  Lock,
  Unlock,
  Search,
  Users,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ShieldX,
  Download,
  Loader2,
  AlertTriangle,
  MapPin,
  FileSpreadsheet,
  Globe,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  RefreshCw,
} from 'lucide-react';
import { useLatestScan, uploadScan, updateRosterFromScan, getPreMigrationCount, fetchPreMigrationIds, savePreMigrationIds, refreshMigrantsOnScan, fetchRosterLookup, fetchPlayerOverrides, setPlayerOverride, removePlayerOverride } from '@/lib/supabase/use-kingdom-scan';
import { parseSnapshotCSV, parseKingdomXLSX, fetchMigrantSheet, fetchInactivesSheet } from '@/lib/kingdom/parse';
import { mergePlayers } from '@/lib/kingdom/merge';
import { MIGRANT_SHEET_URL, INACTIVES_SHEET_URL, formatNumber, toSorterTag, normalizeName } from '@/lib/kingdom/config';
import { matchesSearch } from '@/lib/search';
import type { MigrationStatus, ScanPlayer, SnapshotRow, KingdomExportRow, MigrantRow, InactiveRow, OfficerStatus, PlayerOverride } from '@/lib/kingdom/types';

const EDITOR_PASSWORD = 'carn-dum';
const OFFICER_PASSWORD = 'angmar';

const STATUS_COLORS: Record<MigrationStatus, { bg: string; text: string; border: string }> = {
  ORIGINAL: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30' },
  ACCEPTED: { bg: 'bg-sky-500/10', text: 'text-sky-500', border: 'border-sky-500/30' },
  PENDING: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/30' },
  INACTIVE: { bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'border-orange-500/30' },
  ILLEGAL: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/30' },
};

const STATUS_ICONS: Record<MigrationStatus, React.ReactNode> = {
  ORIGINAL: <ShieldCheck size={14} />,
  ACCEPTED: <ShieldCheck size={14} />,
  PENDING: <ShieldQuestion size={14} />,
  INACTIVE: <ShieldAlert size={14} />,
  ILLEGAL: <ShieldX size={14} />,
};

const STATUS_LABELS: Record<MigrationStatus, string> = {
  ORIGINAL: 'Original',
  ACCEPTED: 'Accepted',
  PENDING: 'Pending',
  INACTIVE: 'Inactive',
  ILLEGAL: 'Unverified',
};

type SortField = 'name' | 'power' | 'kill_points' | 'current_alliance' | 'migration_status';
type SortDir = 'asc' | 'desc';

export default function MigrationTracker() {
  const { scan, players, loading, refetch } = useLatestScan();

  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOfficer, setIsOfficer] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');

  // Upload state
  const [snapshotFile, setSnapshotFile] = useState<File | null>(null);
  const [kingdomFile, setKingdomFile] = useState<File | null>(null);
  const [preMigrationFile, setPreMigrationFile] = useState<File | null>(null);
  const [migrantStatus, setMigrantStatus] = useState<'idle' | 'fetching' | 'done' | 'error'>('idle');
  const [migrantCount, setMigrantCount] = useState(0);
  const [migrantData, setMigrantData] = useState<MigrantRow[]>([]);
  const [inactiveData, setInactiveData] = useState<InactiveRow[]>([]);
  const [uploadLabel, setUploadLabel] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [storedPreMigCount, setStoredPreMigCount] = useState<number | null>(null);

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState('');

  // View state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MigrationStatus | 'ALL'>('ALL');
  const [allianceFilter, setAllianceFilter] = useState('ALL');
  const [sortField, setSortField] = useState<SortField>('power');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [cardFilter, setCardFilter] = useState<MigrationStatus | null>(null);

  // Officer review state
  const [overrides, setOverrides] = useState<Map<number, PlayerOverride>>(new Map());
  const [reviewFilter, setReviewFilter] = useState(false); // show only unreviewed flagged players

  // Load stored pre-migration count and officer overrides on mount
  useEffect(() => {
    getPreMigrationCount().then(setStoredPreMigCount);
    fetchPlayerOverrides().then(setOverrides);
  }, []);

  // Derived data
  const alliances = useMemo(() => {
    const tags = new Set(players.map(p => p.current_alliance).filter(Boolean));
    return Array.from(tags).sort();
  }, [players]);

  const statusCounts = useMemo(() => {
    const counts = { ORIGINAL: 0, ACCEPTED: 0, PENDING: 0, INACTIVE: 0, ILLEGAL: 0 };
    for (const p of players) {
      if (p.migration_status in counts) {
        counts[p.migration_status as MigrationStatus]++;
      }
    }
    return counts;
  }, [players]);

  const reviewProgress = useMemo(() => {
    const reviewable = players.filter(p => p.migration_status === 'ILLEGAL' || p.migration_status === 'INACTIVE');
    const reviewed = reviewable.filter(p => overrides.has(p.governor_id));
    return { total: reviewable.length, reviewed: reviewed.length };
  }, [players, overrides]);

  const filteredPlayers = useMemo(() => {
    let result = [...players];

    // Officer review filter: only unreviewed ILLEGAL/INACTIVE players
    if (reviewFilter) {
      result = result.filter(p =>
        (p.migration_status === 'ILLEGAL' || p.migration_status === 'INACTIVE')
        && !overrides.has(p.governor_id)
      );
    } else if (cardFilter) {
      result = result.filter(p => p.migration_status === cardFilter);
    } else if (statusFilter !== 'ALL') {
      result = result.filter(p => p.migration_status === statusFilter);
    }

    if (allianceFilter !== 'ALL') {
      result = result.filter(p => p.current_alliance === allianceFilter);
    }

    if (search.trim()) {
      result = result.filter(p => matchesSearch(search, p.name, p.governor_id));
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'power': cmp = a.power - b.power; break;
        case 'kill_points': cmp = a.kill_points - b.kill_points; break;
        case 'current_alliance': cmp = (a.current_alliance || '').localeCompare(b.current_alliance || ''); break;
        case 'migration_status': cmp = a.migration_status.localeCompare(b.migration_status); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [players, search, statusFilter, allianceFilter, sortField, sortDir, cardFilter, reviewFilter, overrides]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handlePasswordSubmit = () => {
    if (password === EDITOR_PASSWORD) {
      setIsAdmin(true);
      setIsOfficer(true);
      setShowPasswordPrompt(false);
      setPassword('');
    } else if (password === OFFICER_PASSWORD) {
      setIsOfficer(true);
      setShowPasswordPrompt(false);
      setPassword('');
    }
  };

  const handleFetchMigrants = async () => {
    setMigrantStatus('fetching');
    try {
      const [migrants, inactives] = await Promise.all([
        fetchMigrantSheet(MIGRANT_SHEET_URL),
        fetchInactivesSheet(INACTIVES_SHEET_URL),
      ]);
      setMigrantData(migrants);
      setInactiveData(inactives);
      setMigrantCount(migrants.length);
      setMigrantStatus('done');
    } catch {
      setMigrantStatus('error');
    }
  };

  const handleRefreshFromSheet = async () => {
    if (!scan) return;
    setIsRefreshing(true);
    setRefreshProgress('Fetching migrant + inactives sheets...');
    try {
      const [migrants, inactives] = await Promise.all([
        fetchMigrantSheet(MIGRANT_SHEET_URL),
        fetchInactivesSheet(INACTIVES_SHEET_URL),
      ]);
      setRefreshProgress(`Got ${migrants.length} migrants, ${inactives.length} inactives. Updating...`);
      const result = await refreshMigrantsOnScan(scan.id, migrants, inactives);
      setRefreshProgress(`Done! ${result.updated} players updated, ${result.statusChanges} status changes.`);
      await refetch();
    } catch (err) {
      setRefreshProgress(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUpload = async () => {
    if (!snapshotFile) return;
    setIsUploading(true);

    try {
      // Parse snapshot
      setUploadProgress('Parsing snapshot CSV...');
      const snapshotText = await snapshotFile.text();
      const snapshot: SnapshotRow[] = parseSnapshotCSV(snapshotText);

      // Parse kingdom XLSX
      let kingdom: KingdomExportRow[] = [];
      if (kingdomFile) {
        setUploadProgress('Parsing kingdom export...');
        const buf = await kingdomFile.arrayBuffer();
        kingdom = await parseKingdomXLSX(buf);
      }

      // Parse pre-migration XLSX or load stored IDs
      let preMigration: KingdomExportRow[] = [];
      let storedIds: Set<number> | null = null;
      if (preMigrationFile) {
        setUploadProgress('Parsing pre-migration data...');
        const buf = await preMigrationFile.arrayBuffer();
        preMigration = await parseKingdomXLSX(buf);
      } else if (storedPreMigCount && storedPreMigCount > 0) {
        setUploadProgress(`Loading stored pre-migration data (${storedPreMigCount.toLocaleString()} governors)...`);
        storedIds = await fetchPreMigrationIds();
      }

      // Fetch roster — known members are always ORIGINAL (match by ID or name)
      setUploadProgress('Loading roster data...');
      const roster = await fetchRosterLookup();

      // Merge pre-migration sources: stored/uploaded IDs + roster IDs
      let preMigrationSet: Set<number>;
      if (storedIds) {
        preMigrationSet = storedIds;
      } else if (preMigration.length > 0) {
        preMigrationSet = new Set(preMigration.map(r => r.governorId));
      } else {
        preMigrationSet = new Set<number>();
      }
      for (const id of roster.ids) preMigrationSet.add(id);

      // Merge
      setUploadProgress('Merging player data...');
      const merged = mergePlayers(snapshot, kingdom, migrantData, preMigrationSet, inactiveData);

      // Post-process: roster members are ALWAYS original (roster is curated by leadership)
      // Checks both governor_id and name to cover roster members without governor_id set.
      for (const player of merged) {
        if (player.migrationStatus === 'ORIGINAL') continue;
        const onRosterById = roster.ids.has(player.governorId);
        const norm = normalizeName(player.name);
        const onRosterByName = !onRosterById && norm ? roster.normalizedNames.has(norm) : false;
        if (onRosterById || onRosterByName) {
          player.migrationStatus = 'ORIGINAL';
          player.existedPreMigration = true;
          player.isMigrant = false;
          player.migrantAccepted = false;
        }
      }

      // Post-process: apply officer overrides (cleared → ORIGINAL)
      const uploadOverrides = await fetchPlayerOverrides();
      for (const player of merged) {
        const override = uploadOverrides.get(player.governorId);
        if (override?.officer_status === 'cleared' && player.migrationStatus !== 'ORIGINAL') {
          player.migrationStatus = 'ORIGINAL';
          player.isMigrant = false;
          player.migrantAccepted = false;
        }
      }

      // Upload
      setUploadProgress(`Uploading ${merged.length} players to database...`);
      const label = uploadLabel || `Scan ${new Date().toLocaleDateString()}`;
      const scanId = await uploadScan(label, merged, {
        snapshot: snapshot.length,
        kingdom: kingdom.length,
        migrant: migrantData.length,
        preMigration: preMigrationSet.size,
      });

      if (scanId) {
        // Always update pre-migration IDs with snapshot + roster IDs
        // so the stored set grows to include every player seen in the kingdom.
        setUploadProgress('Updating pre-migration baseline...');
        const idsToSave = new Set(preMigrationSet);
        for (const s of snapshot) {
          if (s.playerId) idsToSave.add(s.playerId);
        }
        for (const id of roster.ids) idsToSave.add(id);
        await savePreMigrationIds(idsToSave);
        setStoredPreMigCount(idsToSave.size);

        // Update alliance roster with power data (not KP — kingdom exports give cumulative KP)
        setUploadProgress('Updating roster with latest power data...');
        const rosterResult = await updateRosterFromScan(merged);
        if (rosterResult) {
          console.log(`Roster updated: ${rosterResult.updated} updated, ${rosterResult.added} added`);
        }

        setUploadProgress('Done! Refreshing data...');
        await refetch();
        // Reset upload form
        setSnapshotFile(null);
        setKingdomFile(null);
        setPreMigrationFile(null);
        setMigrantData([]);
        setMigrantCount(0);
        setMigrantStatus('idle');
        setUploadLabel('');
      } else {
        setUploadProgress('Upload failed. Check console for errors.');
      }
    } catch (err) {
      setUploadProgress(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleOverride = useCallback(async (governorId: number, status: OfficerStatus | null, note?: string) => {
    if (status === null) {
      const success = await removePlayerOverride(governorId);
      if (success) {
        setOverrides(prev => {
          const next = new Map(prev);
          next.delete(governorId);
          return next;
        });
      }
    } else {
      const success = await setPlayerOverride(governorId, status, note);
      if (success) {
        setOverrides(prev => {
          const next = new Map(prev);
          next.set(governorId, {
            governor_id: governorId,
            officer_status: status,
            officer_note: note || '',
            updated_at: new Date().toISOString(),
          });
          return next;
        });
      }
    }
  }, []);

  const handleExportCSV = () => {
    const headers = ['Governor ID', 'Name', 'Power', 'Kill Points', 'Alliance', 'Migration Status', 'X', 'Y', 'Starting KD', 'Group', 'Recruiter'];
    const rows = filteredPlayers.map(p => [
      p.governor_id,
      `"${p.name}"`,
      p.power,
      p.kill_points,
      p.current_alliance,
      STATUS_LABELS[p.migration_status as MigrationStatus] || p.migration_status,
      p.x ?? '',
      p.y ?? '',
      p.starting_kd ?? '',
      p.migrant_group ?? '',
      p.migrant_recruiter ?? '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `migration-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const FileDropZone = ({ label, accepted, file, onFile, icon, hint }: {
    label: string;
    accepted: string;
    file: File | null;
    onFile: (f: File) => void;
    icon: React.ReactNode;
    hint?: React.ReactNode;
  }) => {
    const [dragActive, setDragActive] = useState(false);

    return (
      <div
        className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
          dragActive
            ? 'border-amber-500 bg-amber-500/10'
            : file
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-[var(--border)] hover:border-[var(--text-muted)]'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = accepted;
          input.onchange = (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) onFile(f);
          };
          input.click();
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <div className={`${file ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
            {icon}
          </div>
          <div className="text-sm font-medium text-[var(--foreground)]">{label}</div>
          {file ? (
            <div className="text-xs text-emerald-500">{file.name}</div>
          ) : (
            <div className="text-xs text-[var(--text-muted)]">Drop file or click to browse</div>
          )}
          {hint && !file && <div className="mt-1">{hint}</div>}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--foreground)]">Migration Tracker</h1>
            {scan && (
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {scan.label} &middot; {new Date(scan.created_at).toLocaleDateString()} &middot; {players.length} players
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[var(--background-secondary)] text-[var(--text-secondary)] hover:text-[var(--foreground)] border border-[var(--border)] transition-colors"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            {isAdmin ? (
              <button
                onClick={() => { setIsAdmin(false); setIsOfficer(false); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-amber-500/10 text-amber-500 border border-amber-500/30 transition-colors"
              >
                <Unlock size={16} />
                <span className="hidden sm:inline">Admin Mode</span>
              </button>
            ) : isOfficer ? (
              <button
                onClick={() => setIsOfficer(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-sky-500/10 text-sky-400 border border-sky-500/30 transition-colors"
              >
                <Unlock size={16} />
                <span className="hidden sm:inline">Officer Mode</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowPasswordPrompt(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[var(--background-secondary)] text-[var(--text-secondary)] hover:text-[var(--foreground)] border border-[var(--border)] transition-colors"
                >
                  <Lock size={16} />
                  <span className="hidden sm:inline">Login</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Password prompt */}
        {showPasswordPrompt && (
          <div className="mb-6 p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
            <div className="flex items-center gap-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                placeholder="Enter password..."
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-amber-500/50"
                autoFocus
              />
              <button
                onClick={handlePasswordSubmit}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                Unlock
              </button>
              <button
                onClick={() => { setShowPasswordPrompt(false); setPassword(''); }}
                className="px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Admin Upload Section */}
        {isAdmin && (
          <div className="mb-8 p-5 rounded-xl bg-[var(--background-card)] border border-amber-500/30">
            <h2 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
              <Upload size={18} className="text-amber-500" />
              Upload Scan Data
            </h2>

            <div className="mb-4">
              <input
                type="text"
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
                placeholder="Scan label (e.g. Feb 12 scan)..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <FileDropZone
                label="Snapshot CSV"
                accepted=".csv"
                file={snapshotFile}
                onFile={setSnapshotFile}
                icon={<FileSpreadsheet size={24} />}
              />
              <FileDropZone
                label="Kingdom Export XLSX"
                accepted=".xlsx,.xls"
                file={kingdomFile}
                onFile={setKingdomFile}
                icon={<FileSpreadsheet size={24} />}
              />
              <FileDropZone
                label="Pre-Migration XLSX (optional)"
                accepted=".xlsx,.xls"
                file={preMigrationFile}
                onFile={setPreMigrationFile}
                icon={<FileSpreadsheet size={24} />}
                hint={storedPreMigCount != null && storedPreMigCount > 0 ? (
                  <div className="text-xs text-emerald-500 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {storedPreMigCount.toLocaleString()} IDs stored — upload new file to replace
                  </div>
                ) : storedPreMigCount === 0 ? (
                  <div className="text-xs text-[var(--text-muted)]">No stored data</div>
                ) : null}
              />

              {/* Migrant sheet fetch */}
              <div
                className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
                  migrantStatus === 'done'
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : migrantStatus === 'error'
                      ? 'border-red-500/40 bg-red-500/5'
                      : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                }`}
                onClick={handleFetchMigrants}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={`${migrantStatus === 'done' ? 'text-emerald-500' : migrantStatus === 'error' ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
                    {migrantStatus === 'fetching' ? <Loader2 size={24} className="animate-spin" /> : <Globe size={24} />}
                  </div>
                  <div className="text-sm font-medium text-[var(--foreground)]">Migrant Sheet</div>
                  {migrantStatus === 'done' ? (
                    <div className="text-xs text-emerald-500">{migrantCount} migrants, {inactiveData.length} inactives loaded</div>
                  ) : migrantStatus === 'error' ? (
                    <div className="text-xs text-red-500">Failed to fetch — click to retry</div>
                  ) : migrantStatus === 'fetching' ? (
                    <div className="text-xs text-[var(--text-muted)]">Fetching...</div>
                  ) : (
                    <div className="text-xs text-[var(--text-muted)]">Click to fetch from Google Sheets</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleUpload}
                disabled={!snapshotFile || isUploading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Upload & Process
              </button>
              {uploadProgress && (
                <span className="text-sm text-[var(--text-secondary)]">{uploadProgress}</span>
              )}
            </div>

            {/* Quick refresh from Google Sheet */}
            {scan && (
              <>
                <div className="border-t border-[var(--border)] my-4" />
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRefreshFromSheet}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-sky-500/10 text-sky-400 border border-sky-500/30 hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isRefreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Refresh Migrant Statuses
                  </button>
                  <span className="text-xs text-[var(--text-muted)]">
                    Fetch the Google Sheet and update statuses without re-uploading files
                  </span>
                </div>
                {refreshProgress && (
                  <div className="mt-2 text-sm text-[var(--text-secondary)]">{refreshProgress}</div>
                )}
              </>
            )}
          </div>
        )}

        {/* Summary Cards */}
        {players.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 sm:gap-3 mb-6">
            <SummaryCard
              label="Total"
              count={players.length}
              icon={<Users size={18} />}
              color="text-[var(--foreground)]"
              bg="bg-[var(--background-secondary)]"
              onClick={() => setCardFilter(null)}
              active={cardFilter === null}
              activeColor="border-[var(--foreground)]/50"
              className="col-span-2 sm:col-span-1"
              description="All players in scan"
            />
            <SummaryCard
              label="Originals"
              count={statusCounts.ORIGINAL}
              icon={<ShieldCheck size={18} />}
              color="text-emerald-500"
              bg="bg-emerald-500/10"
              onClick={() => setCardFilter(cardFilter === 'ORIGINAL' ? null : 'ORIGINAL')}
              active={cardFilter === 'ORIGINAL'}
              activeColor="border-emerald-500/50"
              ringColor="ring-emerald-500/20"
              description="Existed before migration"
            />
            <SummaryCard
              label="Accepted"
              count={statusCounts.ACCEPTED}
              icon={<ShieldCheck size={18} />}
              color="text-sky-500"
              bg="bg-sky-500/10"
              onClick={() => setCardFilter(cardFilter === 'ACCEPTED' ? null : 'ACCEPTED')}
              active={cardFilter === 'ACCEPTED'}
              activeColor="border-sky-500/50"
              ringColor="ring-sky-500/20"
              description="Approved on migrant sheet"
            />
            <SummaryCard
              label="Pending"
              count={statusCounts.PENDING}
              icon={<ShieldQuestion size={18} />}
              color="text-amber-500"
              bg="bg-amber-500/10"
              onClick={() => setCardFilter(cardFilter === 'PENDING' ? null : 'PENDING')}
              active={cardFilter === 'PENDING'}
              activeColor="border-amber-500/50"
              ringColor="ring-amber-500/20"
              description="On sheet, not yet approved"
            />
            <SummaryCard
              label="Inactive"
              count={statusCounts.INACTIVE}
              icon={<ShieldAlert size={18} />}
              color="text-orange-500"
              bg="bg-orange-500/10"
              onClick={() => setCardFilter(cardFilter === 'INACTIVE' ? null : 'INACTIVE')}
              active={cardFilter === 'INACTIVE'}
              activeColor="border-orange-500/50"
              ringColor="ring-orange-500/20"
              description="Needs to migrate or be zeroed"
            />
            <SummaryCard
              label="Unverified"
              count={statusCounts.ILLEGAL}
              icon={<ShieldX size={18} />}
              color="text-red-500"
              bg="bg-red-500/10"
              onClick={() => setCardFilter(cardFilter === 'ILLEGAL' ? null : 'ILLEGAL')}
              active={cardFilter === 'ILLEGAL'}
              activeColor="border-red-500/50"
              ringColor="ring-red-500/20"
              description="Needs leadership review"
            />
          </div>
        )}

        {/* Officer Review Banner */}
        {isOfficer && players.length > 0 && reviewProgress.total > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-sky-500/5 border border-sky-500/20">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
              <div className="flex-1">
                <div className="text-sm font-medium text-sky-400 mb-1">Officer Review Mode</div>
                <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Review players flagged as <span className="text-red-400 font-medium">Unverified</span> or <span className="text-orange-400 font-medium">Inactive</span>.
                  For each player, decide: are they a real problem, or are they fine?
                </div>
              </div>
              <button
                onClick={() => { setReviewFilter(!reviewFilter); setCardFilter(null); setStatusFilter('ALL'); }}
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  reviewFilter
                    ? 'bg-sky-500 text-white hover:bg-sky-600'
                    : 'bg-sky-500/10 text-sky-400 border border-sky-500/30 hover:bg-sky-500/20'
                }`}
              >
                {reviewFilter ? 'Show All Players' : `Review Queue (${reviewProgress.total - reviewProgress.reviewed})`}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-[var(--background-secondary)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-300"
                  style={{ width: `${reviewProgress.total > 0 ? (reviewProgress.reviewed / reviewProgress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="text-xs text-[var(--text-muted)] shrink-0">
                {reviewProgress.reviewed}/{reviewProgress.total} reviewed
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        {players.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or governor ID..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <select
              value={reviewFilter ? 'REVIEW' : statusFilter}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'REVIEW') {
                  setReviewFilter(true); setCardFilter(null);
                } else {
                  setReviewFilter(false); setStatusFilter(val as MigrationStatus | 'ALL'); setCardFilter(null);
                }
              }}
              className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              {isOfficer && <option value="REVIEW">Needs Review</option>}
              <option value="ORIGINAL">Original</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="PENDING">Pending</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ILLEGAL">Unverified</option>
            </select>
            <select
              value={allianceFilter}
              onChange={(e) => setAllianceFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none"
            >
              <option value="ALL">All Alliances</option>
              {alliances.map(a => (
                <option key={a} value={a}>{toSorterTag(a) || a}</option>
              ))}
            </select>
          </div>
        )}

        {/* Player count + mobile sort */}
        {players.length > 0 && (
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-[var(--text-muted)]">
              Showing {filteredPlayers.length} of {players.length} players
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="px-2 py-1 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-xs focus:outline-none"
              >
                <option value="power">Power</option>
                <option value="kill_points">KP</option>
                <option value="name">Name</option>
                <option value="current_alliance">Alliance</option>
                <option value="migration_status">Status</option>
              </select>
              <button
                onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="p-1 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-muted)]"
              >
                {sortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>
          </div>
        )}

        {/* Player Table (desktop) / Cards (mobile) */}
        {players.length > 0 ? (
          <>
            {/* Mobile card view */}
            <div className="md:hidden space-y-2">
              {filteredPlayers.map((player) => (
                <PlayerCard key={player.governor_id} player={player} isOfficer={isOfficer} override={overrides.get(player.governor_id)} onOverride={handleOverride} />
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--background-secondary)] border-b border-[var(--border)]">
                      <SortableHeader field="name" label="Name" current={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader field="power" label="Power" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                      <SortableHeader field="kill_points" label="KP" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                      <SortableHeader field="current_alliance" label="Alliance" current={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader field="migration_status" label="Status" current={sortField} dir={sortDir} onSort={handleSort} />
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Location</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Info</th>
                      {isOfficer && <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Review</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map((player) => (
                      <PlayerRow key={player.governor_id} player={player} isOfficer={isOfficer} override={overrides.get(player.governor_id)} onOverride={handleOverride} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : !scan ? (
          <div className="text-center py-20 text-[var(--text-muted)]">
            <ShieldAlert size={40} className="mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">No scan data available</p>
            <p className="text-sm mt-1">Ask an admin to upload scan data to get started.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({ label, count, icon, color, bg, onClick, active, activeColor, ringColor, className, description }: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  onClick?: () => void;
  active?: boolean;
  activeColor?: string;
  ringColor?: string;
  className?: string;
  description?: string;
}) {
  return (
    <div
      className={`p-3 sm:p-4 rounded-xl bg-[var(--background-card)] border transition-all cursor-pointer ${
        active ? `${activeColor || 'border-[var(--foreground)]/30'} ring-1 ${ringColor || 'ring-[var(--foreground)]/10'}` : 'border-[var(--border)] hover:border-[var(--text-muted)]'
      } ${className || ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1 sm:mb-2">
        <div className={`p-1.5 rounded-lg ${bg} ${color}`}>{icon}</div>
        <span className="text-xs text-[var(--text-muted)] font-medium uppercase">{label}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-semibold ${color}`}>{count.toLocaleString()}</div>
      {description && (
        <div className="text-[10px] text-[var(--text-muted)] mt-1 leading-tight">{description}</div>
      )}
    </div>
  );
}

function PlayerCard({ player, isOfficer, override, onOverride }: {
  player: ScanPlayer;
  isOfficer: boolean;
  override?: PlayerOverride;
  onOverride?: (governorId: number, status: OfficerStatus | null, note?: string) => void;
}) {
  const [showNote, setShowNote] = useState(false);
  const status = player.migration_status as MigrationStatus;
  const colors = STATUS_COLORS[status] || STATUS_COLORS.ORIGINAL;
  const icon = STATUS_ICONS[status];
  const reviewable = status === 'ILLEGAL' || status === 'INACTIVE';

  return (
    <div className={`p-3 rounded-xl bg-[var(--background-card)] border border-[var(--border)] ${
      status === 'ILLEGAL' ? 'border-red-500/20 bg-red-500/[0.03]' : status === 'INACTIVE' ? 'border-orange-500/20 bg-orange-500/[0.03]' : ''
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-medium text-sm text-[var(--foreground)] truncate">{player.name}</div>
          <div className="text-xs text-[var(--text-muted)]">#{player.governor_id}</div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${colors.bg} ${colors.text} border ${colors.border}`}>
          {icon}
          {STATUS_LABELS[status] || status}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-[var(--text-muted)]">Power</div>
          <div className="font-mono text-[var(--foreground)]">{formatNumber(player.power)}</div>
        </div>
        <div>
          <div className="text-[var(--text-muted)]">KP</div>
          <div className="font-mono text-[var(--foreground)]">{player.kill_points > 0 ? formatNumber(player.kill_points) : '-'}</div>
        </div>
        <div>
          <div className="text-[var(--text-muted)]">Alliance</div>
          <div className="text-[var(--text-secondary)]">{toSorterTag(player.current_alliance) || '-'}</div>
        </div>
      </div>
      {(player.x != null || player.starting_kd || player.migrant_group) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-[var(--text-muted)]">
          {player.x != null && player.y != null && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={10} />
              {player.x}, {player.y}
            </span>
          )}
          {player.starting_kd && <span>KD: {player.starting_kd}</span>}
          {player.migrant_group && <span>G: {player.migrant_group}</span>}
        </div>
      )}
      {isOfficer && reviewable && (
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          {override ? (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                override.officer_status === 'cleared'
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                  : 'bg-red-500/10 text-red-500 border border-red-500/30'
              }`}>
                {override.officer_status === 'cleared' ? 'Marked OK' : 'Needs Removal'}
              </span>
              {override.officer_note && <span className="text-xs text-[var(--text-muted)] truncate">{override.officer_note}</span>}
              <button onClick={() => onOverride?.(player.governor_id, null)} className="text-xs text-[var(--text-muted)] hover:text-red-400 ml-auto">undo</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] text-[var(--text-muted)]">
                {status === 'INACTIVE' ? 'Is this player actually inactive?' : 'Do you recognize this player?'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOverride?.(player.governor_id, 'cleared')}
                  className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/30"
                >
                  They&apos;re OK
                </button>
                <button
                  onClick={() => onOverride?.(player.governor_id, 'confirmed')}
                  className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30"
                >
                  Remove
                </button>
                <button
                  onClick={() => setShowNote(!showNote)}
                  className="px-2 py-1.5 rounded text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-secondary)] border border-transparent hover:border-[var(--border)]"
                >
                  + note
                </button>
              </div>
            </div>
          )}
          {showNote && !override && (
            <input
              type="text"
              placeholder="Add a note then press Enter..."
              className="mt-2 w-full px-2 py-1 rounded text-xs bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onOverride?.(player.governor_id, 'confirmed', (e.target as HTMLInputElement).value);
                  setShowNote(false);
                }
              }}
              autoFocus
            />
          )}
        </div>
      )}
    </div>
  );
}

function SortableHeader({ field, label, current, dir, onSort, align }: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  align?: 'right';
}) {
  const active = current === field;
  return (
    <th
      className={`px-3 py-2.5 text-xs font-medium text-[var(--text-muted)] uppercase cursor-pointer select-none hover:text-[var(--foreground)] transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {active ? (
          dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </div>
    </th>
  );
}

function PlayerRow({ player, isOfficer, override, onOverride }: {
  player: ScanPlayer;
  isOfficer: boolean;
  override?: PlayerOverride;
  onOverride?: (governorId: number, status: OfficerStatus | null, note?: string) => void;
}) {
  const [showNote, setShowNote] = useState(false);
  const status = player.migration_status as MigrationStatus;
  const colors = STATUS_COLORS[status] || STATUS_COLORS.ORIGINAL;
  const icon = STATUS_ICONS[status];
  const reviewable = status === 'ILLEGAL' || status === 'INACTIVE';

  return (
    <tr className={`border-b border-[var(--border)] hover:bg-[var(--background-secondary)]/50 transition-colors ${
      status === 'ILLEGAL' ? 'bg-red-500/[0.03]' : status === 'INACTIVE' ? 'bg-orange-500/[0.03]' : ''
    }`}>
      <td className="px-3 py-2.5">
        <div className="font-medium text-[var(--foreground)]">{player.name}</div>
        <div className="text-xs text-[var(--text-muted)]">#{player.governor_id}</div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-[var(--foreground)]">
        {formatNumber(player.power)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-[var(--foreground)]">
        {player.kill_points > 0 ? formatNumber(player.kill_points) : '-'}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-[var(--text-secondary)]">{toSorterTag(player.current_alliance) || '-'}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}>
          {icon}
          {STATUS_LABELS[status] || status}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {player.x != null && player.y != null ? (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <MapPin size={12} />
            {player.x}, {player.y}
          </span>
        ) : '-'}
      </td>
      <td className="px-3 py-2.5 text-xs text-[var(--text-muted)]">
        {player.starting_kd && <span>KD: {player.starting_kd}</span>}
        {player.migrant_group && <span className="ml-2">G: {player.migrant_group}</span>}
        {player.migrant_recruiter && <span className="ml-2">R: {player.migrant_recruiter}</span>}
      </td>
      {isOfficer && (
        <td className="px-3 py-2.5">
          {reviewable ? (
            <div className="min-w-[160px]">
              {override ? (
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    override.officer_status === 'cleared'
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                      : 'bg-red-500/10 text-red-500 border border-red-500/30'
                  }`}>
                    {override.officer_status === 'cleared' ? 'OK' : 'Remove'}
                  </span>
                  {override.officer_note && (
                    <span className="text-xs text-[var(--text-muted)] truncate max-w-[100px]" title={override.officer_note}>
                      {override.officer_note}
                    </span>
                  )}
                  <button onClick={() => onOverride?.(player.governor_id, null)} className="text-[var(--text-muted)] hover:text-red-400 text-xs ml-1">undo</button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onOverride?.(player.governor_id, 'cleared')}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/30"
                    title="This player is fine, no action needed"
                  >
                    They&apos;re OK
                  </button>
                  <button
                    onClick={() => onOverride?.(player.governor_id, 'confirmed')}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30"
                    title="This player should be removed"
                  >
                    Remove
                  </button>
                  <button
                    onClick={() => setShowNote(!showNote)}
                    className="px-1.5 py-1 text-[var(--text-muted)] hover:text-[var(--foreground)] text-xs"
                    title="Add a note"
                  >
                    + note
                  </button>
                </div>
              )}
              {showNote && !override && (
                <input
                  type="text"
                  placeholder="Add a note then press Enter..."
                  className="mt-1.5 w-full px-2 py-1 rounded text-xs bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onOverride?.(player.governor_id, 'confirmed', (e.target as HTMLInputElement).value);
                      setShowNote(false);
                    }
                  }}
                  autoFocus
                />
              )}
            </div>
          ) : override ? (
            <span className="text-xs text-[var(--text-muted)]">
              {override.officer_status === 'cleared' ? 'OK' : 'Remove'}
            </span>
          ) : null}
        </td>
      )}
    </tr>
  );
}
