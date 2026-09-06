import { createHash } from "node:crypto";

import { byCodeUnit, stableSerialize } from "./stableSerialize.js";

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
