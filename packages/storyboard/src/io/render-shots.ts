/**
 * Running a storyboard render plan: the IO half of `planShotRenders`.
 *
 * One render path for the agent capability and the `nodetool.storyboard.*`
 * nodes (design §3.1), so what a graph spends and what chat spends are the same
 * call, and both stamp the record `stale_only` later reads.
 *
 * The host seam is structural rather than a `ProcessingContext` import: this
 * package sits on protocol + timeline, below runtime and models. The caller
 * supplies the four operations below and keeps its own ownership checks,
 * generation origin and conflict handling.
 */

import { stampRenderInputs } from "@nodetool-ai/protocol";
import type { ClipVersion, ImageRef, KeyframeVersion, Shot } from "@nodetool-ai/protocol";
import type { StoryboardDocument } from "../document.js";
import type { ShotRenderPlan } from "../render-plan.js";

/** The provider call a plan turns into. */
export interface RenderGenerationRequest {
  /** Minted by the caller of `runGeneration`, so a background caller has it early. */
  id: string;
  provider: string;
  capability: "text_to_image" | "image_to_video" | "reference_to_video" | "text_to_video";
  model: string;
  params: Record<string, unknown>;
  /** Save the result as an asset: the board can only reference persisted media. */
  persist: { name: string; mime?: string };
}

export interface RenderGenerationResult {
  output: unknown;
  assets: Array<{ asset_id?: string | null; uri?: string | null }>;
}

/** The board as it stands, with the token a write has to present. */
export interface StoryboardSnapshot {
  document: StoryboardDocument;
  updatedAt: string;
}

export interface StoryboardRenderHost {
  /** Run one generation through the seam that records and persists it. */
  runGeneration(request: RenderGenerationRequest): Promise<RenderGenerationResult>;
  /** Read the board; null when it is gone or not owned. */
  getStoryboard(id: string): Promise<StoryboardSnapshot | null>;
  /**
   * Write the document if `baseUpdatedAt` is still current; null on a
   * concurrent write, which {@link renderShots} answers by re-reading. `shotId`
   * names the shot that moved, so an open editor merges the write into its
   * draft per shot instead of treating the board as replaced.
   */
  updateStoryboard(args: {
    id: string;
    document: StoryboardDocument;
    baseUpdatedAt: string;
    shotId: string;
  }): Promise<StoryboardSnapshot | null>;
  /** Read a stored still back as bytes — the seed a keyframe-mode clip animates. */
  loadMedia?(ref: KeyframeVersion | ImageRef): Promise<Uint8Array | null>;
  /**
   * The real length of a rendered clip. A video model quantizes the duration it
   * was asked for, and assembly lays down what the ref says.
   */
  videoDurationSeconds?(bytes: Uint8Array): number | null;
}

export interface RenderShotsOptions {
  /** Renders in flight at once. Defaults to 1. */
  concurrency?: number;
  /** Named resolution tier for clips, when the caller overrides one. */
  resolution?: string;
  /** Ids for the generation rows. Defaults to `crypto.randomUUID`. */
  newId?: () => string;
}

/** One shot's outcome, in plan order. */
export interface ShotRenderOutcome {
  shotId: string;
  index: number;
  slug?: string;
  kind: "keyframe" | "clip";
  mode: "keyframe" | "direct" | "reference";
  ok: boolean;
  assetId?: string;
  assetUri?: string;
  /** The ledger row for this render; `get_generation` reads its cost. */
  generationId?: string;
  status?: string;
  error?: string;
}

/** Attempts to land a document write: the first try plus one re-read-and-reapply (ADR 0001). */
const CAS_ATTEMPTS = 2;

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** Run `task` over `items`, at most `limit` in flight. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await task(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/**
 * Apply `patch` to one shot and persist the board.
 *
 * Renders run concurrently against a single row, so the write is a CAS on the
 * board's update token: on conflict the row is re-read and the patch re-applied
 * to the fresher document, never to the stale copy the render started from.
 */
async function patchShot(
  host: StoryboardRenderHost,
  storyboardId: string,
  shotId: string,
  patch: (shot: Shot) => Shot
): Promise<Shot | { error: string }> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const snapshot = await host.getStoryboard(storyboardId);
    if (!snapshot) {
      return { error: `Storyboard ${storyboardId} was not found.` };
    }
    const { document, updatedAt } = snapshot;
    const index = document.shots.findIndex((s) => s.id === shotId);
    if (index === -1) {
      return { error: `Shot ${shotId} is no longer on the board.` };
    }
    const updated = patch(document.shots[index]);
    const shots = [...document.shots];
    shots[index] = updated;
    const saved = await host.updateStoryboard({
      id: storyboardId,
      document: { ...document, shots },
      baseUpdatedAt: updatedAt,
      shotId
    });
    if (saved) return updated;
  }
  return {
    error: `Storyboard ${storyboardId} is being modified concurrently; the render finished but could not be saved. Retry the call.`
  };
}

const isError = (value: unknown): value is { error: string } =>
  !!value &&
  typeof value === "object" &&
  typeof (value as { error?: unknown }).error === "string";

