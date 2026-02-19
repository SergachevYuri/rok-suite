/** MGE helper utilities */

export function formatSkillLevels(skills: number[]): string {
  return skills.join('-');
}

export function skillLevelTotal(skills: number[]): number {
  return skills.reduce((sum, s) => sum + s, 0);
}

// ─── Gold Head Calculator ────────────────────────────────────────────

/**
 * Cost ladders for legendary commander skill upgrades.
 * Each array = cost for leveling that skill from 1→2, 2→3, 3→4, 4→5.
 */
const SKILL_HEAD_COSTS: readonly number[][] = [
  [10, 10, 15, 15],   // Skill 1: 50 total
  [30, 30, 40, 40],   // Skill 2: 140 total
  [45, 45, 50, 50],   // Skill 3: 190 total
  [75, 75, 80, 80],   // Skill 4: 310 total
];

/** Total gold heads from 1-0-0-0 to 5-5-5-5 */
export const MAX_GOLD_HEADS = 690;

function headsForSkill(currentLevel: number, skillIndex: number): number {
  const effective = Math.max(1, currentLevel);
  if (effective >= 5) return 0;
  const costs = SKILL_HEAD_COSTS[skillIndex];
  let total = 0;
  for (let i = effective - 1; i < 4; i++) {
    total += costs[i];
  }
  return total;
}

/**
 * Calculate total gold heads needed to expertise (5-5-5-5) from current skill levels.
 * @param skills Array of 4 current skill levels, each 0-5
 */
export function goldHeadsToExpertise(skills: number[]): number {
  if (!skills || skills.length !== 4) return 0;
  let total = 0;
  for (let i = 0; i < 4; i++) {
    total += headsForSkill(skills[i], i);
  }
  return total;
}

// ─── Investment Score ────────────────────────────────────────────────

export interface InvestmentBreakdown {
  levelScore: number;
  levelMax: number;
  skillScore: number;
  skillMax: number;
  starsScore: number;
  starsMax: number;
  equipmentScore: number;
  equipmentMax: number;
  total: number;
  max: number;
  goldHeadsNeeded: number;
}

/**
 * Compute a weighted investment score for sorting applicants.
 * Max possible: 60 + 20*5 + 6*3 + 10 = 188
 */
export function commanderInvestmentScore(
  level: number,
  skills: number[],
  stars: number,
  equipmentRating?: number | null
): number {
  return level + skillLevelTotal(skills) * 5 + stars * 3 + (equipmentRating ?? 0);
}

/** Full breakdown of the investment score components */
export function commanderInvestmentBreakdown(
  level: number,
  skills: number[],
  stars: number,
  equipmentRating: number | null
): InvestmentBreakdown {
  const levelScore = level;
  const skillScore = skillLevelTotal(skills) * 5;
  const starsScore = stars * 3;
  const equipmentScore = equipmentRating ?? 0;
  return {
    levelScore, levelMax: 60,
    skillScore, skillMax: 100,
    starsScore, starsMax: 18,
    equipmentScore, equipmentMax: 10,
    total: levelScore + skillScore + starsScore + equipmentScore,
    max: 188,
    goldHeadsNeeded: goldHeadsToExpertise(skills),
  };
}

// ─── Tier Helpers ────────────────────────────────────────────────────

/** Default gold head rewards per rank position */
const DEFAULT_REWARD_HEADS: Record<number, number> = {
  1: 180, 2: 90, 3: 60, 4: 50, 5: 40,
  6: 30, 7: 20, 8: 20, 9: 20, 10: 20,
  11: 10, 12: 10, 13: 10, 14: 10, 15: 10,
  16: 5, 17: 5, 18: 5, 19: 5, 20: 5,
  21: 5, 22: 5, 23: 5, 24: 5, 25: 5,
};

/** Generate default tier configuration for N ranked positions */
export function generateDefaultTiers(
  count: number
): { label: string; pointCap: number; isFfa: boolean; rewardHeads: number | null }[] {
  const ordinals = [
    '1st', '2nd', '3rd', '4th', '5th',
    '6th', '7th', '8th', '9th', '10th',
    '11th', '12th', '13th', '14th', '15th',
  ];

  const tiers: { label: string; pointCap: number; isFfa: boolean; rewardHeads: number | null }[] = [];
  const startCap = 10_000_000;
  const decrement = count > 1 ? Math.min(2_000_000, Math.floor(startCap / count)) : 0;

  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const cap = Math.max(1_000_000, startCap - i * decrement);
    tiers.push({
      label: `${ordinals[i] || `${i + 1}th`} Place`,
      pointCap: cap,
      isFfa: isLast && count > 1,
      rewardHeads: DEFAULT_REWARD_HEADS[i + 1] ?? 5,
    });
  }

  return tiers;
}

export function isDeadlinePassed(deadline: string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

export function formatDeadline(deadline: string | null): string {
  if (!deadline) return '';
  const d = new Date(deadline);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Convert tier label to sort number: '1st Place' → 1 */
export function tierSortValue(label: string): number {
  const match = label.match(/^(\d+)/);
  return match ? parseInt(match[1]) : 999;
}

/** Status badge colors */
export function statusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'draft': return { bg: 'bg-zinc-500/15', text: 'text-zinc-400' };
    case 'open': return { bg: 'bg-emerald-500/15', text: 'text-emerald-400' };
    case 'reviewing': return { bg: 'bg-purple-500/15', text: 'text-purple-400' };
    case 'finalized': return { bg: 'bg-blue-500/15', text: 'text-blue-400' };
    case 'completed': return { bg: 'bg-zinc-500/15', text: 'text-zinc-500' };
    default: return { bg: 'bg-zinc-500/15', text: 'text-zinc-400' };
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'reviewing': return 'Reviewing';
    case 'finalized': return 'Finalized';
    case 'completed': return 'Completed';
    default: return status;
  }
}

export function applicationStatusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'pending': return { bg: 'bg-blue-500/15', text: 'text-blue-400' };
    case 'approved': return { bg: 'bg-emerald-500/15', text: 'text-emerald-400' };
    case 'waitlisted': return { bg: 'bg-blue-500/15', text: 'text-blue-400' };
    case 'declined': return { bg: 'bg-red-500/15', text: 'text-red-400' };
    case 'withdrawn': return { bg: 'bg-zinc-500/15', text: 'text-zinc-500' };
    default: return { bg: 'bg-zinc-500/15', text: 'text-zinc-400' };
  }
}
