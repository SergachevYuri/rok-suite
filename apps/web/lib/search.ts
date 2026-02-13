import { normalizeName } from '@/lib/kingdom/config';

/**
 * Shared search utility — matches by name (case-insensitive substring),
 * governor ID (numeric substring), and normalized name (strips tags,
 * diacritics, special characters for fuzzy matching).
 */
export function matchesSearch(
  query: string,
  name: string,
  governorId?: number | null,
): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  // Exact substring match on name
  if (name.toLowerCase().includes(q)) return true;
  // Governor ID match
  if (governorId && governorId.toString().includes(q)) return true;
  // Normalized/fuzzy match (strips tags, diacritics, special chars)
  const normQ = normalizeName(q);
  const normN = normalizeName(name);
  if (normQ.length >= 2 && normN.includes(normQ)) return true;
  return false;
}
