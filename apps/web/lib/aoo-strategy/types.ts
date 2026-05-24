export type EventMode = 'main' | 'training';
export type AooTeam = 'team1' | 'team2';

export interface PlayerAssignments {
  phase1: string;
  phase2: string;
  phase3: string;
  phase4: string;
}

export interface Player {
  id: number;
  name: string;
  team: number;
  tags: string[];
  power?: number;
  assignments?: PlayerAssignments;
}

export interface Team {
  name: string;
  description: string;
}

export interface MapAssignment {
  team: number;
  order: number;
}

export interface MapAssignments {
  [key: string]: MapAssignment;
}

export interface StrategyData {
  players: Player[];
  teams: Team[];
  substitutes: Player[];
  notes: string;
  mapImage: string | null;
  mapAssignments: MapAssignments;
  // Team Builder state (persisted for sharing)
  builderAlliance?: string;
  teamCount?: number;
  builderStep?: 'select' | 'distribute' | 'leads' | 'done';
  confirmationsByTeam?: Record<number, Record<string, string>>;
  suggestedZonesByTeam?: Record<number, Record<number, { name: string; power: number; kills: number }[]>>;
  selectedRallyLeadsByTeam?: Record<number, Record<number, string>>;
  /** Optional second rally lead per zone, used only for the league team
   *  (a 45-player league pool warrants two rally leads per lane). For
   *  normal weekend teams this stays empty. */
  selectedRallyLeadsSecondaryByTeam?: Record<number, Record<number, string>>;
  selectedGarrisonLeadsByTeam?: Record<number, Record<number, string>>;
  selectedArkCarriersByTeam?: Record<number, string>; // One ark carrier per team (mid lane)
  selectedTeleportFirstByTeam?: Record<number, string[]>; // Sets serialized as arrays
  coordinatorsByTeam?: Record<number, string[]>; // Sets serialized as arrays
  /** Names of players slotted as subs for that team this weekend. Subs are
   *  confirmed players in a different in-game role (not a synonym for "maybe")
   *  — they get locked to zone 0 (bench) during lane distribution and can be
   *  swapped into mains week-to-week. Mainly used for the league team. */
  subsByTeam?: Record<number, string[]>;
  /** Which team slot is the league team. League players come from a separate
   *  sheet tab and are mutually exclusive with normal Team 1 / Team 2 sign-ups.
   *  When unset the planner has no league team this weekend. */
  leagueTeamNumber?: number;
  zoneSizesByTeam?: Record<number, Record<number, string>>;
  // Per-team lane locks from spreadsheet: name -> 1|2|3 forces that player into that lane
  lockedLanesByTeam?: Record<number, Record<string, number>>;
  // Teams whose lineups are frozen — Distribute and per-player mutations are blocked
  // until the user explicitly unlocks. Persisted as an array of team numbers.
  lockedTeams?: number[];
  // RoK-mail alliance header preset to render at the top of generated mails.
  // 'ANG' | 'KNG' | '23KK' | 'EQ' | 'none' | 'custom'. Default 'ANG'.
  mailHeader?: string;
  // Custom mail header text — used when mailHeader === 'custom'. RoK markup OK.
  mailHeaderCustom?: string;
}

export interface AooRegistration {
  name: string;
  govId: number;
  power: number;
  /** Officer-confirmed for participation. team1/team2 are forced to false on
   *  parse when this is false, so unconfirmed sign-ups don't get distributed. */
  confirmed: boolean;
  team1: boolean;
  team2: boolean;
  rallyLeader: boolean;
  garrisonLeader: boolean;
  mid: boolean;
  sub: boolean;
  coordinator: boolean;
  // Lane lock: 1=Top, 2=Mid, 3=Bottom. null = not locked from sheet.
  lane: number | null;
  /** True when this row came from the league sign-up tab. League players
   *  are excluded from normal Team 1 / Team 2 rosters at merge time and form
   *  a separate fixed-roster team that runs alongside the weekend teams. */
  league: boolean;
  /** Which lane this rally leader runs on the OL sheet ('t' = top, 'b' =
   *  bottom). Only the league parser populates this; the normal weekend
   *  parser leaves it undefined. Used by the league sanity panel to verify
   *  exactly one rally lead per lane. */
  rallyLeaderLane?: 't' | 'b' | null;
  /** Which lane this garrison leader covers on the OL sheet. Same shape and
   *  rules as rallyLeaderLane. */
  garrisonLeaderLane?: 't' | 'b' | null;
}
