'use client';

import { useState, useEffect, useMemo } from 'react';
import { FileSpreadsheet, Loader2, ExternalLink, RefreshCw, Users, Swords, Crown, Target, AlertTriangle, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchAooRegistrationSheet, toExportUrl } from '@/lib/aoo-strategy/parse';
import type { AooRegistration } from '@/lib/aoo-strategy/types';
import { formatPower } from '@/lib/supabase/use-alliance-roster';

const SHEET_URL_KEY = 'aoo-registration-sheet-url';

interface RegistrationTabProps {
  theme: Record<string, string>;
  onApplyToBuilder: (registrations: AooRegistration[]) => void;
}

export default function RegistrationTab({ theme, onApplyToBuilder }: RegistrationTabProps) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [registrations, setRegistrations] = useState<AooRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  // Restore last used URL
  useEffect(() => {
    const saved = localStorage.getItem(SHEET_URL_KEY);
    if (saved) setSheetUrl(saved);
  }, []);

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

  const [showColumnHelp, setShowColumnHelp] = useState(false);

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
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* Sheet URL Input */}
      <section className={`${theme.card} border rounded-xl mb-6 p-5`}>
        <h2 className={`text-base font-semibold uppercase tracking-wider ${theme.textMuted} mb-4`}>
          Import Registration Sheet
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="Paste Google Sheets URL (edit or export link)..."
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm ${theme.input} border`}
            onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
          />
          <div className="flex gap-2">
            <button
              onClick={handleFetch}
              disabled={loading || !sheetUrl.trim()}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 ${theme.buttonPrimary} disabled:opacity-50`}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : fetched ? (
                <RefreshCw size={16} />
              ) : (
                <FileSpreadsheet size={16} />
              )}
              {loading ? 'Fetching...' : fetched ? 'Refresh' : 'Fetch'}
            </button>
            {sheetUrl.trim() && (
              <button
                onClick={openSheet}
                className={`px-3 py-2.5 rounded-lg text-sm ${theme.button} flex items-center gap-1.5`}
                title="Open in Google Sheets"
              >
                <ExternalLink size={14} />
              </button>
            )}
          </div>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}
        <div className="mt-3">
          <button
            onClick={() => setShowColumnHelp(!showColumnHelp)}
            className={`flex items-center gap-1.5 text-xs font-medium ${theme.textMuted} hover:text-[var(--foreground)] transition-colors`}
          >
            {showColumnHelp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Expected column format
          </button>
          {showColumnHelp && (
            <div className={`mt-2 p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs ${theme.textMuted} space-y-2`}>
              <p className="font-medium text-[var(--foreground)]">Your Google Sheet should have these columns (header row):</p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-1 pr-3 font-semibold">Column</th>
                    <th className="py-1 pr-3 font-semibold">Type</th>
                    <th className="py-1 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  <tr><td className="py-1 pr-3 font-medium text-[var(--foreground)]">Name</td><td className="py-1 pr-3">Text</td><td className="py-1">Player&apos;s in-game name</td></tr>
                  <tr><td className="py-1 pr-3 font-medium text-[var(--foreground)]">Gov ID</td><td className="py-1 pr-3">Number</td><td className="py-1">Governor ID</td></tr>
                  <tr><td className="py-1 pr-3 font-medium text-[var(--foreground)]">Power</td><td className="py-1 pr-3">Number</td><td className="py-1">Player power (e.g. 85000000)</td></tr>
                  <tr><td className="py-1 pr-3 font-medium text-[var(--foreground)]">Team 1</td><td className="py-1 pr-3">x / blank</td><td className="py-1">Available for Team 1</td></tr>
                  <tr><td className="py-1 pr-3 font-medium text-[var(--foreground)]">Team 2</td><td className="py-1 pr-3">x / blank</td><td className="py-1">Available for Team 2</td></tr>
                  <tr><td className="py-1 pr-3 font-medium text-[var(--foreground)]">Rally Leader</td><td className="py-1 pr-3">x / blank</td><td className="py-1">Can lead rallies (top/bottom lane)</td></tr>
                  <tr><td className="py-1 pr-3 font-medium text-[var(--foreground)]">Garrison Leader</td><td className="py-1 pr-3">x / blank</td><td className="py-1">Can lead garrisons (top/bottom lane)</td></tr>
                  <tr><td className="py-1 pr-3 font-medium text-[var(--foreground)]">Mid</td><td className="py-1 pr-3">x / blank</td><td className="py-1">Prefers mid lane / ark carrier</td></tr>
                </tbody>
              </table>
              <p>Boolean columns use <strong>&quot;x&quot;</strong> (case-insensitive) to mark true. Column matching is flexible &mdash; headers just need to contain the keyword (e.g. &quot;Rally Leader Notes&quot; still matches &quot;Rally Leader&quot;).</p>
            </div>
          )}
        </div>
      </section>

      {/* Results */}
      {fetched && registrations.length > 0 && (
        <>
          {/* Stats Summary */}
          <section className={`${theme.card} border rounded-xl mb-6 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className={`text-base font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                Registration Summary
              </h2>
              <button
                onClick={() => onApplyToBuilder(registrations)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 ${theme.buttonPrimary}`}
              >
                <Swords size={16} />
                Apply to Team Builder
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Registered" value={registrations.length} icon={<Users size={16} />} theme={theme} />
              <StatCard label="Team 1" value={stats.team1.length} icon={<span className="text-blue-400 font-bold text-sm">T1</span>} theme={theme} />
              <StatCard label="Team 2" value={stats.team2.length} icon={<span className="text-orange-400 font-bold text-sm">T2</span>} theme={theme} />
              <StatCard label="Rally Leaders" value={stats.rallyLeaders.length} icon={<Crown size={16} className="text-yellow-400" />} theme={theme} />
              <StatCard label="Garrison Leaders" value={stats.garrisonLeaders.length} icon={<Shield size={16} className="text-cyan-400" />} theme={theme} />
              <StatCard label="Mid Preference" value={stats.midPlayers.length} icon={<Target size={16} className="text-purple-400" />} theme={theme} />
              <StatCard label="Both Teams" value={stats.both.length} icon={<span className="text-emerald-400 font-bold text-xs">T1+T2</span>} theme={theme} />
              <StatCard label="Total Power" value={formatPower(stats.totalPower)} icon={<Swords size={16} className="text-red-400" />} theme={theme} />
            </div>
          </section>

          {/* Registration Table */}
          <section className={`${theme.card} border rounded-xl overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={`text-left px-4 py-3 font-medium ${theme.textMuted}`}>#</th>
                    <th className={`text-left px-4 py-3 font-medium ${theme.textMuted}`}>Name</th>
                    <th className={`text-right px-4 py-3 font-medium ${theme.textMuted}`}>Gov ID</th>
                    <th className={`text-right px-4 py-3 font-medium ${theme.textMuted}`}>Power</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>Team 1</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>Team 2</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>Rally</th>
                    <th className={`text-center px-4 py-3 font-medium ${theme.textMuted}`}>Garrison</th>
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
          </section>
        </>
      )}

      {fetched && registrations.length === 0 && !error && (
        <div className={`${theme.card} border rounded-xl p-12 text-center`}>
          <p className={theme.textMuted}>No registrations found. Check that the sheet has the expected columns.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, theme }: { label: string; value: string | number; icon: React.ReactNode; theme: Record<string, string> }) {
  return (
    <div className="p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className={`text-xs ${theme.textMuted}`}>{label}</span>
      </div>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}
