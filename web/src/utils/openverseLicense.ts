/**
 * The license record an Openverse import stores under `metadata.openverse`,
 * and how the UI names a license.
 */

export interface OpenverseCredit {
  license: string;
  license_version?: string;
  license_url?: string;
  creator?: string;
  attribution?: string;
  landing_url?: string;
  source?: string;
}

/** "CC BY 2.0", "CC0 1.0", "Public domain". */
export function openverseLicenseLabel(credit: {
  license: string;
  license_version?: string;
}): string {
  if (credit.license === "pdm") {
    return "Public domain";
  }
  const name =
    credit.license === "cc0" ? "CC0" : `CC ${credit.license.toUpperCase()}`;
  return credit.license_version ? `${name} ${credit.license_version}` : name;
}

/** The Openverse credit on an asset, or null for an asset that has none. */
export function readOpenverseCredit(
  metadata: Record<string, unknown> | null | undefined
): OpenverseCredit | null {
  const value = metadata?.openverse;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.license !== "string") {
    return null;
  }
  const text = (key: string): string | undefined => {
    const field = record[key];
    return typeof field === "string" && field !== "" ? field : undefined;
  };
  return {
    license: record.license,
    license_version: text("license_version"),
    license_url: text("license_url"),
    creator: text("creator"),
    attribution: text("attribution"),
    landing_url: text("landing_url"),
    source: text("source")
  };
}
