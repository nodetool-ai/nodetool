/**
 * The three consent categories. They are stored and changed independently:
 * granting one never grants another. This package transmits only
 * `productAnalytics`. Diagnostics and crash reports have no sender yet, so
 * their state is kept only so that a later sender starts from the user's
 * separate answer rather than from product-analytics consent.
 */
export const CONSENT_CATEGORIES = [
  "productAnalytics",
  "diagnostics",
  "crashReports"
] as const;

export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/** `unset` means never asked or never answered. Only `granted` sends. */
export type ConsentDecision = "granted" | "denied" | "unset";

export interface ConsentState {
  productAnalytics: ConsentDecision;
  diagnostics: ConsentDecision;
  crashReports: ConsentDecision;
  /** When the one-time prompt was shown, so it is never shown again. */
  promptedAt: string | null;
  updatedAt: string | null;
}

export const DEFAULT_CONSENT: ConsentState = {
  productAnalytics: "unset",
  diagnostics: "unset",
  crashReports: "unset",
  promptedAt: null,
  updatedAt: null
};

const isDecision = (value: unknown): value is ConsentDecision =>
  value === "granted" || value === "denied" || value === "unset";

/**
 * Read stored consent defensively. Anything unreadable falls back to the
 * default, which sends nothing.
 */
export function parseConsentState(value: unknown): ConsentState {
  if (value === null || typeof value !== "object") return { ...DEFAULT_CONSENT };
  const record = value as Record<string, unknown>;
  return {
    productAnalytics: isDecision(record["productAnalytics"])
      ? record["productAnalytics"]
      : "unset",
    diagnostics: isDecision(record["diagnostics"]) ? record["diagnostics"] : "unset",
    crashReports: isDecision(record["crashReports"])
      ? record["crashReports"]
      : "unset",
    promptedAt:
      typeof record["promptedAt"] === "string" ? record["promptedAt"] : null,
    updatedAt: typeof record["updatedAt"] === "string" ? record["updatedAt"] : null
  };
}
