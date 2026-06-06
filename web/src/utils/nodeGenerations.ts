import type { ProviderCost } from "../stores/ApiTypes";

export interface Generation {
  id: string;
  jobId: string | null;
  createdAt: number;
  outputs: Record<string, unknown>;
  status: "running" | "completed" | "error";
  cost?: ProviderCost;
  error?: string;
  assetId?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Resolve a generation's value for an edge's source handle. Prefers the named
 * handle; for a single-output generation whose stored key differs from the
 * edge handle, falls through to that sole value; otherwise returns the record.
 */
export const outputOf = (gen: Generation, handle?: string): unknown => {
  const o = gen.outputs;
  if (!isRecord(o)) return o;
  if (handle && handle in o) return o[handle];
  const keys = Object.keys(o);
  if (keys.length === 1) return o[keys[0]];
  if (keys.length === 0) return undefined;
  return o;
};
