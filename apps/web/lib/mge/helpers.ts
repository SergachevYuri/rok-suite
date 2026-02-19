/** MGE helper utilities */

export function formatSkillLevels(skills: number[]): string {
  return skills.join('-');
}

export function skillLevelTotal(skills: number[]): number {
  return skills.reduce((sum, s) => sum + s, 0);
}

/**
 * Compute a weighted investment score for sorting applicants.
 * Max possible: 60 + 20*5 + 6*3 = 178
 */
export function commanderInvestmentScore(
  level: number,
  skills: number[],
  stars: number
): number {
  return level + skillLevelTotal(skills) * 5 + stars * 3;
}

/** Generate default tier configuration for N ranked positions */
export function generateDefaultTiers(
  count: number
): { label: string; pointCap: number; isFfa: boolean }[] {
  const ordinals = [
    '1st', '2nd', '3rd', '4th', '5th',
    '6th', '7th', '8th', '9th', '10th',
    '11th', '12th', '13th', '14th', '15th',
  ];

  const tiers: { label: string; pointCap: number; isFfa: boolean }[] = [];
  const startCap = 10_000_000;
  const decrement = count > 1 ? Math.min(2_000_000, Math.floor(startCap / count)) : 0;

  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const cap = Math.max(1_000_000, startCap - i * decrement);
    tiers.push({
      label: `${ordinals[i] || `${i + 1}th`} Place`,
      pointCap: cap,
      isFfa: isLast && count > 1,
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
    case 'reviewing': return { bg: 'bg-amber-500/15', text: 'text-amber-400' };
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
    case 'pending': return { bg: 'bg-amber-500/15', text: 'text-amber-400' };
    case 'approved': return { bg: 'bg-emerald-500/15', text: 'text-emerald-400' };
    case 'waitlisted': return { bg: 'bg-blue-500/15', text: 'text-blue-400' };
    case 'declined': return { bg: 'bg-red-500/15', text: 'text-red-400' };
    case 'withdrawn': return { bg: 'bg-zinc-500/15', text: 'text-zinc-500' };
    default: return { bg: 'bg-zinc-500/15', text: 'text-zinc-400' };
  }
}
