/**
 * `isolate_subject`: cut the subject out of a video clip and carry the result
 * as that clip's generated matte (D2).
 *
 * Three things are separated here on purpose, because only one of them costs
 * money and only one of them can be tested without a provider key:
 *
 * 1. {@link isolateSubjectOnClip} — the state machine over one clip. It marks
 *    the matte in flight, asks the runner for a mask, stores it, applies the
 *    result, and persists at every step. No models, no HTTP, no node registry:
 *    everything it cannot do itself arrives on {@link IsolateSubjectDeps}.
 * 2. {@link falIsolateSubjectRunner} — the provider call, wrapped in the
 *    generation seam so the run gets a row, a cost receipt and cancellation.
 * 3. {@link contextMaskStore} — the download, under the media-egress policy,
 *    and the asset it becomes.
 *
 * **The whole source asset is sent, never the clip's window.** The mask video
 * is read back at the clip's own source time, so its first frame has to be the
 * source's first frame; a submission trimmed to `clipSourceWindowMs` would
 * need an offset the document does not carry. That is also why a later trim or
 * extend of the clip stays inside `sourceRange` and never reads as stale.
 *
 * **A failure never loses a working matte.** A clip that already had a ready
 * result keeps it, selected, with its status back at `ready`; only a clip that
 * had none is left with a `failed` marker. The user's own knobs — invert,
 * strength, feather — survive a regenerate too, which is
 * `applyGeneratedMatteResult`'s rule rather than this module's.
 */

import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  applyGeneratedMatteResult,
  clipSourceWindowMs,
  isGeneratedMatteStale,
  type ClipGeneratedMatte,
  type GeneratedMatteResult,
  type TimelineClip
} from "@nodetool-ai/timeline";
import { isRecord, isString } from "../utils/type-guards.js";
import {
  ISOLATE_SUBJECT_ENDPOINT,
  ISOLATE_SUBJECT_NODE_TYPE,
  ISOLATE_SUBJECT_PROVIDER
} from "./timelines.specs.js";

/** The knobs one generation runs with. Recorded on the matte as provenance. */
export interface IsolateSubjectSettings {
  model: string;
  operating_resolution: string;
  refine_foreground: boolean;
}

/** What the runner is asked for: a mask of one whole source asset. */
export interface IsolateSubjectRunRequest {
  /** The clip's own `currentAssetId`, sent whole. */
  sourceAssetId: string;
  settings: IsolateSubjectSettings;
}

/** What the runner answers with. The bytes are somebody else's problem. */
export interface IsolateSubjectRunResult {
  /** Where the grayscale mask video can be read from. */
  maskVideoUrl: string;
  /** The generation row, so the caller can poll or reconcile it. */
  generationId?: string;
  /** What the provider charged, when it or the catalog stated a price. */
  costUsd?: number;
}

/**
 * The paid half, injected so a test can stand in for it. A fake runner is the
 * only way to exercise this capability without a provider key.
 */
export type IsolateSubjectRunner = (
  request: IsolateSubjectRunRequest
) => Promise<IsolateSubjectRunResult>;

/** The mask, once it is somewhere the document can name. */
export interface StoredMask {
  assetId: string;
}

/** Downloads a provider URL and stores it as an asset. */
export type MaskStore = (maskVideoUrl: string) => Promise<StoredMask>;

/**
 * Writes the clip back to wherever the document lives. `false` means the
 * document moved under the call — a concurrent edit — and nothing was saved.
 */
export type PersistClip = (clip: TimelineClip) => Promise<boolean>;

export interface IsolateSubjectDeps {
  runner: IsolateSubjectRunner;
  storeMask: MaskStore;
  persist: PersistClip;
}

export interface IsolateSubjectInput {
  clip: TimelineClip;
  settings: IsolateSubjectSettings;
  /** True runs the provider even when a ready matte is already there. */
  regenerate: boolean;
  /**
   * The source asset's full duration in ms, when the asset row states one.
   * Absent falls back to the clip's own source window — the generation did
   * cover that much, so the staleness check stays honest either way.
   */
  sourceDurationMs?: number;
}

export interface IsolateSubjectOutcome {
  clip: TimelineClip;
  status: "ready" | "failed";
  assetId?: string;
  generationId?: string;
  sourceRange: { fromMs: number; toMs: number };
  costUsd?: number;
  /** True when a ready matte was handed back without spending anything. */
  reused: boolean;
  /** The generation's own failure. A refusal is `{error}` instead. */
  error?: string;
}

/** A refusal: the call was never worth making. */
export interface IsolateSubjectRefusal {
  error: string;
}

const CONCURRENT_EDIT =
  "The timeline is being modified concurrently; nothing was saved. Retry the call.";

