'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Clock, Copy, Lock, Mail, RotateCcw, Trash2, Users } from 'lucide-react';
import { CopyablePlayerCell } from '@/components/migration/CopyablePlayerCell';
import {
  type MigrationCase,
  type MigrationState,
  TERMINAL_STATES,
  listZeroListCases,
  removeFromZeroList,
  markToZero,
  markAfk,
  markException,
  confirmZeroed,
  markZeroedOnce,
  confirmMigrated,
  resetCaseToPending,
  syncZeroListNamesFromLatestScans,
  delayCase,
  undelayCase,
  updateExceptionReason,
  updateDelayReason,
  updateCaseCoords,
  undoLastStateChange,
  subscribeToZeroList,
} from '@/lib/supabase/use-migration-cases';
import { loadLatestLocationPoints, type LocationPoint } from '@/lib/zero-list/scan-data';
import { SortableTh, useTableSort, type SortDir } from '@/components/migration/SortableTh';

interface Props {
  isOfficer: boolean;
  isAdmin: boolean;
  actorName: string | null;
}

const STATE_LABELS: Record<MigrationState, string> = {
  pending: 'Notified',
  claimed: 'Notified',
  contacted: 'Notified',
  excepted: 'Excepted',
  migrated: 'Emigrated',
  marked_to_zero: 'To Zero',
  zeroed: 'Zeroed',
  afk: 'AFK',
};

const STATE_STYLES: Record<MigrationState, string> = {
  pending: 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  claimed: 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  contacted: 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  excepted: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  migrated: 'bg-green-500/15 text-green-400 border-green-500/30',
  marked_to_zero: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  zeroed: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  afk: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

function fmtM(n: number | null | undefined): string {
  if (n == null) return '—';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString();
}

function fmtDelayRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m left`;
  if (hours < 48) return `${Math.round(hours)}h left`;
  return `${Math.round(hours / 24)}d left`;
}

// Mail header presets — same gradient markup the AOO planner uses, plus a
// kingdom-wide variant for cross-alliance announcements. Order matters: the
// dropdown shows entries top-to-bottom.
const MAIL_HEADER_PRESETS: Record<string, { label: string; markup: string }> = {
  kingdom: {
    label: 'Kingdom 3923',
    markup: `<size=30px><color=#4d0000>KINGDOM 3923</color> <color=#cc0000>—</color> <color=#4d0000>A</color><color=#660000>N</color><color=#800000>G</color><color=#990000>M</color><color=#b30000>A</color><color=#cc0000>R</color> <color=#4d0000>N</color><color=#660000>A</color><color=#800000>Z</color><color=#990000>G</color><color=#b30000>U</color><color=#cc0000>L</color> <color=#e60000>G</color><color=#ff0000>U</color><color=#ff0000>A</color><color=#cc0000>R</color><color=#990000>D</color><color=#800000>S</color></size>`,
  },
  ANG: {
    label: 'ANG — Angmar Nazgul Guards',
    markup: `<size=30><color=#4d0000>A</color><color=#660000>N</color><color=#800000>G</color><color=#990000>M</color><color=#b30000>A</color><color=#cc0000>R</color> <color=#4d0000>N</color><color=#660000>A</color><color=#800000>Z</color><color=#990000>G</color><color=#b30000>U</color><color=#cc0000>L</color> <color=#e60000>G</color><color=#ff0000>U</color><color=#ff0000>A</color><color=#cc0000>R</color><color=#990000>D</color><color=#800000>S</color></size>`,
  },
  MNG: {
    label: 'MNG — Mithril Noble Guard',
    markup: `<size=30><color=#004d1a>M</color><color=#006622>I</color><color=#008030>T</color><color=#009939>H</color><color=#00b342>R</color><color=#00cc4d>I</color><color=#00e659>L</color> <color=#004d1a>N</color><color=#006622>O</color><color=#008030>B</color><color=#009939>L</color><color=#00b342>E</color> <color=#00cc4d>G</color><color=#00e659>U</color><color=#00ff66>A</color><color=#66ff99>R</color><color=#99ffbb>D</color></size>`,
  },
  KNG: {
    label: 'KNG — Keepers of Noble Guards',
    markup: `<size=30><color=#003366>K</color><color=#004080>E</color><color=#004d99>E</color><color=#0059b3>P</color><color=#0066cc>E</color><color=#0073e6>R</color><color=#0080ff>S</color> <color=#003366>O</color><color=#004d99>F</color> <color=#003366>N</color><color=#004080>O</color><color=#004d99>B</color><color=#0059b3>L</color><color=#0066cc>E</color> <color=#0073e6>G</color><color=#0080ff>U</color><color=#3399ff>A</color><color=#66b3ff>R</color><color=#99ccff>D</color><color=#cce6ff>S</color></size>`,
  },
  none: { label: 'No header', markup: '' },
};

type MailFieldKey = 'name' | 'alliance' | 'power' | 'coords';
type MailFields = Record<MailFieldKey, boolean>;

const MAIL_FIELD_LABELS: Record<MailFieldKey, string> = {
  name: 'Name',
  alliance: 'Alliance',
  power: 'Power',
  coords: 'Coords',
};

const DEFAULT_MAIL_FIELDS: MailFields = {
  name: true,
  alliance: false,
  power: false,
  coords: false,
};

