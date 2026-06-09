import { createHash } from "node:crypto";

const HASH_INPUT_VERSION_PREFIX = "v1:";

export interface DependencyHashInput {
  workflowId: string;
  workflowUpdatedAt: string;
  paramOverrides: Record<string, unknown>;
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

function stableSerialize(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([leftKey], [rightKey]) => byCodeUnit(leftKey, rightKey)
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    // JSON.stringify collapses NaN / ±Infinity to "null"; keep them distinct.
    return Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity";
  }

  return JSON.stringify(value);
}

export function computeDependencyHash(input: DependencyHashInput): string {
  // Object keys are sorted canonically by `stableSerialize`, so paramOverrides
  // needs no pre-sort. Array order *is* significant, so asset hashes are sorted.
  const normalizedInput: Record<string, unknown> = {
    workflowId: input.workflowId,
    workflowUpdatedAt: input.workflowUpdatedAt,
    paramOverrides: input.paramOverrides,
    inputAssetHashes: [...input.inputAssetHashes].sort(byCodeUnit)
  };

  if (input.selectedOutputNodeId !== undefined) {
    normalizedInput.selectedOutputNodeId = input.selectedOutputNodeId;
  }

  const payload = `${HASH_INPUT_VERSION_PREFIX}${stableSerialize(normalizedInput)}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
