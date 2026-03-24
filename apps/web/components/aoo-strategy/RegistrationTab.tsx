'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { FileSpreadsheet, Loader2, ExternalLink, RefreshCw, Users, Swords, Crown, Target, AlertTriangle, Shield, ChevronDown, ChevronUp, Upload, ArrowRight } from 'lucide-react';
import { fetchAooRegistrationSheet, parseAooRegistrationCSV } from '@/lib/aoo-strategy/parse';
import type { AooRegistration } from '@/lib/aoo-strategy/types';
import { formatPower } from '@/lib/supabase/use-alliance-roster';

const SHEET_URL_KEY = 'aoo-registration-sheet-url';
const OFFICER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/17JLwfknLvybbxu2B-SjlLkL5RqBIkIZgF11tvUzFvjU/edit?gid=1559092066#gid=1559092066';

interface RegistrationTabProps {
  theme: Record<string, string>;
  onApplyToBuilder: (registrations: AooRegistration[]) => void;
  onSkipToBuilder: () => void;
  isOfficer?: boolean;
}

export default function RegistrationTab({ theme, onApplyToBuilder, onSkipToBuilder, isOfficer }: RegistrationTabProps) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [registrations, setRegistrations] = useState<AooRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [showColumnHelp, setShowColumnHelp] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore last used URL
  useEffect(() => {
    const saved = localStorage.getItem(SHEET_URL_KEY);
    if (saved) setSheetUrl(saved);
  }, []);

  // Collapse instructions once data is loaded
  useEffect(() => {
    if (fetched && registrations.length > 0) {
      setShowColumnHelp(false);
    }
  }, [fetched, registrations.length]);

  const handleFetch = async () => {
    if (!sheetUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAooRegistrationSheet(sheetUrl.trim());
      setRegistrations(data);
      setFetched(true);
      localStorage.setItem(SHEET_URL_KEY, sheetUrl.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sheet');
      setRegistrations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOfficerFetch = async () => {
    setSheetUrl(OFFICER_SHEET_URL);
    localStorage.setItem(SHEET_URL_KEY, OFFICER_SHEET_URL);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAooRegistrationSheet(OFFICER_SHEET_URL);
      setRegistrations(data);
      setFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sheet');
      setRegistrations([]);
    } finally {
      setLoading(false);
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
      setRegistrations(data);
      setFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV file');
      setRegistrations([]);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Derived stats
  const stats = useMemo(() => {
    const team1 = registrations.filter(r => r.team1);
    const team2 = registrations.filter(r => r.team2);
    const both = registrations.filter(r => r.team1 && r.team2);
    const neither = registrations.filter(r => !r.team1 && !r.team2);
    const rallyLeaders = registrations.filter(r => r.rallyLeader);
    const garrisonLeaders = registrations.filter(r => r.garrisonLeader);
    const midPlayers = registrations.filter(r => r.mid);
    const totalPower = registrations.reduce((s, r) => s + r.power, 0);
    return { team1, team2, both, neither, rallyLeaders, garrisonLeaders, midPlayers, totalPower };
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
          Import Registrations
        </h2>

        {/* Officer badge with quick-load and edit sheet buttons */}
        {isOfficer && (
          <div className="mb-3 sm:mb-4 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center justify-between">
              <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Officer</span>
              <a
                href={OFFICER_SHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                <ExternalLink size={11} />
                Edit Sheet
              </a>
            </div>
            <button
              onClick={handleOfficerFetch}
              disabled={loading}
              className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              {loading ? 'Fetching...' : 'Fetch Registration Sheet'}
            </button>
          </div>
        )}

        {/* Google Sheets fetch */}
        <div className="mb-3 sm:mb-4">
          <label className={`text-xs sm:text-sm font-medium ${theme.text} mb-1.5 block`}>From Google Sheet</label>
          <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-2">
            <input
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="Paste Google Sheets URL..."
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
                {loading ? 'Fetching...' : fetched ? 'Refresh' : 'Fetch'}
              </button>
              {sheetUrl.trim() && (
                <button
                  onClick={openSheet}
                  className={`px-2.5 py-2 rounded-lg text-sm ${theme.button} flex items-center`}
                  title="Open in Google Sheets"
                >
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 border-t border-[var(--border)]" />
          <span className={`text-xs font-medium ${theme.textMuted}`}>OR</span>
          <div className="flex-1 border-t border-[var(--border)]" />
        </div>

        {/* CSV Upload */}
        <div className="mb-3">
          <label className={`text-xs sm:text-sm font-medium ${theme.text} mb-1.5 block`}>Upload CSV</label>
          <p className={`text-xs ${theme.textMuted} mb-2 hidden sm:block`}>
            Export your Google Sheet as CSV (File → Download → Comma-separated values).
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
            Choose CSV File...
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
          <span className={`text-xs font-medium ${theme.textMuted}`}>OR</span>
          <div className="flex-1 border-t border-[var(--border)]" />
        </div>

        {/* Skip to builder */}
        <button
          onClick={onSkipToBuilder}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${theme.button} border border-[var(--border)] hover:bg-[var(--background-hover)]`}
        >
          <ArrowRight size={14} />
          Skip to Team Builder
        </button>
      </section>

      {/* Column Format Instructions — collapsed by default on mobile */}
      <section className={`${theme.card} border rounded-xl mb-4 sm:mb-6 p-3 sm:p-5`}>
        <button
          onClick={() => setShowColumnHelp(!showColumnHelp)}
          className="flex items-center justify-between w-full text-left"
        >
          <h2 className={`text-xs sm:text-base font-semibold uppercase tracking-wider ${theme.textMuted}`}>
            Sheet / CSV Format
          </h2>
          <span className={theme.textMuted}>
            {showColumnHelp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>
        {showColumnHelp && (
          <div className={`mt-3 text-xs ${theme.textMuted} space-y-2`}>
            <p className={`text-xs sm:text-sm ${theme.text}`}>
              Your sheet should have these columns (order doesn&apos;t matter):
            </p>
            {/* Mobile: stacked list | Desktop: table */}
            <div className="sm:hidden space-y-1.5">
              {[
                { col: 'Name', desc: 'In-game name (required)' },
                { col: 'Gov ID', desc: 'Governor ID' },
                { col: 'Power', desc: 'Player power' },
                { col: 'Team 1', desc: 'x = available' },
                { col: 'Team 2', desc: 'x = available' },
                { col: 'Rally Leader', desc: 'x = can rally' },
                { col: 'Garrison Leader', desc: 'x = can garrison' },
                { col: 'Mid', desc: 'x = prefers mid' },
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
                  <th className="py-1.5 pr-3 font-semibold">Column</th>
                  <th className="py-1.5 pr-3 font-semibold">Type</th>
                  <th className="py-1.5 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">Name</td><td className="py-1.5 pr-3">Text</td><td className="py-1.5">Player&apos;s in-game name (required)</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">Gov ID</td><td className="py-1.5 pr-3">Number</td><td className="py-1.5">Governor ID</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">Power</td><td className="py-1.5 pr-3">Number</td><td className="py-1.5">Player power (e.g. 85000000)</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">Team 1</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">Available for Team 1</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">Team 2</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">Available for Team 2</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">Rally Leader</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">Can lead rallies</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">Garrison Leader</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">Can lead garrisons</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">Mid</td><td className="py-1.5 pr-3">x / blank</td><td className="py-1.5">Prefers mid lane / ark carrier</td></tr>
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
          {/* Stats Summary */}
          <section className={`${theme.card} border rounded-xl mb-4 sm:mb-6 p-3 sm:p-5`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className={`text-xs sm:text-base font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                Summary
              </h2>
              <button
                onClick={() => onApplyToBuilder(registrations)}
                className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 ${theme.buttonPrimary} shrink-0`}
              >
                <Swords size={14} />
                Distribute
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <StatCard label="Registered" value={registrations.length} icon={<Users size={14} />} theme={theme} />
              <StatCard label="Team 1" value={stats.team1.length} icon={<span className="text-blue-400 font-bold text-xs">T1</span>} theme={theme} />
              <StatCard label="Team 2" value={stats.team2.length} icon={<span className="text-orange-400 font-bold text-xs">T2</span>} theme={theme} />
              <StatCard label="Rally" value={stats.rallyLeaders.length} icon={<Crown size={14} className="text-yellow-400" />} theme={theme} />
              <StatCard label="Garrison" value={stats.garrisonLeaders.length} icon={<Shield size={14} className="text-cyan-400" />} theme={theme} />
              <StatCard label="Mid Pref" value={stats.midPlayers.length} icon={<Target size={14} className="text-purple-400" />} theme={theme} />
              <StatCard label="Both" value={stats.both.length} icon={<span className="text-emerald-400 font-bold text-[10px]">T1+2</span>} theme={theme} />
              <StatCard label="Power" value={formatPower(stats.totalPower)} icon={<Swords size={14} className="text-red-400" />} theme={theme} />
            </div>
          </section>

          {/* Registration List — cards on mobile, table on desktop */}
          <section className={`${theme.card} border rounded-xl overflow-hidden`}>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={`text-left px-4 py-3 font-medium ${theme.textMuted}`}>#</th>
                    <th className={`text-left px-4 py-3 font-medium ${theme.textMuted}`}>Name</th>
                    <th className={`text-right px-4 py-3 font-medium ${theme.textMuted}`}>Gov ID</th>
                    <th className={`text-right px-4 py-3 font-medium ${theme.textMuted}`}>Power</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>T1</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>T2</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>Rally</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>Garr.</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>Mid</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r, i) => (
                    <tr key={r.govId || r.name} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--background-hover)]">
                      <td className={`px-4 py-2.5 ${theme.textMuted} text-xs`}>{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className={`px-4 py-2.5 text-right ${theme.textMuted} tabular-nums`}>{r.govId || '-'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.power ? formatPower(r.power) : '-'}</td>
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
                <div key={r.govId || r.name} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] ${theme.textMuted} w-5 shrink-0`}>{i + 1}</span>
                      <span className="font-medium text-sm truncate">{r.name}</span>
                    </div>
                    <span className={`text-xs tabular-nums ${theme.textMuted} shrink-0`}>
                      {r.power ? formatPower(r.power) : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 ml-7">
                    {r.team1 && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">T1</span>}
                    {r.team2 && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400">T2</span>}
                    {r.rallyLeader && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400">Rally</span>}
                    {r.garrisonLeader && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/20 text-cyan-400">Garr</span>}
                    {r.mid && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400">Mid</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {fetched && registrations.length === 0 && !error && (
        <div className={`${theme.card} border rounded-xl p-8 sm:p-12 text-center`}>
          <p className={theme.textMuted}>No registrations found. Check that the sheet has the expected columns.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, theme }: { label: string; value: string | number; icon: React.ReactNode; theme: Record<string, string> }) {
  return (
    <div className="p-2.5 sm:p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className={`text-[10px] sm:text-xs ${theme.textMuted} truncate`}>{label}</span>
      </div>
      <span className="text-base sm:text-lg font-semibold">{value}</span>
    </div>
  );
}
