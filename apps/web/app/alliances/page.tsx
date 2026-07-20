'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { Upload, X, Save, Plus, Users, Crown, Star, ShieldCheck } from 'lucide-react';
import { useAuthRole, meetsRole } from '@/lib/auth-role';
import { SignInButton } from '@/components/SignInButton';
import {
  type AllianceStanding,
  type AllianceRoles,
  type RolePerson,
  type StandingsDoc,
  loadStandings,
  saveStandings,
  loadRoles,
  saveRoles,
  buildScanNameMap,
  applyScanNames,
  type NameMatchStats,
} from '@/lib/alliances/data';
import {
  type ParsedStandings,
  parseScanCsv,
  parseAllianceActivityXlsx,
  mergeParsed,
} from '@/lib/alliances/parse';

// ─── Formatters ─────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat('en-US');
const fmt = (n: number) => nf.format(Math.round(n));
/** Power → compact billions / millions. */
const fmtPower = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return nf.format(Math.round(n));
};
const fmtPct = (r: number) => `${Math.round(r * 100)}%`;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AlliancesPage() {
  return (
    <AppSidebar>
      <AlliancesPageInner />
    </AppSidebar>
  );
}

function AlliancesPageInner() {
  const { role } = useAuthRole();
  const isOfficer = meetsRole(role, 'officer');

  const [standings, setStandings] = useState<StandingsDoc | null>(null);
  const [rolesByTag, setRolesByTag] = useState<Map<string, AllianceRoles>>(new Map());
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([loadStandings(), loadRoles()]);
      setStandings(s);
      setRolesByTag(new Map(r.map((row) => [row.tag, row])));
    } catch (e) {
      console.error('Failed to load alliances', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alliances = useMemo(
    () => [...(standings?.alliances ?? [])].sort((a, b) => b.power - a.power),
    [standings],
  );

  const onSavedRoles = (next: AllianceRoles) => {
    setRolesByTag((prev) => {
      const m = new Map(prev);
      m.set(next.tag, next);
      return m;
    });
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)] mb-2 tracking-wide uppercase">
              Kingdom
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-[var(--foreground)] mb-2 tracking-tight flex items-center gap-2">
              <Users className="w-7 h-7 text-sky-400" /> Alliances
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {standings?.asOf || standings?.source ? (
                <>
                  {standings.asOf ? `As of ${standings.asOf}` : 'As of unknown date'}
                  {standings.source ? ` · ${standings.source}` : ''}
                </>
              ) : (
                'Alliances ranked by total power, with their R5, officers and counselors.'
              )}
            </p>
          </div>
          <SignInButton />
        </header>

        {/* Officer tools */}
        {isOfficer ? (
          <>
            <UploadPanel role={role} onPublished={reload} />
            {alliances.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">
                  Manage roles
                </h2>
                <div className="space-y-3">
                  {alliances.map((a) => (
                    <RoleEditor
                      key={a.tag}
                      alliance={a}
                      roles={rolesByTag.get(a.tag) ?? null}
                      role={role}
                      onSaved={onSavedRoles}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="mb-8 p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
            <p className="text-xs text-[var(--text-secondary)]">
              Sign in as an officer to refresh standings and edit alliance roles.
            </p>
          </section>
        )}

        {/* View — everyone */}
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : alliances.length === 0 ? (
          <section className="p-8 rounded-xl bg-[var(--background-card)] border border-dashed border-[var(--border)] text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              No alliance data yet — an officer can upload a scan.
            </p>
          </section>
        ) : (
          <section className="space-y-3">
            {alliances.map((a, i) => (
              <AllianceCard
                key={a.tag}
                rank={i + 1}
                alliance={a}
                roles={rolesByTag.get(a.tag) ?? null}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Alliance card (view) ────────────────────────────────────────────────────

/** Resolve a role person's display name from the live roster (fresh names)
 *  with a fallback to the name captured when the role was assigned. */
function resolveName(person: RolePerson, roster: AllianceStanding['roster']): string {
  const live = roster.find((m) => m.id === person.id);
  return live?.name || person.name || String(person.id);
}

function AllianceCard({
  rank,
  alliance,
  roles,
}: {
  rank: number;
  alliance: AllianceStanding;
  roles: AllianceRoles | null;
}) {
  const r5 = roles?.r5 ? resolveName(roles.r5, alliance.roster) : null;
  const officers = (roles?.officers ?? []).map((p) => resolveName(p, alliance.roster));
  const counselors = (roles?.counselors ?? []).map((p) => resolveName(p, alliance.roster));

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
        <span className="text-xs font-semibold text-[var(--text-muted)] tabular-nums w-6">
          #{rank}
        </span>
        <h3 className="text-lg font-semibold text-[var(--foreground)]">{alliance.displayTag}</h3>
        <span className="text-sm font-medium text-sky-400 tabular-nums">
          {fmtPower(alliance.power)}
          <span className="text-[var(--text-muted)] font-normal"> power</span>
        </span>
        <span className="text-xs text-[var(--text-muted)] tabular-nums">
          {fmt(alliance.members)} members
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <RoleColumn icon={<Crown className="w-3.5 h-3.5 text-amber-400" />} label="R5" names={r5 ? [r5] : []} />
        <RoleColumn icon={<Star className="w-3.5 h-3.5 text-sky-400" />} label="Officers" names={officers} />
        <RoleColumn icon={<Users className="w-3.5 h-3.5 text-emerald-400" />} label="Counselor" names={counselors} />
      </div>
    </div>
  );
}

function RoleColumn({ icon, label, names }: { icon: React.ReactNode; label: string; names: string[] }) {
  return (
    <div className="rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] p-3">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          {label}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums ml-auto">{names.length}</span>
      </div>
      {names.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">Not set</p>
      ) : (
        <ul className="space-y-0.5">
          {names.map((n, i) => (
            <li key={`${n}-${i}`} className="text-sm text-[var(--foreground)] truncate" title={n}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Upload panel (officer) ──────────────────────────────────────────────────

function UploadPanel({ role, onPublished }: { role: string | null; onPublished: () => void | Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [parsed, setParsed] = useState<ParsedStandings | null>(null);
  const [stats, setStats] = useState<NameMatchStats | null>(null);
  const [source, setSource] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(Array.from(list));
    setParsed(null);
    setStats(null);
    setError(null);
    setInfo(null);
  };

  const handleParse = async () => {
    setError(null);
    setInfo(null);
    if (files.length === 0) {
      setError('Choose a .csv and/or .xlsx file first.');
      return;
    }
    setBusy(true);
    try {
      let csv: ParsedStandings | null = null;
      let xlsx: ParsedStandings | null = null;
      for (const f of files) {
        const lower = f.name.toLowerCase();
        if (lower.endsWith('.csv')) {
          csv = parseScanCsv(await f.text(), f.name);
        } else if (lower.endsWith('.xlsx')) {
          xlsx = await parseAllianceActivityXlsx(await f.arrayBuffer(), f.name);
        } else {
          throw new Error(`Unsupported file type: ${f.name} (need .csv or .xlsx)`);
        }
      }
      const merged = mergeParsed(csv, xlsx);
      if (merged.alliances.length === 0) {
        throw new Error('No alliances found in the uploaded file(s).');
      }
      // Best-effort name rescue from the kingdom scan table.
      const nameMap = await buildScanNameMap();
      const { alliances, stats } = applyScanNames(merged.alliances, nameMap);
      setParsed({ asOf: merged.asOf, alliances });
      setStats(stats);
      setSource(files.map((f) => f.name).join(' + '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse the file(s).');
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!parsed) return;
    setPublishing(true);
    setError(null);
    setInfo(null);
    try {
      await saveStandings(
        { asOf: parsed.asOf, source: source || null, alliances: parsed.alliances },
        role,
      );
      setInfo('Standings published.');
      setFiles([]);
      setParsed(null);
      setStats(null);
      if (inputRef.current) inputRef.current.value = '';
      await onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish standings.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className="mb-6 p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)]">
      <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2 mb-1">
        <Upload size={14} /> Refresh standings
      </h2>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Upload the scan CSV and/or the alliance-activity XLSX. Either alone works; when both are
        given, the XLSX drives the alliance list, power and member counts. Publishing replaces the
        standings but never touches assigned roles.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 transition-colors"
        >
          Choose files
        </button>
        <span className="text-xs text-[var(--text-muted)] truncate max-w-[320px]">
          {files.length > 0 ? files.map((f) => f.name).join(', ') : 'No file selected'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={files.length === 0 || busy}
          className="px-4 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] hover:border-[var(--foreground)]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? 'Parsing…' : 'Parse'}
        </button>
      </div>

      {stats && parsed && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            <span className="font-medium text-[var(--foreground)]">
              {fmt(stats.totalAlliances)} alliances · {fmt(stats.totalMembers)} members ·{' '}
              {fmtPct(stats.matchedPct)} names matched to scan
            </span>
            {parsed.asOf ? ` · as of ${parsed.asOf}` : ' · date unknown'}
          </p>
          <div className="max-h-52 overflow-y-auto space-y-1">
            {parsed.alliances.map((a) => (
              <div
                key={a.tag}
                className="flex items-center justify-between text-xs text-[var(--text-secondary)] px-2 py-1 rounded bg-[var(--background-card)]"
              >
                <span className="font-medium text-[var(--foreground)]">{a.displayTag}</span>
                <span className="tabular-nums">
                  {fmtPower(a.power)} · {fmt(a.members)} members · {fmt(a.roster.length)} in roster
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="mt-3 px-4 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {publishing ? 'Publishing…' : 'Publish standings'}
          </button>
        </div>
      )}

      {info && <span className="text-xs text-emerald-400">{info}</span>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </section>
  );
}

// ─── Role editor (officer) ───────────────────────────────────────────────────

function RoleEditor({
  alliance,
  roles,
  role,
  onSaved,
}: {
  alliance: AllianceStanding;
  roles: AllianceRoles | null;
  role: string | null;
  onSaved: (next: AllianceRoles) => void;
}) {
  const roster = alliance.roster;
  const highestId = roster[0]?.id ?? null;

  // R5 draft defaults to the existing R5, else suggests the highest-power member.
  const [r5Id, setR5Id] = useState<number | null>(roles?.r5?.id ?? highestId);
  const MAX_OFFICERS = 12;
  const [officerIds, setOfficerIdsRaw] = useState<number[]>((roles?.officers ?? []).map((p) => p.id));
  // The counselor is one of the officers (a single designation), not a separate pool.
  const [counselorId, setCounselorId] = useState<number | null>(roles?.counselors?.[0]?.id ?? null);

  // Setting officers caps at 12 and clears the counselor if they're no longer an officer.
  const setOfficerIds = (ids: number[]) => {
    const capped = ids.slice(0, MAX_OFFICERS);
    setOfficerIdsRaw(capped);
    setCounselorId((c) => (c != null && capped.includes(c) ? c : null));
  };
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nameOf = (id: number): string => {
    const m = roster.find((x) => x.id === id);
    if (m?.name) return m.name;
    // Fall back to a previously-stored role name (member may have left the roster).
    const stored =
      (roles?.r5 && roles.r5.id === id ? roles.r5.name : null) ??
      roles?.officers.find((p) => p.id === id)?.name ??
      roles?.counselors.find((p) => p.id === id)?.name;
    return stored || String(id);
  };

  const personOf = (id: number): RolePerson => ({ id, name: nameOf(id) });

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    setSaved(false);
    const next: AllianceRoles = {
      tag: alliance.tag,
      r5: r5Id != null ? personOf(r5Id) : null,
      officers: officerIds.map(personOf),
      counselors: counselorId != null ? [personOf(counselorId)] : [],
    };
    try {
      await saveRoles(alliance.tag, { r5: next.r5, officers: next.officers, counselors: next.counselors }, role);
      onSaved(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save roles.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">{alliance.displayTag}</h3>
        <span className="text-xs text-[var(--text-muted)] tabular-nums">
          {fmtPower(alliance.power)} · {fmt(alliance.members)} members
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4318ff] text-white text-xs font-medium hover:bg-[#3a14e0] disabled:opacity-40 transition-colors"
        >
          <Save size={12} /> {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* R5 — single select */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold flex items-center gap-1 mb-1.5">
            <Crown className="w-3 h-3 text-amber-400" /> R5
          </label>
          <select
            value={r5Id ?? ''}
            onChange={(e) => setR5Id(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="w-full px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
          >
            <option value="">— none —</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.id} ({fmtPower(m.power)})
              </option>
            ))}
          </select>
        </div>

        {/* Officers — up to 12, picked from the alliance's members */}
        <MultiRoleField
          label="Officers"
          icon={<Star className="w-3 h-3 text-sky-400" />}
          roster={roster}
          selectedIds={officerIds}
          setSelectedIds={setOfficerIds}
          nameOf={nameOf}
          max={MAX_OFFICERS}
        />

        {/* Counselor — a single officer designated as counselor */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold flex items-center gap-1 mb-1.5">
            <Users className="w-3 h-3 text-emerald-400" /> Counselor
          </label>
          <select
            value={counselorId ?? ''}
            onChange={(e) => setCounselorId(e.target.value ? parseInt(e.target.value, 10) : null)}
            disabled={officerIds.length === 0}
            className="w-full px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30 disabled:opacity-50"
          >
            <option value="">— none —</option>
            {officerIds.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
          {officerIds.length === 0 && (
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">Add officers first — the counselor is one of them.</p>
          )}
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
    </div>
  );
}

function MultiRoleField({
  label,
  icon,
  roster,
  selectedIds,
  setSelectedIds,
  nameOf,
  max,
}: {
  label: string;
  icon: React.ReactNode;
  roster: AllianceStanding['roster'];
  selectedIds: number[];
  setSelectedIds: (ids: number[]) => void;
  nameOf: (id: number) => string;
  max?: number;
}) {
  const atMax = max != null && selectedIds.length >= max;
  const add = (id: number) => {
    if (!selectedIds.includes(id) && !atMax) setSelectedIds([...selectedIds, id]);
  };
  const remove = (id: number) => setSelectedIds(selectedIds.filter((x) => x !== id));

  const available = roster.filter((m) => !selectedIds.includes(m.id));

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold flex items-center gap-1 mb-1.5">
        {icon} {label} <span className="text-[var(--text-muted)]">({selectedIds.length}{max != null ? `/${max}` : ''})</span>
      </label>
      <div className="relative mb-2">
        <Plus className="w-3 h-3 text-[var(--text-muted)] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select
          value=""
          disabled={atMax}
          onChange={(e) => {
            if (e.target.value) add(parseInt(e.target.value, 10));
          }}
          className="w-full pl-6 pr-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30 disabled:opacity-50"
        >
          <option value="">{atMax ? `Max ${max} reached` : 'Add member…'}</option>
          {available.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.id} ({fmtPower(m.power)})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {selectedIds.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--foreground)]"
          >
            <span className="truncate max-w-[120px]" title={nameOf(id)}>
              {nameOf(id)}
            </span>
            <button
              type="button"
              onClick={() => remove(id)}
              className="text-[var(--text-muted)] hover:text-rose-400 transition-colors"
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