/** The provider capability a plan calls. */
const capabilityFor = (plan: ShotRenderPlan): RenderGenerationRequest["capability"] =>
  plan.kind === "keyframe"
    ? "text_to_image"
    : plan.mode === "reference"
      ? "reference_to_video"
      : plan.mode === "direct"
        ? "text_to_video"
        : "image_to_video";

/**
 * Render every plan and write each result onto its shot.
 *
 * A plan already marked `fresh` is still rendered: skipping is the caller's
 * decision (`stale_only`, `only_stale`), taken before the plans reach here.
 */
export async function renderShots(
  host: StoryboardRenderHost,
  ref: { id: string },
  plans: readonly ShotRenderPlan[],
  options: RenderShotsOptions = {}
): Promise<ShotRenderOutcome[]> {
  const newId = options.newId ?? (() => crypto.randomUUID());
  return mapWithConcurrency(plans, options.concurrency ?? 1, async (plan) => {
    const base: ShotRenderOutcome = {
      shotId: plan.shotId,
      index: plan.index,
      kind: plan.kind,
      mode: plan.mode,
      ok: false
    };
    if (plan.slug !== undefined) base.slug = plan.slug;
    const capability = capabilityFor(plan);
    if (capability === "image_to_video" && !plan.sourceKeyframe) {
      return {
        ...base,
        error:
          'Shot has no still to animate. Run render_storyboard_stills first, or set its render_mode to "direct".'
      };
    }
    try {
      const params: Record<string, unknown> = {
        prompt: plan.prompt,
        entities: plan.entities,
        aspect_ratio: plan.aspectRatio
      };
      if (plan.kind === "clip") {
        params["resolution"] = options.resolution;
        params["duration_seconds"] = plan.durationSeconds;
      }
      if (capability === "image_to_video" && plan.sourceKeyframe) {
        const seed = host.loadMedia
          ? await host.loadMedia(plan.sourceKeyframe)
          : null;
        if (!seed || seed.length === 0) {
          return {
            ...base,
            error: "The shot's still could not be read back from storage."
          };
        }
        params["image"] = seed;
        // Keep the historical serialized shape for callers that inspect the
        // generation request. It contains exactly the one selected start frame.
        params["images"] = [seed];
      }
      if (capability === "reference_to_video" && !host.loadMedia) {
        return { ...base, error: "Entity reference images cannot be read from storage." };
      }
      if (capability === "reference_to_video" && host.loadMedia) {
        const references = await Promise.all(
          plan.referenceImages.map((reference) => host.loadMedia?.(reference))
        );
        if (references.some((value) => !(value instanceof Uint8Array) || value.length === 0)) {
          return { ...base, error: "A storyboard entity reference image could not be read from storage." };
        }
        params["reference_images"] = references;
      }
      const generationId = newId();
      const persist: RenderGenerationRequest["persist"] =
        plan.kind === "keyframe"
          ? { name: `shot-${plan.index + 1}-still` }
          : { name: `shot-${plan.index + 1}-clip`, mime: "video/mp4" };
      const result = await host.runGeneration({
        id: generationId,
        provider: plan.model.provider,
        capability,
        model: plan.model.model,
        params,
        persist
      });
      const asset = result.assets[0];
      if (!asset?.asset_id) {
        return {
          ...base,
          error:
            "The render succeeded but could not be saved as an asset, so it cannot be attached to the shot. This host has no asset storage wired."
        };
      }
      const assetId = asset.asset_id;
      const assetUri = asset.uri ?? "";
      const render_inputs = stampRenderInputs(plan.renderInputs);
      const updated = await patchShot(host, ref.id, plan.shotId, (current) => {
        if (plan.kind === "keyframe") {
          const keyframe: KeyframeVersion = {
            type: "image",
            asset_id: assetId,
            uri: assetUri,
            render_inputs
          };
          const versions =
            current.keyframe_versions ??
            (current.keyframe ? [current.keyframe] : []);
          return {
            ...current,
            keyframe,
            keyframe_versions: [...versions, keyframe],
            status: "keyframe_ready"
          };
        }
        const clip: ClipVersion = {
          type: "video",
          asset_id: assetId,
          uri: assetUri,
          render_inputs
        };
        const bytes = result.output;
        if (bytes instanceof Uint8Array && host.videoDurationSeconds) {
          const seconds = host.videoDurationSeconds(bytes);
          if (seconds !== null) clip.duration = seconds;
        }
        const versions = current.clip_versions ?? (current.clip ? [current.clip] : []);
        return {
          ...current,
          clip,
          clip_versions: [...versions, clip],
          status: "rendered"
        };
      });
      if (isError(updated)) return { ...base, error: updated.error };
      return {
        ...base,
        ok: true,
        assetId,
        assetUri,
        generationId,
        status: updated.status
      };
    } catch (e) {
      await patchShot(host, ref.id, plan.shotId, (current) => ({
        ...current,
        status: "failed"
      }));
      return { ...base, error: `${capability} failed: ${errorMessage(e)}` };
    }
  });
}
