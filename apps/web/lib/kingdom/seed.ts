// Shared seed-band assignment for the 32 ranked KDs in a KvK matchmaking pool.
// Across the ranking, KDs are labelled in 4 contiguous bands of 8:
//   pos  1..8  → A
//   pos  9..16 → B
//   pos 17..24 → C
//   pos 25..32 → D

export type SeedLetter = 'A' | 'B' | 'C' | 'D';
export type SeedAssignment = SeedLetter | null;

export function seedAssignment(position: number): SeedAssignment {
  if (position < 1 || position > 32) return null;
  const idx = Math.floor((position - 1) / 8); // 0..3
  return (['A', 'B', 'C', 'D'] as const)[idx];
}

export const SEED_PALETTE: Record<SeedLetter, string> = {
  A: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  B: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  C: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  D: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};
