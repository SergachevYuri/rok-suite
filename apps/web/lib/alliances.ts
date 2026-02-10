// Alliance tag → display abbreviation
const ALLIANCE_DISPLAY_NAMES: Record<string, string> = {
    'ANG': 'ANG',
    '23KK': 'MNG',
    'KNG': 'KNG',
    'K23S': 'SNG',
    '23A': 'ING',
    'EQ': 'ENG',
};

export function allianceDisplay(tag: string | null): string {
    return tag ? (ALLIANCE_DISPLAY_NAMES[tag] || tag) : '-';
}
