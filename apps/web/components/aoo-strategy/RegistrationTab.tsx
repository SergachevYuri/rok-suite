'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileSpreadsheet, Loader2, ExternalLink, RefreshCw, Users, Swords, Crown, Target, AlertTriangle, Shield, ChevronDown, ChevronUp, Upload, ArrowRight, Trophy } from 'lucide-react';
import { fetchAooRegistrationSheet, fetchAooLeagueRegistrationSheet, parseAooRegistrationCSV, mergeAooRegistrations } from '@/lib/aoo-strategy/parse';
import { LeagueSheetPanel } from './LeagueSheetPanel';
import { parseKingdomXLSX } from '@/lib/kingdom/parse';
import type { AooRegistration } from '@/lib/aoo-strategy/types';
import { formatPower } from '@/lib/supabase/use-alliance-roster';
import { supabase } from '@/lib/supabase';
import {
  type AooLeagueTournament,
  getActiveLeagueTournament,
  startLeagueTournament,
  endLeagueTournament,
} from '@/lib/supabase/use-aoo-league-tournament';

const SHEET_URL_KEY = 'aoo-registration-sheet-url';
const LEAGUE_SHEET_URL_KEY = 'aoo-league-sheet-url';
const OFFICER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/17JLwfknLvybbxu2B-SjlLkL5RqBIkIZgF11tvUzFvjU/edit?gid=1559092066#gid=1559092066';

interface RegistrationTabProps {
  theme: Record<string, string>;
  onApplyToBuilder: (registrations: AooRegistration[]) => void;
  onSkipToBuilder: () => void;
  isOfficer?: boolean;
  /** Latest kingdom-scan power keyed by governor id. When the sheet has a blank
   *  Power column, we fill it in from this map so signups don't need to enter
   *  power manually. */
  powerByGovId?: Record<number, number>;
  killsByGovId?: Record<number, number>;
  scanLabel?: string | null;
  /** True when a Supabase auth user is logged in. Drives the upload-scan CTA:
   *  signed-in users get a "Upload fresh scan" link; others see the same link
   *  with a "(sign in first)" hint. */
  isSignedIn?: boolean;
}