/** The provenance a finished generation stamps on the matte. */
function matteSettings(
  settings: IsolateSubjectSettings
): Record<string, number | string | boolean> {
  return {
    model: settings.model,
    operating_resolution: settings.operating_resolution,
    refine_foreground: settings.refine_foreground,
    provider: ISOLATE_SUBJECT_PROVIDER,
    endpoint: ISOLATE_SUBJECT_ENDPOINT
  };
}

/**
 * The clip with its matte marked in flight, keeping the current asset and the
 * version list intact — the shot goes on showing the cutout it has while the
 * next one is being cut.
 *
 * A clip with no matte yet gets a placeholder whose `assetId` is empty. The
 * scene model draws a matte only at `status: "ready"`, so an empty id is never
 * read; what it buys is a field the UI can show a spinner against.
 */
export function markGeneratedMatteGenerating(
  clip: TimelineClip,
  sourceAssetId: string,
  sourceRange: { fromMs: number; toMs: number },
  settings: IsolateSubjectSettings
): TimelineClip {
  const previous = clip.generatedMatte;
  const generating: ClipGeneratedMatte = previous
    ? { ...previous, status: "generating" }
    : {
        assetId: "",
        sourceAssetId,
        sourceRange: { ...sourceRange },
        settings: matteSettings(settings),
        status: "generating"
      };
  return { ...clip, generatedMatte: generating };
}

/**
 * The clip after a generation failed or was cancelled.
 *
 * A previous ready result is put back exactly as it was — the same asset, the
 * same versions, the same knobs — because a failed regenerate must not cost
 * the user the matte they were already working with. Only a first attempt
 * leaves a `failed` marker behind.
 */
export function generatedMatteAfterFailure(
  clip: TimelineClip,
  previous: ClipGeneratedMatte | undefined
): TimelineClip {
  if (previous) return { ...clip, generatedMatte: { ...previous } };
  const matte = clip.generatedMatte;
  if (!matte) return clip;
  return { ...clip, generatedMatte: { ...matte, status: "failed" } };
}

/**
 * Cut the subject out of one clip, or hand back the cutout it already has.
 *
 * Refuses — without spending — a clip that is not video and a clip with no
 * asset. Reuses a ready, non-stale matte unless `regenerate` is set: a matte
 * whose source asset was replaced under it describes a picture the clip no
 * longer shows, so reusing that one would be worse than paying again.
 */
