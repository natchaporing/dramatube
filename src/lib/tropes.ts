/**
 * The tropes a series can be shelved under. The same list, spelled the same
 * way, as DramaStudio's writers' room, so a series made there arrives here
 * already tagged. Stored by name; URLs use the slug.
 */
export const TROPES = [
  "Contract Marriage",
  "Hidden Identity",
  "Enemies to Lovers",
  "Second Chance",
  "Revenge Comeback",
  "Forbidden Love",
  "Forced Proximity",
  "Fake Relationship",
  "Heir Reveal",
  "Rags to Riches",
  "Secret Child",
  "Amnesia",
  "Mistaken Identity",
  "Love Triangle",
  "Found Family",
  "Redemption Arc",
  "Betrayal by a Friend",
  "Debt and Ruin",
  "Return of the Exile",
  "The Long Con",
] as const;

export type Trope = (typeof TROPES)[number];

/** A poster has room for a few; more stops meaning anything. */
export const MAX_TROPES = 5;

export function tropeSlug(trope: string): string {
  return trope.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function tropeFromSlug(slug: string | null | undefined): Trope | null {
  if (!slug) return null;
  return TROPES.find((trope) => tropeSlug(trope) === slug) ?? null;
}

/** Known tropes only, matched without regard to case, each once, in the order given. */
export function normalizeTropes(input: readonly unknown[]): Trope[] {
  const picked: Trope[] = [];
  for (const value of input) {
    const name = String(value).trim().toLowerCase();
    const trope = TROPES.find((candidate) => candidate.toLowerCase() === name);
    if (trope && !picked.includes(trope)) picked.push(trope);
  }
  return picked.slice(0, MAX_TROPES);
}
