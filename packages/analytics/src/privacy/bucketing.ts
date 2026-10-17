import type {
  CountBucket,
  DurationBucket,
  ErrorCategory,
  NodeCountBucket
} from "../schema/properties.js";

export function bucketNodeCount(count: number): NodeCountBucket {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  if (count <= 100) return "21-100";
  return "101+";
}

export function bucketDuration(ms: number): DurationBucket {
  if (!Number.isFinite(ms) || ms < 1_000) return "<1s";
  if (ms < 10_000) return "1-10s";
  if (ms < 30_000) return "10-30s";
  if (ms < 120_000) return "30s-2m";
  if (ms < 600_000) return "2-10m";
  return "10m+";
}

export function bucketCount(count: number): CountBucket {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 20) return "6-20";
  return "21+";
}

const ERROR_PATTERNS: readonly [RegExp, ErrorCategory][] = [
  [/cancel|abort/i, "cancelled"],
  [/time(d)? ?out|deadline/i, "timeout"],
  [/api[ _-]?key|secret|credential|unauthori[sz]ed|\b401\b/i, "missing_secret"],
  [/model.*(not found|missing|download)|no model/i, "missing_model"],
  [/rate limit|quota|provider|\b(403|429|5\d\d)\b/i, "provider"],
  [/invalid|validation|required|schema/i, "validation"]
];

/**
 * Map an error to a fixed category on the client. The message is only matched
 * here and never leaves the process.
 */
export function categorizeError(error: unknown): ErrorCategory {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!message) return "unknown";
  for (const [pattern, category] of ERROR_PATTERNS) {
    if (pattern.test(message)) return category;
  }
  return "runtime";
}
