export interface RosterMember {
    id: string;
    name: string;
    power: number;
    kills: number;
    t4_kills: number;
    t5_kills: number;
    deads: number;
    honor_points: number;
    tier: string | null;
    role: string | null;
    notes: string | null;
    tags: string[] | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    // ROKstats fields
    governor_id: number | null;
    kingdom: string | null;
    camp: string | null;
    alliance: string | null;
    highest_power: number;
    t1_kills: number;
    t2_kills: number;
    t3_kills: number;
    victories: number;
    defeats: number;
    scout_times: number;
    troops_healed: number;
    gathered: number;
    assistance: number;
    helps: number;
    acclaim: number;
    kvk_points: number;
    trades: number;
    castle_hall: number | null;
    civilization: string | null;
    alternate_names: string[] | null;
}

// Sortable field types for multi-column sorting
export type SortableField = 'name' | 'power' | 'kills' | 'role' | 'alliance' | 't4t5' | 'honor' | 'aoo' | 'acclaim' | 'kvkPts' | 'highestPower' | 'ratio' | 'deads';

export interface SortRule {
    field: SortableField;
    direction: 'asc' | 'desc';
}

// Default sort: rank (role) → power desc → name asc
export const DEFAULT_SORT_RULES: SortRule[] = [
    { field: 'role', direction: 'asc' },
    { field: 'power', direction: 'desc' },
    { field: 'name', direction: 'asc' },
];

// Field labels for sort chain display
export const SORT_FIELD_LABELS: Record<SortableField, string> = {
    name: 'Name',
    power: 'Power',
    kills: 'KP',
    role: 'Rank',
    alliance: 'Alliance',
    t4t5: 'T4/T5',
    honor: 'Honor',
    aoo: 'AoO',
    acclaim: 'Acclaim',
    kvkPts: 'KvK Pts',
    highestPower: 'Peak Power',
    ratio: 'Ratio',
    deads: 'Deaths',
};

// Column descriptions for tooltips
export const COLUMN_TOOLTIPS: Record<string, string> = {
    name: 'In-game governor name',
    power: 'Total account power',
    kp: 'Kill points (total kills)',
    ratio: 'Power per kill point - lower ratio indicates more aggressive play style',
    t4t5: 'T4 and T5 troop kill points',
    t1t2t3: 'T1, T2 and T3 troop kill points',
    honor: 'Honor points earned in Ark of Osiris',
    aoo: 'Ark of Osiris: Last team assignment and participation rate',
    mob: 'Mobilization: Individual points and resources turned in/accepted',
    rank: 'Alliance rank (R1-R5)',
    alliance: 'Player\'s home alliance',
    deads: 'Total troop deaths',
    healed: 'Troops healed',
    acclaim: 'Acclaim points from KvK',
    kvkPts: 'KvK contribution points',
    highestPower: 'Highest recorded power',
    ch: 'Castle Hall level',
    civilization: 'In-game civilization',
    trophies: 'King\'s Recognition trophies received',
};

// Column configuration for View Options
export type ColumnId = 'power' | 'kp' | 'ratio' | 't4t5' | 't1t2t3' | 'deads' | 'healed' | 'honor' | 'aoo' | 'mob' | 'rank' | 'alliance' | 'trophies' | 'acclaim' | 'kvkPts' | 'highestPower' | 'ch' | 'civilization';

export interface ColumnConfig {
    id: ColumnId;
    label: string;
    tooltip: string;
    defaultVisible: boolean;
    category: 'core' | 'combat' | 'support' | 'events' | 'profile';
}

export const COLUMN_CONFIG: ColumnConfig[] = [
    // Core columns
    { id: 'power', label: 'Power', tooltip: COLUMN_TOOLTIPS.power, defaultVisible: true, category: 'core' },
    { id: 'kp', label: 'Kill Points', tooltip: COLUMN_TOOLTIPS.kp, defaultVisible: true, category: 'core' },
    { id: 'ratio', label: 'Power:KP', tooltip: COLUMN_TOOLTIPS.ratio, defaultVisible: true, category: 'core' },
    { id: 'rank', label: 'Rank', tooltip: COLUMN_TOOLTIPS.rank, defaultVisible: false, category: 'core' },
    { id: 'alliance', label: 'Alliance', tooltip: COLUMN_TOOLTIPS.alliance, defaultVisible: true, category: 'core' },
    { id: 'trophies', label: 'Trophies', tooltip: COLUMN_TOOLTIPS.trophies, defaultVisible: true, category: 'core' },
    // Combat columns
    { id: 't4t5', label: 'T4/T5 KP', tooltip: COLUMN_TOOLTIPS.t4t5, defaultVisible: true, category: 'combat' },
    { id: 't1t2t3', label: 'T1/T2/T3 KP', tooltip: COLUMN_TOOLTIPS.t1t2t3, defaultVisible: false, category: 'combat' },
    { id: 'deads', label: 'Deaths', tooltip: COLUMN_TOOLTIPS.deads, defaultVisible: false, category: 'combat' },
    { id: 'healed', label: 'Healed', tooltip: COLUMN_TOOLTIPS.healed, defaultVisible: false, category: 'combat' },
    // Events columns
    { id: 'honor', label: 'Honor', tooltip: COLUMN_TOOLTIPS.honor, defaultVisible: false, category: 'events' },
    { id: 'aoo', label: 'AoO', tooltip: COLUMN_TOOLTIPS.aoo, defaultVisible: false, category: 'events' },
    { id: 'mob', label: 'Mob', tooltip: COLUMN_TOOLTIPS.mob, defaultVisible: false, category: 'events' },
    { id: 'acclaim', label: 'Acclaim', tooltip: COLUMN_TOOLTIPS.acclaim, defaultVisible: false, category: 'events' },
    { id: 'kvkPts', label: 'KvK Pts', tooltip: COLUMN_TOOLTIPS.kvkPts, defaultVisible: false, category: 'events' },
    // Profile columns
    { id: 'highestPower', label: 'Peak Power', tooltip: COLUMN_TOOLTIPS.highestPower, defaultVisible: false, category: 'profile' },
    { id: 'ch', label: 'CH', tooltip: COLUMN_TOOLTIPS.ch, defaultVisible: false, category: 'profile' },
    { id: 'civilization', label: 'Civ', tooltip: COLUMN_TOOLTIPS.civilization, defaultVisible: false, category: 'profile' },
];

export const DEFAULT_VISIBLE_COLUMNS = COLUMN_CONFIG.filter(c => c.defaultVisible).map(c => c.id);

// Activity score types
export interface ActivityBreakdown {
    aooRate: number;
    mobPercentile: number;
    kpPercentile: number;
    powerPercentile: number;
    honorPercentile: number;
}

export interface MemberActivityScore {
    score: number;
    breakdown: ActivityBreakdown;
}

export interface ActivityWeights {
    kp: number;
    power: number;
    honor: number;
    aoo: number;
    mob: number;
}
