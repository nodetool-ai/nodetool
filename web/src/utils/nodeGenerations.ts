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
  if (ct.startsWith("text/")) {
    // Capped text inline in metadata for fetch-free preview; full text in asset bytes.
    const text = asset.metadata?.text;
    return {
      type: "text",
      text: typeof text === "string" ? text : "",
      uri
    };
  }
  if (ct.includes("json")) {
    // Full output value inline in metadata.json for fetch-free reload.
    const json = asset.metadata?.json;
    if (json !== undefined) {
      return { type: "json", value: json, uri };
    }
    return { type: "json", uri };
  }
  if (ct.includes("model") || asset.name?.toLowerCase().endsWith(".glb")) {
    return { type: "model_3d", uri, name: asset.name ?? undefined };
  }
  return { uri, type: "asset", name: asset.name ?? undefined };
};

/**
 * The full output dict a structured (JSON) generation persisted, or undefined.
 * Generator nodes (List/Data/Chart/SVG/StructuredOutput) save their whole
 * `process()` output dict as an `application/json` asset with the value inline
 * in `metadata.json` — returning it as the generation's `outputs` makes a
 * reloaded generation mirror a live run, so per-handle reads (`outputOf`) and
 * the content card resolve identically.
 */
const jsonGenerationOutputs = (
  asset: Asset
): Record<string, unknown> | undefined => {
  const ct = asset.content_type ?? "";
  if (!ct.includes("json")) return undefined;
  const json = asset.metadata?.json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  return undefined;
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
  /**
   * Per-(jobId) variant position, recovered at read time (no DB column); never
   * a stored field on persisted gens. Persisted gens: derived from (createdAt,
   * id) order within the job — `mergeGenerations` computes that order for its
   * survival check but does not write `index` back onto the objects. Live gens:
   * parsed from the `${jobId}#k` id scheme (`liveIndexOf`). Used only for
   * live↔persisted reconciliation; never persisted to ResultsStore.
   */
  index?: number;
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
  // A structured (JSON) generation reloads its whole output dict so per-handle
  // reads mirror a live run; media/text assets stay a single `output` value.
  outputs: jsonGenerationOutputs(asset) ?? { output: assetToOutputValue(asset) },
  status: "completed",
  assetId: asset.id
});

/**
 * Recover a live generation's per-job variant index from its id. ResultsStore
 * mints live ids as `index === 0 ? jobId : `${jobId}#${index}`` — so id === jobId
 * is slot 0, a `${jobId}#k` suffix is slot k, and any index-less placeholder
 * (a running/error settle merged onto the newest slot) is treated as slot 0.
 */
