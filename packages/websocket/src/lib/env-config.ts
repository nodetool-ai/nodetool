/**
 * Small helpers for reading numeric / boolean configuration from environment
 * variables. Kept dependency-free so config modules can share them.
 */

/** Parse a positive integer env var, falling back when unset or invalid. */
export function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** Parse a boolean env var. Truthy values: "1", "true", "yes", "on". */
export function parseBoolEnv(name: string): boolean {
  const raw = process.env[name]?.toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