export default function RegistrationTab({ theme, onApplyToBuilder, onSkipToBuilder, isOfficer, powerByGovId, killsByGovId, scanLabel, isSignedIn }: RegistrationTabProps) {
  const t = useTranslations('aoo.registration');
  const to = useTranslations('aoo.officer');
  const tl = useTranslations('aoo.registration.league');
  const tt = useTranslations('aoo.registration.tournament');
  const [sheetUrl, setSheetUrl] = useState('');
  const [leagueSheetUrl, setLeagueSheetUrl] = useState('');
  const [rawRegistrations, setRawRegistrations] = useState<AooRegistration[]>([]);
  const [rawLeagueRegistrations, setRawLeagueRegistrations] = useState<AooRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [showColumnHelp, setShowColumnHelp] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Inline kingdom-scan upload (in-game XLSX export). Parsed client-side and
  // held in memory for this session. When signed in we also persist it to
  // Supabase so the next session benefits too.
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [inlineScan, setInlineScan] = useState<{
    powerByGovId: Record<number, number>;
    killsByGovId: Record<number, number>;
    label: string;
    playerCount: number;
    persisted: boolean;
  } | null>(null);
  const [scanUploadStatus, setScanUploadStatus] = useState<'idle' | 'parsing' | 'saving' | 'error'>('idle');
  const [scanUploadError, setScanUploadError] = useState<string | null>(null);

  // Active tournament — when set, its `roster` is the source of truth for the
  // league team and overrides whatever the live league sheet currently has.
  // Mid-tournament edits to the league tab can't change who's committed.
  const [activeTournament, setActiveTournament] = useState<AooLeagueTournament | null>(null);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [tournamentError, setTournamentError] = useState<string | null>(null);
  const [tournamentRosterOpen, setTournamentRosterOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const t = await getActiveLeagueTournament();
        if (!cancelled) setActiveTournament(t);
      } catch (err) {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : String(err);
        // Translate the raw "relation does not exist" / "schema cache" Supabase
        // errors into something an officer can act on (run the migration). Other
        // errors fall through verbatim so they're at least debuggable.
        const tableMissing = /aoo_league_tournaments/i.test(raw)
          && /(does not exist|schema cache|relation)/i.test(raw);
        setTournamentError(tableMissing
          ? 'League tournament feature not initialized — an admin needs to run the migration `add-aoo-league-tournaments.sql` in Supabase.'
          : raw);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Restore last used URLs
  useEffect(() => {
    const saved = localStorage.getItem(SHEET_URL_KEY);
    if (saved) setSheetUrl(saved);
    const savedLeague = localStorage.getItem(LEAGUE_SHEET_URL_KEY);
    if (savedLeague) setLeagueSheetUrl(savedLeague);
  }, []);

  // Collapse instructions once data is loaded
  useEffect(() => {
    if (fetched && rawRegistrations.length > 0) {
      setShowColumnHelp(false);
    }
  }, [fetched, rawRegistrations.length]);

  const handleFetch = async () => {
    if (!sheetUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAooRegistrationSheet(sheetUrl.trim());
      setRawRegistrations(data);
      setFetched(true);
      localStorage.setItem(SHEET_URL_KEY, sheetUrl.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sheet');
      setRawRegistrations([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch the league sign-up tab. League players are tagged so the merge step
  // can strip them out of normal Team 1 / Team 2 pools — they only play on
  // the dedicated league team. Flips `fetched` so the stats summary +
  // Distribute button appear even when only the league tab is loaded (no
  // main sheet); without this, the page looked frozen after a league fetch.
  const handleLeagueFetch = async () => {
    if (!leagueSheetUrl.trim()) return;
    setLeagueLoading(true);
    setLeagueError(null);
    try {
      const data = await fetchAooLeagueRegistrationSheet(leagueSheetUrl.trim());
      setRawLeagueRegistrations(data);
      if (data.length > 0) setFetched(true);
      localStorage.setItem(LEAGUE_SHEET_URL_KEY, leagueSheetUrl.trim());
    } catch (err) {
      setLeagueError(err instanceof Error ? err.message : 'Failed to fetch league sheet');
      setRawLeagueRegistrations([]);
    } finally {
      setLeagueLoading(false);
    }
  };

  const clearLeague = () => {
    setRawLeagueRegistrations([]);
    setLeagueError(null);
  };

  const handleStartTournament = async () => {
    if (rawLeagueRegistrations.length === 0) return;
    const defaultName = `League ${new Date().toISOString().slice(0, 10)}`;
    const name = window.prompt(tt('namePrompt'), defaultName);
    if (name === null) return;
    const trimmed = name.trim() || defaultName;
    setTournamentLoading(true);
    setTournamentError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const tournament = await startLeagueTournament(
        trimmed,
        rawLeagueRegistrations,
        user?.email ?? user?.id ?? null,
      );
      setActiveTournament(tournament);
    } catch (err) {
      setTournamentError(err instanceof Error ? err.message : 'Failed to start tournament');
    } finally {
      setTournamentLoading(false);
    }
  };

  const handleEndTournament = async () => {
    if (!activeTournament) return;
    if (!window.confirm(tt('endConfirm', { name: activeTournament.name }))) return;
    setTournamentLoading(true);
    setTournamentError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await endLeagueTournament(activeTournament.id, user?.email ?? user?.id ?? null);
      setActiveTournament(null);
    } catch (err) {
      setTournamentError(err instanceof Error ? err.message : 'Failed to end tournament');
    } finally {
      setTournamentLoading(false);
    }
  };

  const handleOfficerFetch = async () => {
    setSheetUrl(OFFICER_SHEET_URL);
    localStorage.setItem(SHEET_URL_KEY, OFFICER_SHEET_URL);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAooRegistrationSheet(OFFICER_SHEET_URL);
      setRawRegistrations(data);
      setFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sheet');
      setRawRegistrations([]);
    } finally {
      setLoading(false);
    }
    // Also refresh the league tab if the officer has it configured. League is
    // optional, so a failure here doesn't block the main fetch.
    if (leagueSheetUrl.trim()) {
      void handleLeagueFetch();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const data = parseAooRegistrationCSV(text);
      setRawRegistrations(data);
      setFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV file');
      setRawRegistrations([]);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Parse the in-game XLSX export and use it to fill power/KP for the current
  // session. If the user is signed in, also persist it as a kingdom_scans
  // record so /roster/upload-style scan history stays consistent.
  const handleScanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanUploadStatus('parsing');
    setScanUploadError(null);
    try {
      const buffer = await file.arrayBuffer();
      const rows = await parseKingdomXLSX(buffer);
      if (rows.length === 0) throw new Error('No players found in XLSX');

      const power: Record<number, number> = {};
      const kills: Record<number, number> = {};
      for (const r of rows) {
        if (r.governorId) {
          if (r.power) power[r.governorId] = r.power;
          if (r.totalKillPoints) kills[r.governorId] = r.totalKillPoints;
        }
      }

      const label = `AOO upload · ${file.name}`;
      let persisted = false;

      if (isSignedIn) {
        setScanUploadStatus('saving');
        try {
          const { data: scan, error: scanErr } = await supabase
            .from('kingdom_scans')
            .insert({
              label,
              snapshot_count: 0,
              kingdom_count: rows.length,
              migrant_count: 0,
              pre_migration_count: 0,
            })
            .select('id')
            .single();

          if (!scanErr && scan) {
            const players = rows.map(r => ({
              scan_id: scan.id,
              governor_id: r.governorId,
              name: r.name,
              power: r.power,
              highest_power: r.highestPower,
              kill_points: r.totalKillPoints,
              t4_kills: r.t4Kills,
              t5_kills: r.t5Kills,
              deaths: r.t1Deaths + r.t2Deaths + r.t3Deaths + r.t4Deaths + r.t5Deaths,
              gathered: r.gathered,
              alliance_helps: r.allianceHelps,
              migration_status: 'ORIGINAL',
              is_migrant: false,
              migrant_accepted: false,
              existed_pre_migration: false,
            }));
            for (let i = 0; i < players.length; i += 500) {
              await supabase
                .from('kingdom_scan_players')
                .upsert(players.slice(i, i + 500), { onConflict: 'scan_id,governor_id' });
            }
            persisted = true;
          }
        } catch {
          // Persist failed; in-memory merge still works for this session.
        }
      }

      setInlineScan({ powerByGovId: power, killsByGovId: kills, label, playerCount: rows.length, persisted });
      setScanUploadStatus('idle');
    } catch (err) {
      setScanUploadError(err instanceof Error ? err.message : 'Failed to parse XLSX');
      setScanUploadStatus('error');
    } finally {
      if (scanInputRef.current) scanInputRef.current.value = '';
    }
  };

  // Merge in scan power/kills for any row whose Power column was blank, matched
  // by Gov ID. We layer two sources: the inline upload (freshest, takes
  // priority) over the Supabase scan from useScanRoster. We also flag each
  // merged row so the UI can show "filled from scan" affordances.
  const effectivePowerByGovId = useMemo(() => ({
    ...(powerByGovId || {}),
    ...(inlineScan?.powerByGovId || {}),
  }), [powerByGovId, inlineScan]);
  const effectiveKillsByGovId = useMemo(() => ({
    ...(killsByGovId || {}),
    ...(inlineScan?.killsByGovId || {}),
  }), [killsByGovId, inlineScan]);

  // While a tournament is active, the snapshot is the source of truth for the
  // league roster — even if the live sheet now shows a different set of names.
  // Outside a tournament, fall back to whatever the league sheet returned on
  // the most recent fetch.
  const effectiveLeagueRegistrations = useMemo<AooRegistration[]>(() => {
    if (activeTournament) return activeTournament.roster;
    return rawLeagueRegistrations;
  }, [activeTournament, rawLeagueRegistrations]);

  // Drift detection: while a tournament is locked, compare the live league
  // sheet (if loaded) against the snapshot's gov-ID set. Adds = new gov IDs
  // appearing on the sheet that aren't in the snapshot (won't be played
  // because they're not committed). Removes = gov IDs in the snapshot that
  // were taken off the sheet (still played because the snapshot wins). Match
  // is by gov ID; rows without gov IDs are ignored to keep this conservative.
  const tournamentDrift = useMemo<{
    added: AooRegistration[];
    removed: AooRegistration[];
  } | null>(() => {
    if (!activeTournament || rawLeagueRegistrations.length === 0) return null;
    const snapshotIds = new Set<number>(
      activeTournament.roster.filter(r => r.govId).map(r => r.govId),
    );
    const liveIds = new Set<number>(
      rawLeagueRegistrations.filter(r => r.govId).map(r => r.govId),
    );
    const added = rawLeagueRegistrations.filter(r => r.govId && !snapshotIds.has(r.govId));
    const removed = activeTournament.roster.filter(r => r.govId && !liveIds.has(r.govId));
    if (added.length === 0 && removed.length === 0) return null;
    return { added, removed };
  }, [activeTournament, rawLeagueRegistrations]);

  const { registrations, filledFromScanCount, missingPowerCount } = useMemo(() => {
    // Combine main + league with mutual exclusion: league players are removed
    // from the normal Team 1 / Team 2 pools and tagged with league=true so the
    // team builder can route them to the league team.
    const combined = mergeAooRegistrations(rawRegistrations, effectiveLeagueRegistrations);
    let filled = 0;
    let missing = 0;
    const merged = combined.map((r) => {
      const sheetPower = r.power || 0;
      const scanPower = r.govId ? effectivePowerByGovId[r.govId] : undefined;
      const scanKills = r.govId ? effectiveKillsByGovId[r.govId] : undefined;
      let power = sheetPower;
      let fromScan = false;
      if (sheetPower <= 0 && scanPower) {
        power = scanPower;
        fromScan = true;
        filled += 1;
      }
      if (power <= 0) missing += 1;
      return { ...r, power, kills: scanKills, fromScan } as AooRegistration & { fromScan?: boolean; kills?: number };
    });
    return { registrations: merged, filledFromScanCount: filled, missingPowerCount: missing };
  }, [rawRegistrations, effectiveLeagueRegistrations, effectivePowerByGovId, effectiveKillsByGovId]);

  // Derived stats. Normal-team rosters exclude league players (they were
  // already stripped out at merge time, so r.team1 / r.team2 are forced false
  // for them — no extra filtering needed here).
  const stats = useMemo(() => {
    const team1 = registrations.filter(r => r.team1);
    const team2 = registrations.filter(r => r.team2);
    const both = registrations.filter(r => r.team1 && r.team2);
    const neither = registrations.filter(r => !r.team1 && !r.team2 && !r.league);
    const league = registrations.filter(r => r.league && r.team1);
    const rallyLeaders = registrations.filter(r => r.rallyLeader);
    const garrisonLeaders = registrations.filter(r => r.garrisonLeader);
    const midPlayers = registrations.filter(r => r.mid);
    const totalPower = registrations.reduce((s, r) => s + r.power, 0);
    return { team1, team2, both, neither, league, rallyLeaders, garrisonLeaders, midPlayers, totalPower };
  }, [registrations]);

  // Open the sheet in Google Sheets
  const openSheet = () => {
    if (sheetUrl.trim()) {
      const editUrl = sheetUrl.includes('/edit') ? sheetUrl : sheetUrl.replace('/export?', '/edit?');
      window.open(editUrl, '_blank');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-3 py-4 sm:p-4 md:p-6">
      {/* Import Options */}
      <section className={`${theme.card} border rounded-xl mb-4 sm:mb-6 p-3 sm:p-5`}>
        <h2 className={`text-sm sm:text-base font-semibold uppercase tracking-wider ${theme.textMuted} mb-3 sm:mb-4`}>
          {t('importTitle')}
        </h2>

        {/* Officer badge with quick-load and edit sheet buttons */}
        {isOfficer && (
          <div className="mb-3 sm:mb-4 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center justify-between">
              <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider">{to('badge')}</span>
              <a
                href={OFFICER_SHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                <ExternalLink size={11} />
                {to('editSheet')}
              </a>
            </div>
            <button
              onClick={handleOfficerFetch}
              disabled={loading}
              className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              {loading ? to('fetching') : to('fetchSheet')}
            </button>
          </div>
        )}

        {/* Google Sheets fetch */}
        <div className="mb-3 sm:mb-4">
          <label className={`text-xs sm:text-sm font-medium ${theme.text} mb-1.5 block`}>{t('fromGoogleSheet')}</label>
          <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-2">
            <input
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder={t('pasteUrl')}
              className={`w-full min-w-0 px-3 py-2 rounded-lg text-sm ${theme.input} border`}
              onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
            />
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleFetch}
                disabled={loading || !sheetUrl.trim()}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${theme.buttonPrimary} disabled:opacity-50`}
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : fetched ? (
                  <RefreshCw size={14} />
                ) : (
                  <FileSpreadsheet size={14} />
                )}
                {loading ? to('fetching') : fetched ? t('refresh') : t('fetch')}
              </button>
              {sheetUrl.trim() && (
                <button
                  onClick={openSheet}
                  className={`px-2.5 py-2 rounded-lg text-sm ${theme.button} flex items-center`}
                  title={t('openInSheets')}
                >
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* League sign-up tab — separate URL because it's a different gid on the
            same spreadsheet. League players are mutually exclusive with normal
            Team 1 / Team 2 sign-ups, enforced at merge time. Optional. */}
        <div className="mb-3 sm:mb-4">
          <label className={`text-xs sm:text-sm font-medium ${theme.text} mb-1 flex items-center gap-1.5`}>
            <Trophy size={12} className="text-purple-400" />
            {tl('label')}
            <span className={`font-normal ${theme.textMuted}`}>{tl('optional')}</span>
          </label>
          <p className={`text-[11px] ${theme.textMuted} mb-1.5`}>{tl('helper')}</p>
          <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-2">
            <input
              type="url"
              value={leagueSheetUrl}
              onChange={(e) => setLeagueSheetUrl(e.target.value)}
              placeholder={tl('placeholder')}
              className={`w-full min-w-0 px-3 py-2 rounded-lg text-sm ${theme.input} border`}
              onKeyDown={(e) => e.key === 'Enter' && handleLeagueFetch()}
            />
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleLeagueFetch}
                disabled={leagueLoading || !leagueSheetUrl.trim()}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${theme.button} border border-[var(--border)] hover:bg-[var(--background-hover)] disabled:opacity-50`}
              >
                {leagueLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : rawLeagueRegistrations.length > 0 ? (
                  <RefreshCw size={14} />
                ) : (
                  <Trophy size={14} />
                )}
                {leagueLoading ? to('fetching') : rawLeagueRegistrations.length > 0 ? t('refresh') : t('fetch')}
              </button>
              {rawLeagueRegistrations.length > 0 && (
                <button
                  onClick={clearLeague}
                  className={`px-2.5 py-2 rounded-lg text-sm ${theme.button} flex items-center`}
                  title={tl('clearTitle')}
                >
                  <span className="text-xs">×</span>
                </button>
              )}
            </div>
          </div>
          {rawLeagueRegistrations.length > 0 && !activeTournament && (() => {
            // If a row was returned but no Team 1 mark made it through the
            // confirmed-gating step, the player is on the tab but won't be
            // routed into the league team. Flag it loudly so officers know
            // they need to fix the sheet (mark Confirmed + Team 1).
            const totalRows = rawLeagueRegistrations.length;
            const inLineup = stats.league.length;
            const pending = Math.max(0, totalRows - inLineup);
            return (
              <div className="mt-1.5 space-y-0.5">
                <p className="text-xs text-purple-400 flex items-center gap-1.5">
                  <Trophy size={11} />
                  <span>{tl('loaded', { count: inLineup })}</span>
                </p>
                {pending > 0 && (
                  <p className="text-[11px] text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                    <span>{tl('pendingConfirmed', { count: pending })}</span>
                  </p>
                )}
              </div>
            );
          })()}
          {leagueError && (
            <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle size={11} className="shrink-0" />
              <span className="min-w-0 break-words">{leagueError}</span>
            </p>
          )}

          {/* Tournament lock — when active, the saved roster snapshot is the
              source of truth for the league team; sheet edits are ignored
              until the tournament ends. */}
          {activeTournament ? (
            <>
              <div className="mt-2 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-2.5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Trophy size={12} /> {tt('locked')}
                    </div>
                    <div className="text-sm text-purple-200 mt-0.5 break-words">
                      <strong>{activeTournament.name}</strong>
                      <span className="text-purple-300/80"> · {tt('frozenSummary', { count: activeTournament.roster.length })}</span>
                    </div>
                    <div className="text-[11px] text-purple-300/70 mt-0.5 break-words">
                      {tt('startedOn', { date: new Date(activeTournament.started_at).toLocaleDateString() })}
                      {activeTournament.started_by ? ` · ${tt('startedBy', { name: activeTournament.started_by })}` : ''}
                      {' · '}{tt('ignoredUntilEnded')}
                    </div>
                  </div>
                  {isOfficer && (
                    <button
                      onClick={handleEndTournament}
                      disabled={tournamentLoading}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-purple-600/20 text-purple-200 border border-purple-500/40 hover:bg-purple-600/30 disabled:opacity-50 self-start sm:self-auto shrink-0"
                    >
                      {tournamentLoading ? tt('ending') : tt('endButton')}
                    </button>
                  )}
                </div>
                {/* Show the locked roster inline so officers can verify who's in
                    even before the live league tab has been re-fetched. */}
                <button
                  type="button"
                  onClick={() => setTournamentRosterOpen(o => !o)}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-purple-300 hover:text-purple-200 underline-offset-2 hover:underline"
                  aria-expanded={tournamentRosterOpen}
                >
                  {tournamentRosterOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {tt(tournamentRosterOpen ? 'hideRoster' : 'showRoster')}
                </button>
                {tournamentRosterOpen && (
                  <div className="mt-1.5 max-h-48 overflow-y-auto rounded border border-purple-500/30 bg-purple-500/5 p-2 text-[11px] text-purple-100/90">
                    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5">
                      {[...activeTournament.roster]
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((r) => (
                          <li key={r.govId || r.name} className="truncate" title={r.govId ? `${r.name} · ${r.govId}` : r.name}>
                            {r.sub && <span className="text-purple-300/70 mr-1">·S</span>}
                            {r.name}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
              {tournamentDrift && (
                <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs">
                  <div className="font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle size={12} /> {tt('drift.title')}
                  </div>
                  <p className="text-amber-200/90 mt-1">{tt('drift.explanation')}</p>
                  {tournamentDrift.added.length > 0 && (
                    <div className="mt-1.5 text-amber-200">
                      <span className="font-semibold">+{tournamentDrift.added.length} {tt('drift.added')}:</span>{' '}
                      <span className="text-amber-200/80 break-words">
                        {tournamentDrift.added.slice(0, 5).map(r => r.name).join(', ')}
                        {tournamentDrift.added.length > 5 ? ` +${tournamentDrift.added.length - 5}` : ''}
                      </span>
                    </div>
                  )}
                  {tournamentDrift.removed.length > 0 && (
                    <div className="mt-1 text-amber-200">
                      <span className="font-semibold">−{tournamentDrift.removed.length} {tt('drift.removed')}:</span>{' '}
                      <span className="text-amber-200/80 break-words">
                        {tournamentDrift.removed.slice(0, 5).map(r => r.name).join(', ')}
                        {tournamentDrift.removed.length > 5 ? ` +${tournamentDrift.removed.length - 5}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            isOfficer && rawLeagueRegistrations.length > 0 && (
              <button
                onClick={handleStartTournament}
                disabled={tournamentLoading}
                className="mt-2 w-full sm:w-auto px-3 py-2 rounded-md text-xs font-medium bg-purple-600/15 text-purple-300 border border-purple-500/40 hover:bg-purple-600/25 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                title={tt('lockTitle')}
              >
                <Trophy size={12} />
                {tournamentLoading ? tt('locking') : tt('lockButton', { count: rawLeagueRegistrations.length })}
              </button>
            )
          )}
          {tournamentError && (
            <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle size={11} className="shrink-0" />
              <span className="min-w-0 break-words">{tournamentError}</span>
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 border-t border-[var(--border)]" />
          <span className={`text-xs font-medium ${theme.textMuted}`}>{t('or')}</span>
          <div className="flex-1 border-t border-[var(--border)]" />
        </div>

        {/* CSV Upload */}
        <div className="mb-3">
          <label className={`text-xs sm:text-sm font-medium ${theme.text} mb-1.5 block`}>{t('uploadCsv')}</label>
          <p className={`text-xs ${theme.textMuted} mb-2 hidden sm:block`}>
            {t('uploadCsvHint')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${theme.button} border border-[var(--border)] hover:bg-[var(--background-hover)] disabled:opacity-50`}
          >
            <Upload size={14} />
            {t('chooseCsvFile')}
          </button>
        </div>

        {error && (
          <div className="mt-2 flex items-center gap-2 text-red-400 text-sm">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 border-t border-[var(--border)]" />
          <span className={`text-xs font-medium ${theme.textMuted}`}>{t('or')}</span>
          <div className="flex-1 border-t border-[var(--border)]" />
        </div>

        {/* Skip to builder */}
        <button
          onClick={onSkipToBuilder}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${theme.button} border border-[var(--border)] hover:bg-[var(--background-hover)]`}
        >
          <ArrowRight size={14} />
          {t('skipToBuilder')}
        </button>
      </section>

      {/* OL sheet sanity panel + grouped roster. While a tournament is locked
          we show the snapshot (effective league rows); otherwise show the
          live league fetch. Hidden when no league rows are loaded at all. */}
      <LeagueSheetPanel rows={effectiveLeagueRegistrations} theme={theme} />

      {/* Column Format Instructions — collapsed by default on mobile */}
      <section className={`${theme.card} border rounded-xl mb-4 sm:mb-6 p-3 sm:p-5`}>
        <button
          onClick={() => setShowColumnHelp(!showColumnHelp)}
          className="flex items-center justify-between w-full text-left"
        >
          <h2 className={`text-xs sm:text-base font-semibold uppercase tracking-wider ${theme.textMuted}`}>
            {t('sheetFormat')}
          </h2>
          <span className={theme.textMuted}>
            {showColumnHelp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>
        {showColumnHelp && (
          <div className={`mt-3 text-xs ${theme.textMuted} space-y-2`}>
            <p className={`text-xs sm:text-sm ${theme.text}`}>
              {t('sheetFormatDesc')}
            </p>
            {/* Mobile: stacked list | Desktop: table */}
            <div className="sm:hidden space-y-1.5">
              {[
                { col: t('columns.name'), desc: t('columns.nameDesc') },
                { col: t('columns.govId'), desc: t('columns.govIdDesc') },
                { col: t('columns.power'), desc: t('columns.powerDesc') },
                { col: t('columns.confirmed'), desc: t('columns.confirmedDesc') },
                { col: t('columns.team1'), desc: t('columns.team1Desc') },
                { col: t('columns.team2'), desc: t('columns.team2Desc') },
                { col: t('columns.rallyLeader'), desc: t('columns.rallyLeaderDesc') },
                { col: t('columns.garrisonLeader'), desc: t('columns.garrisonLeaderDesc') },
                { col: t('columns.mid'), desc: t('columns.midDesc') },
                { col: t('columns.sub'), desc: t('columns.subDesc') },
                { col: t('columns.league'), desc: t('columns.leagueDesc') },
              ].map(({ col, desc }) => (
                <div key={col} className="flex gap-2">
                  <span className="font-medium text-[var(--foreground)] shrink-0 w-24">{col}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
            <table className="hidden sm:table w-full text-left">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-1.5 pr-3 font-semibold">{t('column')}</th>
                  <th className="py-1.5 pr-3 font-semibold">{t('type')}</th>
                  <th className="py-1.5 font-semibold">{t('columnDescription')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{t('columns.name')}</td><td className="py-1.5 pr-3">Text</td><td className="py-1.5">{t('columns.nameDescFull')}</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{t('columns.govId')}</td><td className="py-1.5 pr-3">Number</td><td className="py-1.5">{t('columns.govIdDesc')}</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{t('columns.power')}</td><td className="py-1.5 pr-3">Number</td><td className="py-1.5">{t('columns.powerDescFull')}</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{t('columns.confirmed')}</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">{t('columns.confirmedDescFull')}</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{t('columns.team1')}</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">{t('columns.team1DescFull')}</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{t('columns.team2')}</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">{t('columns.team2DescFull')}</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{t('columns.rallyLeader')}</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">{t('columns.rallyLeaderDescFull')}</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{t('columns.garrisonLeader')}</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">{t('columns.garrisonLeaderDescFull')}</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{t('columns.mid')}</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">{t('columns.midDescFull')}</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{t('columns.sub')}</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">{t('columns.subDescFull')}</td></tr>
                <tr className="bg-purple-500/5"><td className="py-1.5 pr-3 font-medium text-purple-300">{t('columns.league')}</td><td className="py-1.5 pr-3 text-purple-300/80">separate tab</td><td className="py-1.5 text-purple-200/90">{t('columns.leagueDescFull')}</td></tr>
              </tbody>
            </table>
            <p className="hidden sm:block">
              Boolean columns use <strong>&quot;x&quot;</strong> (case-insensitive) to mark true, leave blank for false.
              Column matching is flexible &mdash; headers just need to <em>contain</em> the keyword.
            </p>
          </div>
        )}
      </section>

      {/* Results */}
      {fetched && registrations.length > 0 && (
        <>
          {/* Scan-merge banner: tells the user how many missing-power rows were
              auto-filled from the latest kingdom scan, and warns if any are still
              missing power. When power is missing, we surface a CTA pointing at
              the existing /roster/upload uploader so officers can refresh the
              kingdom scan without leaving the AOO flow. */}
          {(filledFromScanCount > 0 || missingPowerCount > 0 || !scanLabel) && (
            <section className={`mb-4 sm:mb-6 rounded-xl border px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm ${
              missingPowerCount > 0 || !scanLabel
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-emerald-500/30 bg-emerald-500/5'
            }`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {filledFromScanCount > 0 && (
                  <span className="text-emerald-400">
                    ✓ Filled <strong>{filledFromScanCount}</strong> missing power{filledFromScanCount === 1 ? '' : 's'} from scan
                    {scanLabel && <span className={theme.textMuted}> ({scanLabel})</span>}
                  </span>
                )}
                {missingPowerCount > 0 && (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertTriangle size={12} className="inline" />
                    <strong>{missingPowerCount}</strong> still missing power — add Power to the sheet or upload a fresh scan
                  </span>
                )}
                {!scanLabel && filledFromScanCount === 0 && (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertTriangle size={12} className="inline" />
                    No kingdom scan loaded — upload one to auto-fill power for everyone
                  </span>
                )}

                {/* Upload CTA — inline XLSX upload. Drops the in-game stats
                    export, parses client-side, and merges power/KP for the
                    current session. When signed in, also persists to
                    kingdom_scans so future loads benefit too. */}
                {(missingPowerCount > 0 || !scanLabel) && (
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <input
                      ref={scanInputRef}
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={handleScanUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => scanInputRef.current?.click()}
                      disabled={scanUploadStatus !== 'idle'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 transition-colors disabled:opacity-50"
                      title={isSignedIn ? 'Drop in your in-game XLSX export — power/KP fills in immediately and saves to the library' : 'Drop in your in-game XLSX export — fills power for this session only'}
                    >
                      {scanUploadStatus === 'parsing' ? <Loader2 size={12} className="animate-spin" /> : scanUploadStatus === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      {scanUploadStatus === 'parsing' ? 'Parsing…'
                        : scanUploadStatus === 'saving' ? 'Saving…'
                        : 'Upload kingdom .xlsx'}
                      {!isSignedIn && scanUploadStatus === 'idle' && <span className="text-[10px] opacity-70 ml-0.5">(session only)</span>}
                    </button>
                    <a
                      href="/roster/upload"
                      target="_blank"
                      rel="noopener"
                      className={`text-[10px] sm:text-xs ${theme.textMuted} hover:underline`}
                      title="Open the full uploader (XLSX + CSV merge)"
                    >
                      full uploader →
                    </a>
                  </div>
                )}
              </div>
              {scanUploadError && (
                <div className="mt-2 text-xs text-rose-400 flex items-center gap-1">
                  <AlertTriangle size={12} /> {scanUploadError}
                </div>
              )}
              {inlineScan && (
                <div className="mt-2 text-xs text-emerald-400">
                  ✓ Loaded <strong>{inlineScan.playerCount}</strong> players from {inlineScan.label}
                  {inlineScan.persisted ? ' · saved to library' : ' · session only'}
                </div>
              )}
            </section>
          )}

          {/* Stats Summary */}
          <section className={`${theme.card} border rounded-xl mb-4 sm:mb-6 p-3 sm:p-5`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className={`text-xs sm:text-base font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                {t('summary')}
              </h2>
              <button
                onClick={() => onApplyToBuilder(registrations)}
                className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 ${theme.buttonPrimary} shrink-0`}
              >
                <Swords size={14} />
                {t('distribute')}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <StatCard label={t('registered')} value={registrations.length} icon={<Users size={14} />} theme={theme} />
              <StatCard label={t('team1')} value={stats.team1.length} icon={<span className="text-blue-400 font-bold text-xs">T1</span>} theme={theme} />
              <StatCard label={t('team2')} value={stats.team2.length} icon={<span className="text-orange-400 font-bold text-xs">T2</span>} theme={theme} />
              <StatCard label={tl('statLabel')} value={stats.league.length} icon={<Trophy size={14} className="text-purple-400" />} theme={theme} />
              <StatCard label={t('rally')} value={stats.rallyLeaders.length} icon={<Crown size={14} className="text-yellow-400" />} theme={theme} />
              <StatCard label={t('garrisonLabel')} value={stats.garrisonLeaders.length} icon={<Shield size={14} className="text-cyan-400" />} theme={theme} />
              <StatCard label={t('midPref')} value={stats.midPlayers.length} icon={<Target size={14} className="text-purple-400" />} theme={theme} />
              <StatCard label={t('both')} value={stats.both.length} icon={<span className="text-emerald-400 font-bold text-[10px]">T1+2</span>} theme={theme} />
              <StatCard label={t('powerLabel')} value={formatPower(stats.totalPower)} icon={<Swords size={14} className="text-red-400" />} theme={theme} />
            </div>
          </section>

          {/* Registration List — cards on mobile, table on desktop */}
          <section className={`${theme.card} border rounded-xl overflow-hidden`}>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={`text-left px-4 py-3 font-medium ${theme.textMuted}`}>{t('tableHeaders.hash')}</th>
                    <th className={`text-left px-4 py-3 font-medium ${theme.textMuted}`}>{t('tableHeaders.name')}</th>
                    <th className={`text-right px-4 py-3 font-medium ${theme.textMuted}`}>{t('tableHeaders.govId')}</th>
                    <th className={`text-right px-4 py-3 font-medium ${theme.textMuted}`}>{t('tableHeaders.power')}</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>{t('tableHeaders.t1')}</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>{t('tableHeaders.t2')}</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>{t('tableHeaders.rally')}</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>{t('tableHeaders.garrison')}</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>{t('tableHeaders.mid')}</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r, i) => (
                    <tr key={r.govId || r.name} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--background-hover)]">
                      <td className={`px-4 py-2.5 ${theme.textMuted} text-xs`}>{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium">
                        {r.name}
                        {r.league && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 align-middle">
                            <Trophy size={9} /> {tl('badge')}
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right ${theme.textMuted} tabular-nums`}>{r.govId || '-'}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${(r as { fromScan?: boolean }).fromScan ? 'text-emerald-400' : !r.power ? 'text-amber-400' : ''}`} title={(r as { fromScan?: boolean }).fromScan ? `Filled from scan${scanLabel ? ` (${scanLabel})` : ''}` : !r.power ? 'Power not available — sheet column blank and gov id not in scan' : 'Power from sheet'}>
                        {r.power ? formatPower(r.power) : '—'}
                        {(r as { fromScan?: boolean }).fromScan && <span className="ml-1 text-[10px] opacity-70">·scan</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.team1 && <span className="inline-block w-5 h-5 rounded bg-blue-500/20 text-blue-400 text-xs font-bold leading-5">x</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.team2 && <span className="inline-block w-5 h-5 rounded bg-orange-500/20 text-orange-400 text-xs font-bold leading-5">x</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.rallyLeader && <Crown size={14} className="inline text-yellow-400" />}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.garrisonLeader && <Shield size={14} className="inline text-cyan-400" />}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.mid && <Target size={14} className="inline text-purple-400" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-[var(--border)]">
              {registrations.map((r, i) => (
                <div key={r.govId || r.name} className="px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs ${theme.textMuted} w-5 shrink-0 tabular-nums`}>{i + 1}</span>
                      <span className="font-medium text-sm truncate">{r.name}</span>
                    </div>
                    <span
                      className={`text-xs tabular-nums shrink-0 ${(r as { fromScan?: boolean }).fromScan ? 'text-emerald-400' : !r.power ? 'text-amber-400' : theme.textMuted}`}
                      title={(r as { fromScan?: boolean }).fromScan ? `Filled from scan${scanLabel ? ` (${scanLabel})` : ''}` : !r.power ? 'Power not available' : 'Power from sheet'}
                    >
                      {r.power ? formatPower(r.power) : '—'}
                      {(r as { fromScan?: boolean }).fromScan && <span className="ml-1 text-[10px] opacity-70">·scan</span>}
                    </span>
                  </div>
                  {(r.team1 || r.team2 || r.league || r.rallyLeader || r.garrisonLeader || r.mid) && (
                    <div className="flex items-center flex-wrap gap-1.5 mt-1.5 ml-7">
                      {r.league && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          <Trophy size={10} /> {tl('badge')}
                        </span>
                      )}
                      {r.team1 && <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-400">T1</span>}
                      {r.team2 && <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-orange-500/20 text-orange-400">T2</span>}
                      {r.rallyLeader && <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-yellow-500/20 text-yellow-400">Rally</span>}
                      {r.garrisonLeader && <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-cyan-500/20 text-cyan-400">Garr</span>}
                      {r.mid && <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-purple-500/20 text-purple-400">Mid</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {fetched && registrations.length === 0 && !error && (
        <div className={`${theme.card} border rounded-xl p-8 sm:p-12 text-center`}>
          <p className={theme.textMuted}>{t('noRegistrations')}</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, theme }: { label: string; value: string | number; icon: React.ReactNode; theme: Record<string, string> }) {
  return (
    <div className="p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className={`text-xs ${theme.textMuted} truncate`}>{label}</span>
      </div>
      <span className="text-base sm:text-lg font-semibold">{value}</span>
    </div>
  );
}