const liveIndexOf = (gen: Generation): number => {
  if (typeof gen.index === "number") return gen.index;
  if (gen.jobId == null) return 0;
  if (gen.id === gen.jobId) return 0;
  const prefix = `${gen.jobId}#`;
  if (gen.id.startsWith(prefix)) {
    const n = Number(gen.id.slice(prefix.length));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const KEY_SEP = "\u0000";
const slotKey = (jobId: string, index: number) => `${jobId}${KEY_SEP}${index}`;

/**
 * One time-ordered list reconciled by (jobId, index): all persisted generations
 * followed by the live generations that have NOT been superseded by a persisted
 * asset at the same (jobId, index). A live variant survives until a persisted
 * asset lands at its exact slot — so a multi-execution run shows all N live
 * variants mid-run, and the live→persisted handoff is seamless (the persisted
 * twin replaces the live one at the same slot, no flash, no premature collapse).
 * Persisted index is recovered here from (createdAt, id) order within each job
 * (no DB column); the id tie-break keeps same-ms assets stably ordered across
 * renders. Persisted (durable) gens precede surviving live ones; both oldest→newest.
 */
export const mergeGenerations = (
  persisted: Generation[],
  live: Generation[]
): Generation[] => {
  const byCreatedAtThenId = (a: Generation, b: Generation) =>
    a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  // Assign per-job persisted slots from (createdAt, id) order. Null-jobId
  // assets are __solo__ singletons — never indexed, never reconciled.
  const byJob = new Map<string, Generation[]>();
  for (const g of persisted) {
    if (g.jobId == null) continue;
    const arr = byJob.get(g.jobId);
    if (arr) arr.push(g);
    else byJob.set(g.jobId, [g]);
  }
  const persistedSlots = new Set<string>(); // `${jobId}\u0000${index}`
  for (const [jobId, group] of byJob) {
    [...group].sort(byCreatedAtThenId).forEach((_g, i) => {
      persistedSlots.add(slotKey(jobId, i));
    });
  }

  // A live variant survives unless a persisted asset occupies its exact slot.
  const survivingLive = live.filter((g) => {
    if (g.jobId == null) return true;
    return !persistedSlots.has(slotKey(g.jobId, liveIndexOf(g)));
  });

  return [
    ...[...persisted].sort(byCreatedAtThenId),
    ...[...survivingLive].sort(byCreatedAtThenId)
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

/**
 * A group of generations that belong to one workflow run. A regular generator
 * driven by a stream/list is executed once per item; every execution emits a
 * node_update sharing the run's job_id, so a multi-variant run persists N assets
 * (and produces N live variants) all keyed by the same jobId. Generations with a
 * null jobId (legacy/unjobbed assets) are never merged — each gets its own
 * singleton run so unrelated assets can't collapse together.
 */
export interface RunGroup {
  /** The run's job_id, or `__solo__:<generationId>` for a null-jobId singleton. */
  jobId: string;
  /** Earliest variant createdAt — the run's position on the timeline. */
  createdAt: number;
  /** Variants oldest→newest. */
  variants: Generation[];
  /** "running" if any variant is still running, "error" if any errored and none running, else "completed". */
  status: "running" | "completed" | "error";
  /** The latest variant — the run's cover/representative generation. */
  cover: Generation;
}

/**
 * Group a flat oldest→newest generation list into runs by jobId. Null-jobId
 * generations become singleton runs (key `__solo__:<id>`). Runs are returned
 * oldest→newest by createdAt (the run's earliest variant); variants within a
 * run preserve the input order (already oldest→newest from mergeGenerations).
 */
export const groupByRun = (generations: Generation[]): RunGroup[] => {
  const order: string[] = [];
  const byKey = new Map<string, Generation[]>();
  for (const gen of generations) {
    const key = gen.jobId ? gen.jobId : `__solo__:${gen.id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.push(gen);
    } else {
      byKey.set(key, [gen]);
      order.push(key);
    }
  }
  const runs: RunGroup[] = order.map((key) => {
    const variants = byKey.get(key)!;
    const createdAt = Math.min(...variants.map((v) => v.createdAt));
    const hasRunning = variants.some((v) => v.status === "running");
    const hasError = variants.some((v) => v.status === "error");
    const status: RunGroup["status"] = hasRunning
      ? "running"
      : hasError
        ? "error"
        : "completed";
    return {
      jobId: key,
      createdAt,
      variants,
      status,
      cover: variants[variants.length - 1]
    };
  });
  return runs.sort((a, b) => a.createdAt - b.createdAt);
};

/**
 * The run containing the selected generation (matched by variant id); otherwise
 * the latest run. Returns undefined for an empty list. Mirrors
 * getCurrentGeneration's "selected ?? latest" semantics at the run level so a
 * stale selected_generation falls back to the newest run's cover.
 */
export const getCurrentRun = (
  runs: RunGroup[],
  selectedId?: string
): RunGroup | undefined => {
  if (runs.length === 0) return undefined;
  if (selectedId) {
    const found = runs.find((r) => r.variants.some((v) => v.id === selectedId));
    if (found) return found;
  }
  return runs[runs.length - 1];
};

/**
 * Flatten a run to its display values: one value per variant via outputOf,
 * with a single array-valued variant (the live num_images=N shape, one
 * completed update whose outputs resolve to an array) spread so it counts as N
 * values. Mirrors resolvePreviewValue's flatten in ContentCardBody so the
 * streaming case (N variants, scalar each) and the single-array case render
 * identically as N tiles. `null`/`undefined` values are dropped.
 */
export const runVariantValues = (
  run: RunGroup,
  handle?: string
): unknown[] =>
  run.variants
    .flatMap((v) => {
      const value = outputOf(v, handle);
      return Array.isArray(value) ? value : [value];
    })
    .filter((value) => value !== undefined && value !== null);
