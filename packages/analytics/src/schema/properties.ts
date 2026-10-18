/**
 * Every value an analytics property may take. Properties are enums or
 * buckets, never free text or exact numbers, so they cannot carry user content
 * and stay low-cardinality. Adding a value here is a privacy review: check it
 * for content, cardinality and fingerprinting risk first.
 */

export const NODE_COUNT_BUCKETS = ["0", "1-5", "6-20", "21-100", "101+"] as const;
export type NodeCountBucket = (typeof NODE_COUNT_BUCKETS)[number];

export const DURATION_BUCKETS = [
  "<1s",
  "1-10s",
  "10-30s",
  "30s-2m",
  "2-10m",
  "10m+"
] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

export const COUNT_BUCKETS = ["0", "1", "2-5", "6-20", "21+"] as const;
export type CountBucket = (typeof COUNT_BUCKETS)[number];

export const EXECUTION_MODES = ["local", "cloud"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const ERROR_CATEGORIES = [
  "provider",
  "validation",
  "cancelled",
  "timeout",
  "missing_model",
  "missing_secret",
  "runtime",
  "unknown"
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** The product area a backend execution belongs to. */
export const FEATURES = [
  "workflow",
  "agent",
  "chat",
  "storyboard",
  "timeline",
  "game",
  "app"
] as const;
export type Feature = (typeof FEATURES)[number];

/**
 * The top-level CLI command, as a category. Subcommands, arguments and flags
 * are never reported. A command missing from this list reports `other`.
 */
export const COMMAND_CATEGORIES = [
  "run",
  "workflows",
  "chat",
  "agent",
  "serve",
  "mcp",
  "debug",
  "validate",
  "node",
  "models",
  "packs",
  "deploy",
  "worker",
  "timeline",
  "sketch",
  "game",
  "app",
  "projects",
  "settings",
  "secrets",
  "telemetry",
  "info",
  "other"
] as const;
export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];
