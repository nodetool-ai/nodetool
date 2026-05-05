import { createHash } from "node:crypto";

const HASH_INPUT_VERSION_PREFIX = "v1:";

export interface DependencyHashInput {
  workflowId: string;
  workflowUpdatedAt: string;
  paramOverrides: Record<string, unknown>;
  inputAssetHashes: string[];
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function computeDependencyHash(input: DependencyHashInput): string {
  const normalizedInput = {
    workflowId: input.workflowId,
    workflowUpdatedAt: input.workflowUpdatedAt,
    paramOverrides: Object.fromEntries(
      Object.entries(input.paramOverrides).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    inputAssetHashes: [...input.inputAssetHashes].sort((left, right) =>
      left.localeCompare(right)
    )
  };

  const payload = `${HASH_INPUT_VERSION_PREFIX}${stableSerialize(normalizedInput)}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
