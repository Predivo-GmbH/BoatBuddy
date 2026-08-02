/**
 * Fetch EVERY row from a PostgREST list query, past Supabase's default 1000-row cap.
 *
 * A plain `.select('*')` silently returns at most 1000 rows (the `db-max-rows` default),
 * so any reduce/count over the result under-reports once a table exceeds 1000 rows — a
 * silent data-loss / wrong-total bug (caught by the v11 Gate I data-volume test).
 *
 * Pass a builder that applies `.range(from, to)` to a fresh filtered/ordered query; this
 * pages until a short (<1000) chunk signals the end.
 */
const PAGE = 1000

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = data ?? []
    all.push(...chunk)
    if (chunk.length < PAGE) break
  }
  return all
}
