import type { Asset, ProviderCost } from "../stores/ApiTypes";

/**
 * Convert a saved asset into the value shape the preview components expect
 * (mirrors the `{ type, uri }` records carried over `output_update`).
 */
export const assetToOutputValue = (asset: Asset): Record<string, unknown> => {
  const ct = asset.content_type ?? "";
  const uri = asset.get_url ?? asset.thumb_url ?? "";
  if (ct.startsWith("image/")) return { type: "image", uri };
  if (ct.startsWith("video/")) return { type: "video", uri };
  if (ct.startsWith("audio/")) return { type: "audio", uri };
  if (ct.includes("model") || asset.name?.toLowerCase().endsWith(".glb")) {
    return { type: "model_3d", uri, name: asset.name ?? undefined };
  }
  return { uri, type: "asset", name: asset.name ?? undefined };
};

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

export const assetToGeneration = (asset: Asset): Generation => ({
  id: asset.id,
  jobId: asset.job_id ?? null,
  createdAt: asset.created_at ? Date.parse(asset.created_at) : 0,
  outputs: { output: assetToOutputValue(asset) },
  status: "completed",
  assetId: asset.id
});

/**
 * One time-ordered list: all persisted generations followed by live
 * generations whose job has not yet persisted any asset (a live gen is
 * superseded once its assets land). Each backing is sorted oldest→newest by
 * createdAt; persisted (durable) generations always precede surviving live
 * ones so an in-flight run shows after the settled history.
 */
export const mergeGenerations = (
  persisted: Generation[],
  live: Generation[]
): Generation[] => {
  const persistedJobs = new Set(
    persisted.map((g) => g.jobId).filter(Boolean)
  );
  const survivingLive = live.filter(
    (g) => !(g.jobId && persistedJobs.has(g.jobId))
  );
  const byCreatedAt = (a: Generation, b: Generation) =>
    a.createdAt - b.createdAt;
  return [
    ...[...persisted].sort(byCreatedAt),
    ...[...survivingLive].sort(byCreatedAt)
  ];
};

/**
 * Resolve the current generation: the explicitly selected one when its id is
 * still present, otherwise the latest (last) generation. Returns undefined for
 * an empty list.
 */
export const getCurrentGeneration = (
  generations: Generation[],
  selectedId?: string
): Generation | undefined => {
  if (generations.length === 0) return undefined;
  if (selectedId) {
    const found = generations.find((g) => g.id === selectedId);
    if (found) return found;
  }
  return generations[generations.length - 1];
};

/** Resolve the current generation's value for an edge's source handle. */
export const getCurrentOutput = (
  generations: Generation[],
  selectedId: string | undefined,
  handle?: string
): unknown => {
  const current = getCurrentGeneration(generations, selectedId);
  return current ? outputOf(current, handle) : undefined;
};
