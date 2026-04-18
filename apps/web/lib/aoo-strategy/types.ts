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
  selectedGarrisonLeadsByTeam?: Record<number, Record<number, string>>;
  selectedArkCarriersByTeam?: Record<number, string>; // One ark carrier per team (mid lane)
  selectedTeleportFirstByTeam?: Record<number, string[]>; // Sets serialized as arrays
  coordinatorsByTeam?: Record<number, string[]>; // Sets serialized as arrays
  zoneSizesByTeam?: Record<number, Record<number, string>>;
}

export interface AooRegistration {
  name: string;
  govId: number;
  power: number;
  team1: boolean;
  team2: boolean;
  rallyLeader: boolean;
  garrisonLeader: boolean;
  mid: boolean;
}
