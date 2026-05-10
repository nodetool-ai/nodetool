/**
 * Browser-side dependency-hash helper for sketch layer bindings.
 *
 * The shared `@nodetool-ai/image-editor/dependencyHash` module relies on
 * `node:crypto` and cannot be imported in the web bundle. The web client
 * recomputes the hash whenever param overrides or input asset references
 * change so that "stale" detection (`dependencyHash !== lastGeneratedHash`)
 * lights up immediately, without waiting for a server round-trip.
 *
 * The hash itself is opaque — only equality matters — so we use a synchronous
 * 64-bit FNV-1a over the same canonical serialization the server uses. The
 * `v1c:` version marker is folded into the hashed payload (so changing the
 * algorithm later invalidates older hashes) but is NOT prepended to the
 * returned digest. The function returns 16 lower-case hex characters.
 * `lastGeneratedHash` is captured from the same client-side computation when
 * generation completes, so comparisons stay consistent regardless of the
 * server's initial seed.
 */
export interface LayerDependencyHashInput {
  workflowId: string;
  workflowUpdatedAt: string;
  paramOverrides: Record<string, unknown>;
  inputAssetHashes: string[];
}

const HASH_VERSION_PREFIX = "v1c:";

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

const FNV_OFFSET_HIGH = 0xcbf29ce4;
const FNV_OFFSET_LOW = 0x84222325;
const FNV_PRIME_HIGH = 0x00000100;
const FNV_PRIME_LOW = 0x000001b3;

function fnv1a64Hex(payload: string): string {
  // Two 32-bit halves multiplied as ((high << 32) | low) * (highP << 32 | lowP)
  // mod 2^64. Bit operations are forced to unsigned via `>>> 0`.
  let high = FNV_OFFSET_HIGH;
  let low = FNV_OFFSET_LOW;

  for (let i = 0; i < payload.length; i++) {
    low ^= payload.charCodeAt(i);
    low >>>= 0;

    const lowMul = low * FNV_PRIME_LOW;
    const lowMulLow = lowMul >>> 0;
    const lowMulCarry = Math.floor(lowMul / 0x100000000);

    const highMul =
      Math.imul(high, FNV_PRIME_LOW) + Math.imul(low, FNV_PRIME_HIGH);

    low = lowMulLow;
    high = (highMul + lowMulCarry) >>> 0;
  }

  return (
    high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0")
  );
}

export function computeLayerDependencyHash(
  input: LayerDependencyHashInput
): string {
  const normalized = {
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
  const payload = `${HASH_VERSION_PREFIX}${stableSerialize(normalized)}`;
  return fnv1a64Hex(payload);
}
