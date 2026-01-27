import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Fetch all rows from a Supabase query, automatically paginating past the 1000-row default limit.
 * Pass a function that builds the query and appends `.range(range.from, range.to)`.
 *
 * Usage:
 *   const rows = await fetchAllRows((range) =>
 *     supabase.from('table').select('*').eq('col', val).range(range.from, range.to)
 *   );
 */
export async function fetchAllRows<T>(
  queryFn: (range: { from: number; to: number }) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allRows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await queryFn({ from: offset, to: offset + PAGE_SIZE - 1 });
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}
