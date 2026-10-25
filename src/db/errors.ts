/**
 * Postgres's unique violation (23505), wherever it sits: drizzle 0.45 wraps
 * the driver's error and keeps the original as `cause`. Returns the name of
 * the index that refused the row, or null for any other error.
 */
export function uniqueViolation(error: unknown): string | null {
  for (let current = error as { code?: unknown; constraint_name?: unknown; cause?: unknown } | undefined; current; ) {
    if (current.code === "23505") return String(current.constraint_name ?? "");
    current = current.cause as typeof current;
  }
  return null;
}