export async function isolateSubjectOnClip(
  deps: IsolateSubjectDeps,
  input: IsolateSubjectInput
): Promise<IsolateSubjectOutcome | IsolateSubjectRefusal> {
  const { clip } = input;
  if (clip.mediaType !== "video") {
    return {
      error:
        `"${clip.name}" is a ${clip.mediaType} clip. isolate_subject cuts a ` +
        "subject out of video footage."
    };
  }
  const sourceAssetId = clip.currentAssetId;
  if (!isString(sourceAssetId) || sourceAssetId === "") {
    return {
      error:
        `"${clip.name}" has no asset yet — generate or import its media ` +
        "before cutting a matte from it."
    };
  }

  const sourceRange = {
    fromMs: 0,
    toMs: input.sourceDurationMs ?? clipSourceWindowMs(clip).toMs
  };
  const previous = clip.generatedMatte;

  if (
    !input.regenerate &&
    previous?.status === "ready" &&
    !isGeneratedMatteStale(clip)
  ) {
    return {
      clip,
      status: "ready",
      assetId: previous.assetId,
      sourceRange: previous.sourceRange,
      reused: true
    };
  }

  const generating = markGeneratedMatteGenerating(
    clip,
    sourceAssetId,
    sourceRange,
    input.settings
  );
  if (!(await deps.persist(generating))) {
    return { error: CONCURRENT_EDIT };
  }

  try {
    const run = await deps.runner({ sourceAssetId, settings: input.settings });
    const stored = await deps.storeMask(run.maskVideoUrl);
    const result: GeneratedMatteResult = {
      assetId: stored.assetId,
      sourceAssetId,
      sourceRange,
      settings: matteSettings(input.settings)
    };
    if (run.generationId !== undefined) result.jobId = run.generationId;
    // Applied to the clip as it stood before the placeholder, so the version
    // list records the result it replaces and not the in-flight marker.
    const settled = applyGeneratedMatteResult(clip, result);
    if (!(await deps.persist(settled))) {
      return { error: CONCURRENT_EDIT };
    }
    const outcome: IsolateSubjectOutcome = {
      clip: settled,
      status: "ready",
      assetId: stored.assetId,
      sourceRange,
      reused: false
    };
    if (run.generationId !== undefined) outcome.generationId = run.generationId;
    if (run.costUsd !== undefined) outcome.costUsd = run.costUsd;
    return outcome;
  } catch (error) {
    const reverted = generatedMatteAfterFailure(generating, previous);
    // Best effort: the generation already failed, and a save that also fails
    // leaves the in-flight marker, which the next call overwrites.
    await deps.persist(reverted);
    return {
      clip: reverted,
      status: "failed",
      sourceRange,
      reused: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ---------------------------------------------------------------------------
// The real deps
// ---------------------------------------------------------------------------

/** The mask URL, wherever the node's result put it. */
function maskVideoUrlOf(record: Record<string, unknown>): string | null {
  const direct = record["mask_video"] ?? record["mask_video_url"];
  if (isString(direct) && direct !== "") return direct;
  if (isRecord(direct) && isString(direct["url"]) && direct["url"] !== "") {
    return direct["url"];
  }
  return null;
}

/** A receipt's charge, when the provider or the catalog stated one in USD. */
function costUsdOf(receipt: {
  cost?: { amount: number; currency?: string | null } | null;
}): number | undefined {
  const cost = receipt.cost;
  if (!cost) return undefined;
  const currency = cost.currency ?? "USD";
  return currency.toUpperCase() === "USD" ? cost.amount : undefined;
}

/**
 * Run the endpoint through its node, inside the generation seam.
 *
 * The seam is what makes this a *generation* rather than a call: the row is
 * open before the provider is reached, `cancel_generation` can abort it, the
 * FAL node's own `reportFalCost` lands on the receipt, and a request id the
 * reconciler can settle against the invoice is recorded either way. The node
 * holds the API key, so the seam runs `withoutProvider`.
 *
 * The mask is the point of the call, so a result without one is an error
 * rather than a silent no-matte success.
 */
export function falIsolateSubjectRunner(
  context: ProcessingContext,
  registry: NodeRegistry,
  generationId: string
): IsolateSubjectRunner {
  return async (request) => {
    if (!registry.has(ISOLATE_SUBJECT_NODE_TYPE)) {
      throw new Error(
        `${ISOLATE_SUBJECT_NODE_TYPE} is not registered in this install, so ` +
          "there is nothing to cut the subject out with."
      );
    }
    const properties: Record<string, unknown> = {
      video: {
        type: "video",
        uri: `asset://${request.sourceAssetId}`,
        asset_id: request.sourceAssetId
      },
      model: request.settings.model,
      operating_resolution: request.settings.operating_resolution,
      refine_foreground: request.settings.refine_foreground,
      output_mask: true
    };
    const result = await context.runGenerationWith(
      {
        id: generationId,
        provider: ISOLATE_SUBJECT_PROVIDER,
        capability: "video_to_video",
        model: ISOLATE_SUBJECT_ENDPOINT,
        params: {
          asset_id: request.sourceAssetId,
          model: request.settings.model,
          operating_resolution: request.settings.operating_resolution,
          refine_foreground: request.settings.refine_foreground,
          output_mask: true
        },
        origin: { surface: "capability" }
      },
      async () => {
        const executor = registry.resolve({
          id: `isolate-subject-${generationId}`,
          type: ISOLATE_SUBJECT_NODE_TYPE,
          properties
        });
        const emitted: Record<string, unknown>[] = [];
        for await (const chunk of executor.genProcess!(properties, context)) {
          emitted.push(chunk);
        }
        return emitted;
      },
      { withoutProvider: true }
    );

    let maskVideoUrl: string | null = null;
    for (const record of result.output) {
      maskVideoUrl = maskVideoUrlOf(record) ?? maskVideoUrl;
    }
    if (maskVideoUrl === null) {
      throw new Error(
        `${ISOLATE_SUBJECT_ENDPOINT} returned no mask video, so there is ` +
          "nothing to use as a matte."
      );
    }
    const runResult: IsolateSubjectRunResult = {
      maskVideoUrl,
      generationId: result.id
    };
    const cost = result.receipt ? costUsdOf(result.receipt) : undefined;
    if (cost !== undefined) runResult.costUsd = cost;
    return runResult;
  };
}

/** What a stored mask is named, before the asset id replaces it. */
const MASK_ASSET_PREFIX = "isolated-subject-matte";

/**
 * Download the provider's mask and store it as an asset.
 *
 * `fetchExternalMedia` is the one door a provider-chosen URL leaves through —
 * https to a public host, every redirect hop re-checked — because the URL in a
 * provider's response body is not this host's to trust.
 */
export function contextMaskStore(context: ProcessingContext): MaskStore {
  return async (maskVideoUrl) => {
    const { fetchExternalMedia } = await import("@nodetool-ai/runtime");
    const response = await fetchExternalMedia(maskVideoUrl);
    if (!response.ok) {
      throw new Error(
        `The mask video could not be downloaded: ${response.status} ${response.statusText}.`
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new Error("The mask video downloaded as zero bytes.");
    }
    const { persistOutput } = await import("../tools/asset-persist.js");
    const saved = await persistOutput(context, bytes, {
      namePrefix: MASK_ASSET_PREFIX,
      mime: "video/mp4"
    });
    if (!isString(saved.asset_id) || saved.asset_id === "") {
      throw new Error(
        "The mask video was downloaded but could not be stored as an asset, " +
          "so no matte can reference it."
      );
    }
    return { assetId: saved.asset_id };
  };
}
