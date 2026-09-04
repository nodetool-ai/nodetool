import { createHash } from "node:crypto";

const HASH_INPUT_VERSION_PREFIX = "v1:";

/**
 * A value the digest can canonicalize: decoded JSON, plus `undefined`, which a
 * param override may hold and which the digest keeps distinct from `null` and
 * from an absent key.
 */
export type HashableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | HashableValue[]
  | { [key: string]: HashableValue };

/** Workflow param overrides as the digest reads them. */
export type ParamOverrides = Record<string, HashableValue>;

export interface DependencyHashInput {
  workflowId: string;
  /** Timestamp from the bound workflow `updated_at` field. */
  workflowUpdatedAt: string;
  paramOverrides: ParamOverrides;
  inputAssetHashes: string[];
  /**
   * Output node the binding reads from. Folded into the hash so re-pointing a
   * binding at a different terminal output counts as a dependency change.
   * Optional for callers that don't track an output selection.
   */
  selectedOutputNodeId?: string;
}

/**
 * Order strings by UTF-16 code unit. `localeCompare` is locale/ICU-dependent,
 * which would make the digest differ across hosts for the same input — fatal
 * for a content hash. Code-unit ordering is deterministic everywhere.
 */
function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isHashableRecord(value: HashableValue): value is ParamOverrides {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableSerialize(value: HashableValue): string {
  if (value === undefined) {
    return "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (isHashableRecord(value)) {
    const entries = Object.entries(value).sort(([leftKey], [rightKey]) =>
      byCodeUnit(leftKey, rightKey)
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }

  // JSON.stringify collapses NaN / ±Infinity to "null"; keep them distinct.
  if (Number.isNaN(value)) {
    return "NaN";
  }
  if (value === Number.POSITIVE_INFINITY) {
    return "Infinity";
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return "-Infinity";
  }

  return JSON.stringify(value);
}

export function computeDependencyHash(input: DependencyHashInput): string {
  // Object keys are sorted canonically by `stableSerialize`, so paramOverrides
  // needs no pre-sort. Array order *is* significant, so asset hashes are sorted.
  const base = {
    workflowId: input.workflowId,
    workflowUpdatedAt: input.workflowUpdatedAt,
    paramOverrides: input.paramOverrides,
    inputAssetHashes: [...input.inputAssetHashes].sort(byCodeUnit)
  };
  // Absent, not undefined: a caller that tracks no output selection must hash
  // the same as one that never had the field.
  const normalizedInput =
    input.selectedOutputNodeId === undefined
      ? base
      : { ...base, selectedOutputNodeId: input.selectedOutputNodeId };

  const payload = `${HASH_INPUT_VERSION_PREFIX}${stableSerialize(normalizedInput)}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