function generateZeroListMail(args: {
  cases: MigrationCase[];
  locationLookup: Map<number, LocationPoint>;
  headerKey: string;
  signOff: string;
  fields: MailFields;
}): string {
  const { cases, locationLookup, headerKey, signOff, fields } = args;
  const headerMarkup = MAIL_HEADER_PRESETS[headerKey]?.markup ?? '';
  const DIVIDER = '►═════════❂❂❂═════════◄';

  const sorted = [...cases].sort(
    (a, b) =>
      (b.last_seen_power ?? b.power_at_open) - (a.last_seen_power ?? a.power_at_open),
  );

  const lines: string[] = [];
  if (headerMarkup) lines.push(headerMarkup);
  lines.push(DIVIDER);
  lines.push('');
  lines.push('<b>ZERO LIST</b>');
  lines.push('');

  for (const c of sorted) {
    const fb = locationLookup.get(c.character_id);
    const power = c.last_seen_power ?? fb?.power ?? c.power_at_open;
    const x = c.x ?? fb?.x ?? null;
    const y = c.y ?? fb?.y ?? null;
    const alliance = c.last_seen_alliance ?? fb?.alliance ?? null;

    // Identity (name, alliance) on the left of the em-dash, data (power,
    // coords) on the right — matches the table's reading order.
    const idParts: string[] = [];
    if (fields.name) idParts.push(`<b>${c.username}</b>`);
    if (fields.alliance && alliance) idParts.push(`[${alliance}]`);

    const dataParts: string[] = [];
    if (fields.power) dataParts.push(fmtM(power));
    if (fields.coords && x != null && y != null) dataParts.push(`(${x}, ${y})`);

    const idStr = idParts.join(' ');
    const dataStr = dataParts.join(' ');
    const sep = idStr && dataStr ? ' — ' : '';
    const line = `${idStr}${sep}${dataStr}`;
    if (line) lines.push(line);
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push(`<b>— ${signOff || 'Leadership'}</b>`);

  return lines.join('\n');
}

// Valid values for the `zlf` query-string filter, kept in sync with the
// MigrationState enum + the two synthetic buckets ('active', 'all').
const VALID_FILTERS: ReadonlyArray<'active' | 'all' | MigrationState> = [
  'active', 'all', 'pending', 'claimed', 'contacted', 'excepted', 'migrated', 'marked_to_zero', 'zeroed', 'afk',
];

export function ZeroListTab({ isOfficer, isAdmin, actorName }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [cases, setCases] = useState<MigrationCase[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize filter + search from the URL so direct links (e.g. shared by
  // an admin) restore state. We only persist non-default values to keep URLs
  // tidy when nothing is set.
  const [filter, setFilterState] = useState<'active' | 'all' | MigrationState>(() => {
    const raw = searchParams.get('zlf');
    return (raw && VALID_FILTERS.includes(raw as 'active' | 'all' | MigrationState))
      ? (raw as 'active' | 'all' | MigrationState)
      : 'active';
  });
  const [search, setSearchState] = useState(() => searchParams.get('zls') ?? '');

  // Wrappers that also push the change to the URL. Defaults ('active', '')
  // are omitted from the query string so the URL stays clean by default.
  const updateUrl = useCallback((nextFilter: typeof filter, nextSearch: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextFilter === 'active') params.delete('zlf'); else params.set('zlf', nextFilter);
    if (!nextSearch) params.delete('zls'); else params.set('zls', nextSearch);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }, [router, searchParams]);

  const setFilter = useCallback((next: 'active' | 'all' | MigrationState) => {
    setFilterState(next);
    updateUrl(next, search);
  }, [updateUrl, search]);

  const setSearch = useCallback((next: string) => {
    setSearchState(next);
    updateUrl(filter, next);
  }, [updateUrl, filter]);
  const [guideOpen, setGuideOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('zero-list-guide-collapsed') === '0';
  });
  const toggleGuide = () => setGuideOpen((o) => {
    const next = !o;
    try { window.localStorage.setItem('zero-list-guide-collapsed', next ? '0' : '1'); } catch {}
    return next;
  });

  const [locationLookup, setLocationLookup] = useState<Map<number, LocationPoint>>(new Map());
  const [locationLabel, setLocationLabel] = useState<string | null>(null);

  // Toolbar state — header preset + sign-off match the AOO planner mail flow
  // so leadership can pick the same banner per send. Fields control which
  // columns each row of the mail body shows, so the same composer can produce
  // a name-only chat list or a full power+coords briefing.
  const [toolbarOpen, setToolbarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('zero-list-toolbar-open') === '1';
  });
  const [mailHeader, setMailHeader] = useState<string>(() => {
    if (typeof window === 'undefined') return 'kingdom';
    const saved = window.localStorage.getItem('zero-list-mail-header');
    return saved && MAIL_HEADER_PRESETS[saved] ? saved : 'kingdom';
  });
  const [signOff, setSignOff] = useState<string>(() => {
    if (typeof window === 'undefined') return 'Leadership';
    return window.localStorage.getItem('zero-list-mail-signoff') || 'Leadership';
  });
  const [mailFields, setMailFields] = useState<MailFields>(() => {
    if (typeof window === 'undefined') return DEFAULT_MAIL_FIELDS;
    try {
      const saved = window.localStorage.getItem('zero-list-mail-fields');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<MailFields>;
        return { ...DEFAULT_MAIL_FIELDS, ...parsed };
      }
    } catch {}
    return DEFAULT_MAIL_FIELDS;
  });
  const [copiedNames, setCopiedNames] = useState(false);
  const [openedMail, setOpenedMail] = useState(false);

  const toggleToolbar = () => setToolbarOpen((o) => {
    const next = !o;
    try { window.localStorage.setItem('zero-list-toolbar-open', next ? '1' : '0'); } catch {}
    return next;
  });
  const toggleMailField = (key: MailFieldKey) => setMailFields((f) => ({ ...f, [key]: !f[key] }));

  useEffect(() => {
    try { window.localStorage.setItem('zero-list-mail-header', mailHeader); } catch {}
  }, [mailHeader]);
  useEffect(() => {
    try { window.localStorage.setItem('zero-list-mail-signoff', signOff); } catch {}
  }, [signOff]);
  useEffect(() => {
    try { window.localStorage.setItem('zero-list-mail-fields', JSON.stringify(mailFields)); } catch {}
  }, [mailFields]);

  const refetch = useCallback(async () => {
    try {
      const [rows, loc] = await Promise.all([listZeroListCases(), loadLatestLocationPoints()]);
      setCases(rows);
      const m = new Map<number, LocationPoint>();
      for (const p of loc.points) m.set(p.governorId, p);
      setLocationLookup(m);
      setLocationLabel(loc.scan?.label ?? null);
    } catch (e) {
      console.error('Zero list refresh failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    const unsub = subscribeToZeroList(() => void refetch());
    return () => unsub();
  }, [refetch]);

  // On mount, propagate any in-game name changes to the Zero List. Players
  // sometimes rename — the gov_id stays the same, so we use that to refresh
  // the username from the freshest scan we have. Runs once per mount; if
  // anything was renamed, we trigger a refetch so the UI shows the new names.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { renamed } = await syncZeroListNamesFromLatestScans();
        if (!cancelled && renamed > 0) void refetch();
      } catch (e) {
        console.warn('Zero list name sync failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [refetch]);

  // Power-tier members shouldn't see entries that an officer/admin has put on
  // hold — the delay window is meant to give the player a chance to leave
  // without an immediate attack. Officer/admin still see them with a badge.
  // Excepted cases are also hidden from the power tier — they shouldn't be
  // attacked. Officers/admins keep them visible so the prior decision is
  // discoverable ("we already chose to spare this person").
  const visibleCases = useMemo(() => {
    if (isOfficer) return cases;
    const now = Date.now();
    return cases.filter(
      (c) =>
        c.state !== 'excepted' &&
        (!c.delayed_until || new Date(c.delayed_until).getTime() <= now),
    );
  }, [cases, isOfficer]);

  type ZSortField = 'username' | 'power' | 'alliance' | 'state';
  const sort = useTableSort<ZSortField>('power', {
    username: 'asc',
    power: 'desc',
    alliance: 'asc',
    state: 'asc',
  });

  const isInActive = useCallback(
    (c: MigrationCase) => !TERMINAL_STATES.includes(c.state) || (isOfficer && c.state === 'excepted'),
    [isOfficer],
  );

  const filtered = useMemo(() => {
    let list = visibleCases;
    if (filter === 'active') {
      // For officers/admins, treat 'excepted' as still visible in the Active
      // view so they can see at a glance that someone was on the list and was
      // explicitly excepted. (Power tier never sees excepted at all.)
      list = list.filter(isInActive);
    } else if (filter !== 'all') list = list.filter((c) => c.state === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      list = list.filter(
        (c) =>
          c.username.toLowerCase().includes(q) || (qDigits.length >= 3 && String(c.character_id).includes(qDigits)),
      );
    }
    const sign = sort.dir === 'asc' ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      const fa = locationLookup.get(a.character_id);
      const fb = locationLookup.get(b.character_id);
      if (sort.field === 'username') cmp = a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
      else if (sort.field === 'power') cmp = (a.last_seen_power ?? a.power_at_open) - (b.last_seen_power ?? b.power_at_open);
      else if (sort.field === 'alliance') {
        const aa = (a.last_seen_alliance ?? fa?.alliance ?? '').toLowerCase();
        const bb = (b.last_seen_alliance ?? fb?.alliance ?? '').toLowerCase();
        cmp = aa.localeCompare(bb);
      }
      else if (sort.field === 'state') cmp = a.state.localeCompare(b.state);
      // Tiebreak on power desc so equal-key rows are stable
      if (cmp === 0) cmp = (b.last_seen_power ?? b.power_at_open) - (a.last_seen_power ?? a.power_at_open);
      else cmp *= sign;
      return cmp;
    });
    return sorted;
  }, [visibleCases, filter, search, sort.field, sort.dir, locationLookup]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { active: 0, all: visibleCases.length };
    for (const c of visibleCases) {
      if (isInActive(c)) out.active = (out.active ?? 0) + 1;
      out[c.state] = (out[c.state] ?? 0) + 1;
    }
    return out;
  }, [visibleCases, isInActive]);

  const delayedCount = useMemo(() => {
    if (!isOfficer) return 0;
    const now = Date.now();
    return cases.filter((c) => c.delayed_until && new Date(c.delayed_until).getTime() > now).length;
  }, [cases, isOfficer]);

  // Excepted cases are spared by admin decision and must never be broadcast
  // as attack targets — strip them out of every outbound action regardless of
  // which filter the table is currently showing.
  const mailableCases = useMemo(
    () => filtered.filter((c) => c.state !== 'excepted'),
    [filtered],
  );
  const exceptedHidden = filtered.length - mailableCases.length;

  const copyNamesToClipboard = useCallback(async () => {
    if (mailableCases.length === 0) return;
    const text = mailableCases.map((c) => c.username).join(', ');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedNames(true);
    setTimeout(() => setCopiedNames(false), 2000);
  }, [mailableCases]);

  // Stash the generated mail in localStorage and open RoK Mail in a new tab —
  // same hand-off the AOO planner uses (see app/aoo-strategy/page.tsx).
  const openMailDraft = useCallback(() => {
    if (mailableCases.length === 0) return;
    const mail = generateZeroListMail({
      cases: mailableCases,
      locationLookup,
      headerKey: mailHeader,
      signOff,
      fields: mailFields,
    });
    try { localStorage.setItem('rok-mail-draft', mail); } catch {}
    window.open('/rok-mail', '_blank');
    setOpenedMail(true);
    setTimeout(() => setOpenedMail(false), 2000);
  }, [mailableCases, locationLookup, mailHeader, signOff, mailFields]);

  if (loading) return <div className="text-sm text-[var(--text-muted)] py-8 text-center">Loading…</div>;

  return (
    <div>
      {/* How this works — collapsible */}
      <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] overflow-hidden">
        <button
          onClick={toggleGuide}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--background-hover)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">How the Zero List works</span>
            {!guideOpen && <span className="text-[11px] text-[var(--text-muted)]">click to expand</span>}
          </div>
          <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] text-sm text-[var(--text-secondary)] space-y-4">
            <p className="text-xs text-[var(--text-muted)]">
              The Zero List is the <strong>kingdom-wide kill queue</strong>. It&apos;s a single continuous list — no deadline, no exception workflow. Power members come here to grab coords and attack. Admins manage who&apos;s on it. Cycle cases marked <em>To Zero</em> automatically appear here too (with a <span className="inline-block px-1 py-0 rounded text-[9px] font-semibold border bg-violet-500/15 text-violet-400 border-violet-500/30">from cycle</span> badge) — no manual sync needed.
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              <strong>Delay</strong> button (officer / admin) puts an entry on hold for a chosen number of hours so the player has a chance to leave voluntarily. While delayed, the row is <strong>hidden from the power tier</strong> and shows an amber <em>delayed · Nh left</em> badge to officers/admins. Click <strong>Resume</strong> to lift the delay early.
            </p>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Power member, going on a hunt</div>
              <ol className="space-y-1 text-xs list-decimal pl-5">
                <li>Open this Zero List tab. The default filter is &quot;Active&quot; — that&apos;s everyone who still needs to be dealt with.</li>
                <li>Pick a target — usually highest power first, or whoever&apos;s closest to your city.</li>
                <li>Click the <strong>(x, y)</strong> cell. It copies <code className="text-[var(--text-secondary)]">x,y</code> to your clipboard.</li>
                <li>In game: open Map → click the magnifying glass → paste the coords → teleport / scout / attack.</li>
                <li>You don&apos;t mark anything here — just attack. Admins update the status when the zero is confirmed.</li>
              </ol>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — target gets zeroed</div>
              <ol className="space-y-1 text-xs list-decimal pl-5">
                <li>When admin commits power members to attack a target, they click <strong>To Zero</strong> on the row. State turns orange — &quot;decision made, action pending&quot;.</li>
                <li>After the attack lands and the player is at near-zero power, <strong>any officer or admin</strong> can click <strong>Confirm Zeroed</strong>. State turns red — done.</li>
                <li>If they bailed and left the kingdom before you finished, click <strong>Emigrated</strong> instead.</li>
                <li>Confirmed-zeroed (and emigrated/excepted/afk) cases are filtered out of the default <em>Active</em> view. Switch the dropdown to <em>Zeroed</em> or <em>All</em> to see them — or use the inline link that appears below the filter bar when there are hidden terminal cases.</li>
              </ol>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Admin, adding people</div>
              <p className="text-xs">You don&apos;t add people <em>on this tab</em> — switch to the <strong>Scans</strong> tab. The default sub-tab there is <strong>Find Candidates</strong>:</p>
              <ol className="space-y-1 text-xs list-decimal pl-5 mt-1">
                <li>Each card has a count badge. The biggest number is where the work is.</li>
                <li>Open the card, look at the rows.</li>
                <li>Check the boxes you want, click <strong>Add to Zero List</strong>.</li>
                <li>Come back here — they&apos;re queued.</li>
              </ol>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Admin, fresh coordinates before a war</div>
              <ol className="space-y-1 text-xs list-decimal pl-5">
                <li>Open <strong>Scans → Location Upload</strong>.</li>
                <li>Drop your <code className="text-[var(--text-secondary)]">scan_3923.csv</code> file. Leave &quot;Save as kingdom scan&quot; checked.</li>
                <li>Within a second, every Zero List entry whose Gov ID is in the file gets fresh coords + power + alliance.</li>
                <li>Power members can now click coords on this tab and get accurate locations.</li>
              </ol>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">What each state means</div>
              <ul className="text-xs space-y-1">
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]">Notified</span> On the list, no action yet. Default state for new additions.</li>
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-orange-500/15 text-orange-400 border-orange-500/30">To Zero</span> Decision made. Power members should attack.</li>
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-rose-500/15 text-rose-400 border-rose-500/30">Zeroed</span> Confirmed dead in-game. Done.</li>
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-green-500/15 text-green-400 border-green-500/30">Emigrated</span> Left the kingdom on their own.</li>
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-amber-500/15 text-amber-400 border-amber-500/30">Excepted</span> Admin granted a pass. They stay.</li>
                <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-slate-500/15 text-slate-300 border-slate-500/30">AFK</span> Inactive but staying. Treated as zero for kingdom-power calculation.</li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Things you might miss</div>
              <ul className="text-xs space-y-1 list-disc pl-5">
                <li>The (x, y) cell is a <strong>button</strong> — click it to copy. The little copy icon turns into a green checkmark for ~1.5s when it works.</li>
                <li>The Active filter (default) hides terminal cases. Switch to <em>Zeroed</em> or <em>All</em> to see history.</li>
                <li>If the (x, y) cell is empty (em dash), the player was added from auto-scrape data. Run <em>Location Upload</em> to backfill from a fresh location CSV.</li>
                <li>Power and Officer roles are <strong>both view-only</strong> here. Only Admin sees action buttons.</li>
                <li>Don&apos;t click the trash icon casually — it&apos;s a hard delete with no undo. Use a state like Excepted or AFK if you want to keep the record.</li>
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* Role-specific status line */}
      {!isOfficer && (
        <section className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300">
          You're signed in as <strong>Power</strong> — view-only on this list. Use the coords to attack; ping an admin to mark targets zeroed.
        </section>
      )}
      {isOfficer && !isAdmin && (
        <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-3 text-xs text-[var(--text-secondary)]">
          You're signed in as <strong>Officer</strong> — you can mark people <em>Emigrated</em>, <em>Confirm Zeroed</em>, and put rows on <em>Delay</em>. Adding/removing entries, AFK, Except are admin-only — admins curate this list from the Scans tab.
        </section>
      )}

      {/* Filter bar */}
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or governor ID…"
          className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--foreground)]/30 w-full sm:w-64"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'active' | 'all' | MigrationState)}
          className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
        >
          <option value="active">Active ({counts.active ?? 0})</option>
          <option value="all">All ({counts.all ?? 0})</option>
          <option value="marked_to_zero">To Zero ({counts.marked_to_zero ?? 0})</option>
          <option value="zeroed">Zeroed ({counts.zeroed ?? 0})</option>
          <option value="migrated">Emigrated ({counts.migrated ?? 0})</option>
          <option value="excepted">Excepted ({counts.excepted ?? 0})</option>
          <option value="afk">AFK ({counts.afk ?? 0})</option>
        </select>
        <button
          onClick={() => void refetch()}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)] transition-colors"
          title="Refresh"
        >
          <RotateCcw size={14} />
        </button>
        <span className="text-xs text-[var(--text-muted)] ml-auto">
          {filtered.length} shown
          {delayedCount > 0 && (
            <> · <span className="text-amber-400">{delayedCount} delayed</span> (officer-only)</>
          )}
          {locationLabel && (
            <> · coords from <span className="text-[var(--text-secondary)]">{locationLabel}</span></>
          )}
        </span>
      </section>

      {/* Send / mail toolbar — collapsible. Operates on whatever is currently
       *  filtered, so admins can compose per-state mails (e.g. only the To
       *  Zero set) by switching the filter dropdown above. Mail composer is
       *  officer+ only; copying names is fine for anyone since the list is
       *  already shared. */}
      <section className="mb-3 rounded-lg bg-[var(--background-card)] border border-[var(--border)] overflow-hidden">
        <button
          onClick={toggleToolbar}
          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--background-hover)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-[var(--text-muted)]" />
            <span className="text-sm font-semibold text-[var(--foreground)]">Copy / send mail</span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {mailableCases.length} target{mailableCases.length === 1 ? '' : 's'}
              {exceptedHidden > 0 && (
                <> · <span className="text-amber-400">{exceptedHidden} excepted excluded</span></>
              )}
            </span>
          </div>
          <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${toolbarOpen ? 'rotate-180' : ''}`} />
        </button>
        {toolbarOpen && (
          <div className="px-3 pb-3 pt-2 border-t border-[var(--border)] space-y-3">
            {/* Quick copy block — names only, comma-separated, for in-game chat. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] w-full sm:w-32">Quick copy</span>
              <button
                onClick={() => void copyNamesToClipboard()}
                disabled={mailableCases.length === 0}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors border ${
                  copiedNames
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-[var(--background-secondary)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--background-hover)] disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
                title="Copy comma-separated names — excepted players are excluded automatically"
              >
                {copiedNames ? <>✓ Copied!</> : <><Users size={14} /> Copy {mailableCases.length} name{mailableCases.length === 1 ? '' : 's'}</>}
              </button>
              <span className="text-[11px] text-[var(--text-muted)]">
                comma-separated, for in-game chat
                {exceptedHidden > 0 && (
                  <> · <span className="text-amber-400">excepted excluded</span></>
                )}
              </span>
            </div>

            {isOfficer && (
              <div className="rounded-md border border-[var(--border)] bg-[var(--background-secondary)]/40 p-3 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Compose mail</div>

                {/* Header banner */}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-[var(--text-secondary)] w-full sm:w-32">Header banner</label>
                  <select
                    value={mailHeader}
                    onChange={(e) => setMailHeader(e.target.value)}
                    className="flex-1 min-w-[200px] px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs sm:text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                  >
                    {Object.entries(MAIL_HEADER_PRESETS).map(([key, p]) => (
                      <option key={key} value={key}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {/* Per-row field checkboxes */}
                <div className="flex flex-wrap items-start gap-2">
                  <label className="text-xs text-[var(--text-secondary)] w-full sm:w-32 pt-1">Include per row</label>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                    {(Object.keys(MAIL_FIELD_LABELS) as MailFieldKey[]).map((key) => (
                      <label key={key} className="inline-flex items-center gap-1.5 text-xs sm:text-sm cursor-pointer select-none text-[var(--foreground)]">
                        <input
                          type="checkbox"
                          checked={mailFields[key]}
                          onChange={() => toggleMailField(key)}
                          className="w-3.5 h-3.5 rounded border-[var(--border)] bg-[var(--background-secondary)] accent-[#4318ff]"
                        />
                        {MAIL_FIELD_LABELS[key]}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Sign-off */}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-[var(--text-secondary)] w-full sm:w-32">Sign-off</label>
                  <input
                    value={signOff}
                    onChange={(e) => setSignOff(e.target.value)}
                    placeholder="Leadership"
                    className="flex-1 min-w-[200px] px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs sm:text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--foreground)]/30"
                  />
                </div>

                {/* Action button */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={openMailDraft}
                    disabled={mailableCases.length === 0}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors border ${
                      openedMail
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-[#4318ff]/15 text-[#a89dff] border-[#4318ff]/40 hover:bg-[#4318ff]/25 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                    title="Open RoK Mail pre-filled — excepted players are excluded automatically"
                  >
                    {openedMail ? <>✓ Opened</> : <><Mail size={14} /> Compose mail with {mailableCases.length} target{mailableCases.length === 1 ? '' : 's'}</>}
                  </button>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    opens RoK Mail in a new tab, pre-filled
                    {exceptedHidden > 0 && (
                      <> · <span className="text-amber-400">{exceptedHidden} excepted excluded</span></>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Hint when Active filter hides finished cases.
       *  Officers see excepted in Active, so we don't list it as hidden for them. */}
      {filter === 'active' && ((counts.zeroed ?? 0) + (counts.migrated ?? 0) + (isOfficer ? 0 : (counts.excepted ?? 0)) + (counts.afk ?? 0)) > 0 && (
        <section className="mb-3 rounded-lg bg-[var(--background-card)] border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-3">
          <span>
            Hidden by &quot;Active&quot; filter:
            {(counts.zeroed ?? 0) > 0 && <> <button onClick={() => setFilter('zeroed')} className="text-rose-400 hover:underline">{counts.zeroed} zeroed</button></>}
            {(counts.migrated ?? 0) > 0 && <> · <button onClick={() => setFilter('migrated')} className="text-green-400 hover:underline">{counts.migrated} emigrated</button></>}
            {!isOfficer && (counts.excepted ?? 0) > 0 && <> · <button onClick={() => setFilter('excepted')} className="text-amber-400 hover:underline">{counts.excepted} excepted</button></>}
            {(counts.afk ?? 0) > 0 && <> · <button onClick={() => setFilter('afk')} className="text-slate-300 hover:underline">{counts.afk} afk</button></>}
          </span>
          <button onClick={() => setFilter('all')} className="ml-auto text-[var(--text-secondary)] hover:text-[var(--foreground)] underline-offset-2 hover:underline">
            Show all
          </button>
        </section>
      )}

      {/* Table */}
      <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
        <div className="overflow-auto max-h-[calc(100vh-280px)] rounded-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20 bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider shadow-[0_1px_0_var(--border)]">
              <tr>
                <SortableTh label="Player" field="username" active={sort.field} dir={sort.dir} onSort={sort.toggle} />
                <SortableTh label="Power" field="power" align="right" active={sort.field} dir={sort.dir} onSort={sort.toggle} />
                <SortableTh label="Alliance" field="alliance" active={sort.field} dir={sort.dir} onSort={sort.toggle} />
                <th className="px-3 py-2 text-left">Coords</th>
                <SortableTh label="State" field="state" active={sort.field} dir={sort.dir} onSort={sort.toggle} />
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <ZeroListRow
                  key={c.id}
                  caseRow={c}
                  locationFallback={locationLookup.get(c.character_id) ?? null}
                  isOfficer={isOfficer}
                  isAdmin={isAdmin}
                  actorName={actorName}
                  onChange={() => void refetch()}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                    {cases.length === 0
                      ? isAdmin
                        ? 'Zero list is empty. Use the Scans tab → Compare or Migrant CSV to add targets.'
                        : 'Zero list is empty. Admins populate it from the Scans tab.'
                      : 'No matches.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ZeroListRow({
  caseRow: c,
  locationFallback,
  isOfficer,
  isAdmin,
  actorName,
  onChange,
}: {
  caseRow: MigrationCase;
  /** Location-scan record for this Gov ID (if any) — used to fill in coords/
   *  alliance/power that aren't on the migration_cases row itself. Lets cycle
   *  cases that auto-carry to the Zero List get coords without a DB write. */
  locationFallback: LocationPoint | null;
  isOfficer: boolean;
  isAdmin: boolean;
  actorName: string | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const isActive = !TERMINAL_STATES.includes(c.state);

  // Effective values — prefer the row's stored value (frozen at add time or
  // refresh time), fall back to whatever the latest location scan has.
  const effX = c.x ?? locationFallback?.x ?? null;
  const effY = c.y ?? locationFallback?.y ?? null;
  const effAlliance = c.last_seen_alliance ?? locationFallback?.alliance ?? null;
  const effPower = c.last_seen_power ?? locationFallback?.power ?? c.power_at_open;

  const wrap = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onChange();
    } catch (e) {
      console.error('Action failed', e);
      alert(`Action failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const copyCoords = () => {
    if (effX == null || effY == null) return;
    const text = `${effX},${effY}`;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const actor = actorName?.trim() || 'admin';

  return (
    <tr className="border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors">
      <td className="px-3 py-2">
        <CopyablePlayerCell name={c.username} govId={c.character_id} />
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
        {fmtM(effPower)}
      </td>
      <td className="px-3 py-2 text-[var(--text-secondary)]">
        {effAlliance || <span className="text-[var(--text-muted)]">—</span>}
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        <div className="inline-flex items-center gap-1">
          {effX != null && effY != null ? (
            <button
              onClick={copyCoords}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[var(--text-secondary)] hover:bg-[var(--background-hover)] hover:text-[var(--foreground)] transition-colors"
              title="Copy coordinates"
            >
              ({effX}, {effY}) {copied ? <span className="text-emerald-400">✓</span> : <Copy size={10} />}
            </button>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          )}
          {isAdmin && (
            <button
              disabled={busy}
              onClick={() => {
                const current = c.x != null && c.y != null ? `${c.x},${c.y}` : '';
                const raw = window.prompt(
                  'Enter coordinates as "x,y" (leave empty to clear and fall back to scan data):',
                  current,
                );
                if (raw === null) return;
                const trimmed = raw.trim();
                if (trimmed === '') {
                  void wrap(() => updateCaseCoords(c.id, null, null));
                  return;
                }
                const m = trimmed.match(/^\(?\s*(-?\d+)\s*[, ]\s*(-?\d+)\s*\)?$/);
                if (!m) {
                  alert('Could not parse coordinates. Use the format "x,y" (e.g. 412,876).');
                  return;
                }
                const x = Number(m[1]);
                const y = Number(m[2]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return;
                void wrap(() => updateCaseCoords(c.id, x, y));
              }}
              className="text-[10px] underline text-[var(--text-muted)] hover:text-[var(--foreground)] shrink-0"
              title={effX != null && effY != null ? 'Edit coordinates' : 'Set coordinates'}
            >
              {effX != null && effY != null ? 'edit' : 'set'}
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATE_STYLES[c.state]}`}>
            {STATE_LABELS[c.state]}
          </span>
          {c.source_kind === 'cycle' && (
            <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold border bg-violet-500/15 text-violet-400 border-violet-500/30" title="Auto-carried from a Cycle. Resolve via the Cycle tab or via actions on this row.">
              from cycle
            </span>
          )}
          {c.zeroed_count > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border bg-rose-500/15 text-rose-300 border-rose-500/30"
              title={`Zeroed ${c.zeroed_count} ${c.zeroed_count === 1 ? 'time' : 'times'}${c.last_zeroed_at ? ` · last on ${new Date(c.last_zeroed_at).toLocaleString()}` : ''}${c.last_zeroed_by ? ` by ${c.last_zeroed_by}` : ''}`}
            >
              ×{c.zeroed_count} zeroed
            </span>
          )}
          {c.delayed_until && new Date(c.delayed_until).getTime() > Date.now() && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border bg-amber-500/15 text-amber-400 border-amber-500/30"
              title={`Hidden from power tier until ${new Date(c.delayed_until).toLocaleString()}${c.delayed_by ? ` · by ${c.delayed_by}` : ''}`}
            >
              <Clock size={9} /> delayed · {fmtDelayRemaining(c.delayed_until)}
            </span>
          )}
        </div>
        {c.state === 'excepted' && (
          <div className="mt-1 flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-1 text-[11px] text-amber-400">
            <span className="font-semibold">Exception:</span>
            <span className="italic flex-1 whitespace-pre-wrap break-words">
              {c.exception_reason || <span className="opacity-60">(no reason given)</span>}
            </span>
            {isAdmin && (
              <button
                disabled={busy}
                onClick={() => {
                  const next = window.prompt('Edit exception reason:', c.exception_reason ?? '');
                  if (next === null) return;
                  void wrap(() => updateExceptionReason(c.id, next.trim() || null));
                }}
                className="text-[10px] underline opacity-70 hover:opacity-100 shrink-0"
                title="Edit exception reason"
              >
                edit
              </button>
            )}
          </div>
        )}
        {c.delayed_until && new Date(c.delayed_until).getTime() > Date.now() && (
          <div className="mt-1 flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-1 text-[11px] text-amber-400">
            <span className="font-semibold">Delay:</span>
            <span className="italic flex-1 whitespace-pre-wrap break-words">
              {c.delayed_reason || <span className="opacity-60">(no reason given)</span>}
            </span>
            {isOfficer && (
              <button
                disabled={busy}
                onClick={() => {
                  const next = window.prompt('Edit delay reason:', c.delayed_reason ?? '');
                  if (next === null) return;
                  void wrap(() => updateDelayReason(c.id, next.trim() || null));
                }}
                className="text-[10px] underline opacity-70 hover:opacity-100 shrink-0"
                title="Edit delay reason"
              >
                edit
              </button>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {!isAdmin && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <Lock size={10} /> view only
            </span>
          )}
          {isAdmin && isActive && c.state !== 'marked_to_zero' && (
            <button
              disabled={busy}
              onClick={() => wrap(() => markToZero(c.id, actor))}
              className="px-2 py-1 text-[11px] rounded bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25"
            >
              To Zero
            </button>
          )}
          {isOfficer && c.state === 'marked_to_zero' && (
            <button
              disabled={busy}
              onClick={() => wrap(() => confirmZeroed(c.id, actor))}
              className="px-2 py-1 text-[11px] rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25"
              title="Closes the case — they're done. Use Zeroed Once instead if you expect they'll re-build and need zeroing again."
            >
              Confirm Zeroed
            </button>
          )}
          {isOfficer && isActive && (
            <button
              disabled={busy}
              onClick={() => wrap(() => markZeroedOnce(c.id, actor))}
              className="px-2 py-1 text-[11px] rounded bg-rose-500/10 text-rose-300 border border-rose-500/25 hover:bg-rose-500/20"
              title="Records that they were zeroed once. Keeps the row active so the queue stays visible — use this for repeat offenders."
            >
              Zeroed Once
            </button>
          )}
          {isOfficer && isActive && (
            <button
              disabled={busy}
              onClick={() => wrap(() => confirmMigrated(c.id, actor))}
              className="px-2 py-1 text-[11px] rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25"
              title="Player left the kingdom"
            >
              Emigrated
            </button>
          )}
          {isAdmin && isActive && (
            <button
              disabled={busy}
              onClick={() => wrap(() => markAfk(c.id, actor))}
              className="px-2 py-1 text-[11px] rounded bg-slate-500/15 text-slate-300 border border-slate-500/30 hover:bg-slate-500/25"
            >
              AFK
            </button>
          )}
          {isAdmin && isActive && c.state !== 'excepted' && (
            <button
              disabled={busy}
              onClick={() => {
                const reason = window.prompt('Exception reason?');
                if (!reason) return;
                void wrap(() => markException(c.id, actor, reason));
              }}
              className="px-2 py-1 text-[11px] rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
            >
              Except
            </button>
          )}
          {isOfficer && (!isActive || c.state === 'marked_to_zero') && (
            <button
              disabled={busy}
              onClick={() => wrap(async () => { await undoLastStateChange(c.id); })}
              className="px-2 py-1 text-[11px] rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)] inline-flex items-center gap-1"
              title="Revert the most recent state change one step (e.g. undo Confirm Zeroed back to Mark to Zero)."
            >
              <RotateCcw size={10} /> Undo
            </button>
          )}
          {isAdmin && !isActive && (
            <button
              disabled={busy}
              onClick={() => {
                if (!confirm(`Hard reset ${c.username} back to the start? Clears every state timestamp.`)) return;
                void wrap(() => resetCaseToPending(c.id));
              }}
              className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-[var(--foreground)]"
              title="Hard reset — clears every state timestamp and returns to Notified."
            >
              Reset
            </button>
          )}
          {isOfficer && isActive && (() => {
            const isDelayedNow = !!c.delayed_until && new Date(c.delayed_until).getTime() > Date.now();
            if (isDelayedNow) {
              return (
                <button
                  disabled={busy}
                  onClick={() => wrap(() => undelayCase(c.id))}
                  className="px-2 py-1 text-[11px] rounded bg-amber-500/10 text-amber-300 border border-amber-500/25 hover:bg-amber-500/20"
                  title="Lift the delay — this case becomes visible to power tier again"
                >
                  Resume
                </button>
              );
            }
            return (
              <button
                disabled={busy}
                onClick={() => {
                  const raw = window.prompt('Delay how many hours? (default 24)', '24');
                  if (raw === null) return;
                  const hrs = Number(raw);
                  if (!Number.isFinite(hrs) || hrs <= 0) return;
                  const reason = window.prompt('Reason? (optional — power tier won\'t see this row until the delay expires)', '') ?? '';
                  void wrap(() => delayCase(c.id, hrs, actor, reason || null));
                }}
                className="px-2 py-1 text-[11px] rounded bg-amber-500/10 text-amber-300 border border-amber-500/25 hover:bg-amber-500/20 inline-flex items-center gap-1"
                title="Hide from power tier for a while (gives the player a chance to leave first)"
              >
                <Clock size={10} /> Delay
              </button>
            );
          })()}
          {isAdmin && c.source_kind === 'zero_list' && (
            <button
              disabled={busy}
              onClick={() => {
                if (!confirm(`Remove ${c.username} from the Zero List? This is a hard delete.`)) return;
                void wrap(() => removeFromZeroList(c.id));
              }}
              className="px-2 py-1 text-[11px] rounded text-rose-400 hover:bg-rose-500/10"
              title="Remove from list (delete)"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
