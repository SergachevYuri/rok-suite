// Data layer for the Alliances feature.
//
// Two Supabase tables back this page (both already exist — see
// lib/supabase/schema-alliances.sql for the documentation DDL):
//
//   alliance_standings  singleton (id=1). The published snapshot of the
//                       kingdom's alliances — replaced wholesale each time an
//                       officer uploads + publishes a fresh scan.
//   alliance_roles      one row per alliance tag. Manually-assigned R5 /
//                       Officers / Counselors. Kept SEPARATE from standings so
//                       roles survive re-uploads (they reference members by the
//                       stable numeric player id).

import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────

export interface RosterMember {
  id: number;
  name: string;
  power: number;
}

/** One alliance in a published standings snapshot. */
export interface AllianceStanding {
  /** Raw in-game tag, kept verbatim (e.g. "'ANG"). Stable key for roles. */
  tag: string;
  /** Tag with a single leading apostrophe stripped (e.g. "ANG"). Display only. */
  displayTag: string;
  power: number;
  members: number;
  roster: RosterMember[];
}

/** The whole alliance_standings singleton row, decoded. */
export interface StandingsDoc {
  updatedAt: string | null;
  updatedBy: string | null;
  asOf: string | null;
  source: string | null;
  alliances: AllianceStanding[];
}

/** A person referenced from a role slot. Only id + name — power is looked up
 *  from the live roster at render time so names stay fresh across re-uploads. */
export interface RolePerson {
  id: number;
  name: string;
}

export interface AllianceRoles {
  tag: string;
  r5: RolePerson | null;
  officers: RolePerson[];
  counselors: RolePerson[];
}

const STANDINGS_ID = 1;

// ─── Standings ──────────────────────────────────────────────────────────────

export async function loadStandings(): Promise<StandingsDoc | null> {
  const sb = createClient();
  const { data, error } = await sb
    .from('alliance_standings')
    .select('updated_at, updated_by, as_of, source, alliances')
    .eq('id', STANDINGS_ID)
    .maybeSingle();
  if (error) {
    console.error('loadStandings failed', error);
    return null;
  }
  if (!data) return null;
  return {
    updatedAt: data.updated_at ?? null,
    updatedBy: data.updated_by ?? null,
    asOf: data.as_of ?? null,
    source: data.source ?? null,
    alliances: (data.alliances as AllianceStanding[]) ?? [],
  };
}

/** Replace the standings singleton. Does NOT touch alliance_roles. */
export async function saveStandings(
  standing: { asOf: string | null; source: string | null; alliances: AllianceStanding[] },
  officerName: string | null,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('alliance_standings').upsert(
    {
      id: STANDINGS_ID,
      updated_at: new Date().toISOString(),
      updated_by: officerName,
      as_of: standing.asOf,
      source: standing.source,
      alliances: standing.alliances,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

// ─── Roles ──────────────────────────────────────────────────────────────────

export async function loadRoles(): Promise<AllianceRoles[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('alliance_roles')
    .select('tag, r5, officers, counselors');
  if (error) {
    console.error('loadRoles failed', error);
    return [];
  }
  return (data ?? []).map((r) => ({
    tag: r.tag as string,
    r5: (r.r5 as RolePerson | null) ?? null,
    officers: (r.officers as RolePerson[]) ?? [],
    counselors: (r.counselors as RolePerson[]) ?? [],
  }));
}

export async function saveRoles(
  tag: string,
  roles: { r5: RolePerson | null; officers: RolePerson[]; counselors: RolePerson[] },
  officerName: string | null,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('alliance_roles').upsert(
    {
      tag,
      r5: roles.r5,
      officers: roles.officers,
      counselors: roles.counselors,
      updated_at: new Date().toISOString(),
      updated_by: officerName,
    },
    { onConflict: 'tag' },
  );
  if (error) throw error;
}

// ─── Scan name lookup (special-character rescue) ─────────────────────────────

/** Build an id→name lookup from the kingdom scan players table. Best-effort:
 *  paginates past Supabase's 1000-row default and swallows errors (returns an
 *  empty map) so a scan-table hiccup never blocks a publish. Later (higher
 *  scan_id) rows win, so the most-recent name for an id is kept. */
export async function buildScanNameMap(): Promise<Map<number, string>> {
  const sb = createClient();
  const map = new Map<number, string>();
  try {
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from('kingdom_scan_players')
        .select('governor_id, name')
        .order('scan_id', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data as { governor_id: number; name: string }[]) {
        if (r.governor_id != null && r.name) map.set(r.governor_id, r.name);
      }
      if (data.length < 1000) break;
      from += 1000;
    }
  } catch (e) {
    console.warn('buildScanNameMap failed (best-effort, continuing)', e);
  }
  return map;
}

export interface NameMatchStats {
  totalAlliances: number;
  totalMembers: number;
  /** Fraction (0–1) of roster entries whose id was found in the scan map. */
  matchedPct: number;
}

/** Substitute scan names for roster entries whose file name is empty or looks
 *  like a placeholder ("Governor<digits>"). Keeps the numeric id as the stable
 *  key and leaves real names untouched. Returns match stats for the summary. */
export function applyScanNames(
  alliances: AllianceStanding[],
  nameMap: Map<number, string>,
): { alliances: AllianceStanding[]; stats: NameMatchStats } {
  let total = 0;
  let matched = 0;
  const out = alliances.map((a) => ({
    ...a,
    roster: a.roster.map((m) => {
      total++;
      const scanName = nameMap.get(m.id);
      if (scanName) matched++;
      const needsSub = !m.name || /^Governor\d+$/.test(m.name);
      return needsSub && scanName ? { ...m, name: scanName } : m;
    }),
  }));
  return {
    alliances: out,
    stats: {
      totalAlliances: alliances.length,
      totalMembers: total,
      matchedPct: total ? matched / total : 0,
    },
  };
}
