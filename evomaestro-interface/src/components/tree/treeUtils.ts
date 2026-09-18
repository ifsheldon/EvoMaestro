import type { Program } from "@/types";

// ---------------------------------------------------------------------------
// Shared tree helpers
// ---------------------------------------------------------------------------

/** Check if a program was created via human expert interaction. */
export function isHumanOrigin(p: Program): boolean {
  const source = p.metadata?.source;
  return source === "human_suggest" || source === "human_merge";
}

export function normalizeId(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  if (value === "None") return null;
  if (value === -1) return null;
  return String(value);
}
