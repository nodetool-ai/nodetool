/**
 * useTimelineAgentBridge
 *
 * Registers a {@link TimelineAgentHandler} for the surrounding timeline editor
 * instance under its sequence id, so the `ui_timeline_*` agent tools can target
 * this sequence by name.
 *
 * The handler holds no op semantics. It reads the document out of the three
 * per-instance stores (document, UI, playback), runs the op through
 * `applyTimelineOp` from `@nodetool-ai/timeline/ops` — the same function the
 * headless eval bridge runs — and writes the returned document back through one
 * store action, so one tool call is one undo entry. What a pure function cannot
 * do stays here: resolving a library asset, baking a `code` animation body,
 * starting a generation job, sampling rendered frames.
 *
 * Registration is not focus-gated: with several timeline tabs open, every one
 * stays addressable by id. The handler is cleared on unmount.
 */

import { useEffect, useMemo } from "react";
import { createTimeOrderedUuid } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import {
  applyTimelineOp,
  serializeClip,
  type TimelineOp,
  type TimelineOpAsset,
  type TimelineOpContext,
  type TimelineOpResult,
  type TimelineOpState,
  resolveClipTarget
} from "@nodetool-ai/timeline/ops";
import { parseSvgPath } from "@nodetool-ai/timeline/scene";
import type { TimelineComposition } from "@nodetool-ai/timeline";

import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStoreApi } from "../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../stores/timeline/TimelinePlaybackStore";
import { useTimelineHistoryBatch } from "../../stores/timeline/useTimelineHistoryBatch";
import {
  getRememberedModel,
  type ModelKind
} from "../../stores/lastModelStore";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import { useTimelineDirectGenJob } from "./useTimelineDirectGenJob";
import {
  getTimelineAgentHandler,
  hasTimelineAgentHandler,
  setTimelineAgentHandler,
  type TimelineAgentHandler,
  type TimelineClipFrameNode,
  type TimelineClipSummary,
  type TimelineGenerateKind
} from "../../components/timeline/timelineAgentBridge";
import { extractVideoFrames } from "../../components/timeline/Tracks/clipThumbnails";
import { renderRasterClipFrames } from "../../components/timeline/preview/rasterClipFrames";

const KIND_TO_MODEL_KIND = {
  "text-to-video": "video",
  "text-to-image": "image",
  "text-to-audio": "audio"
} satisfies Record<TimelineGenerateKind, ModelKind>;

const DEFAULT_FRAME_COUNT = 3;
const MAX_FRAME_COUNT = 8;
const DEFAULT_FRAME_WIDTH = 512;
const MAX_FRAME_WIDTH = 1024;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sampleClipTimelineTimes(clip: TimelineClip, count: number): number[] {
  const n = clampNumber(Math.round(count), 1, MAX_FRAME_COUNT);
  const start = clip.startMs;
  const end = Math.max(start, start + clip.durationMs - 1);
  if (n === 1 || end <= start) return [start];
  return Array.from({ length: n }, (_, i) =>
    Math.round(start + (i / (n - 1)) * (end - start))
  );
}

/**
 * Resolve a caller's frame time to a timeline time.
 *
 * `timesMs` is documented as timeline time, but a caller inspecting one clip
 * thinks in that clip's own time — "show me 200ms in" — and a clip that starts
 * at 15552ms then rejected every number a reasonable caller passed. Both
 * readings are accepted: a time inside the clip's timeline span is timeline
 * time, and otherwise a time inside `0…durationMs` is clip-relative. The two
 * only overlap on a clip that starts at 0, where they mean the same frame.
 */
function timelineTimeForFrameRequest(
  clip: TimelineClip,
  requestedMs: number
): number {
  const clipStart = clip.startMs;
  const clipEnd = clip.startMs + clip.durationMs;
  if (requestedMs >= clipStart && requestedMs <= clipEnd) return requestedMs;
  if (requestedMs >= 0 && requestedMs <= clip.durationMs) {
    return clipStart + requestedMs;
  }
  throw new Error(
    `Frame time ${requestedMs}ms is outside clip "${clip.name}": pass a timeline time in ${clipStart}–${clipEnd}ms, or a clip-relative time in 0–${clip.durationMs}ms.`
  );
}

function sourceTimeForTimelineTime(
  clip: TimelineClip,
  timelineTimeMs: number
): number {
  const clipStart = clip.startMs;
  const clipEnd = clip.startMs + clip.durationMs;
  if (timelineTimeMs < clipStart || timelineTimeMs > clipEnd) {
    throw new Error(
      `Frame time ${timelineTimeMs}ms is outside clip "${clip.name}" (${clipStart}–${clipEnd}ms).`
    );
  }
  const speed = clip.speedMultiplier ?? 1;
  const inPointMs = clip.inPointMs ?? 0;
  return Math.max(0, inPointMs + (timelineTimeMs - clipStart) * speed);
}


/** Whether a fetched JSON body carries the shape a composition must have. */
function isComposition(value: unknown): value is TimelineComposition {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["id"] === "string" &&
    typeof record["name"] === "string" &&
    typeof record["group"] === "object" &&
    Array.isArray(record["children"])
  );
}

export const useTimelineAgentBridge = (sequenceId: string | null): void => {
  const doc = useTimelineStoreApi();
  const ui = useTimelineUIStoreApi();
  const playback = useTimelinePlaybackStoreApi();
  const history = useTimelineHistoryBatch();
  const { start: startDirectGen } = useTimelineDirectGenJob();

  const handler = useMemo<TimelineAgentHandler>(() => {
    /** The document the ops read, assembled from the three editor stores. */
    const readState = (): TimelineOpState => {
      const state = doc.getState();
      return {
        fps: state.fps,
        width: state.width,
        height: state.height,
        tracks: state.tracks,
        clips: state.clips,
        markers: state.markers,
        playheadMs: Math.round(playback.getState().getTimeMs()),
        selectedClipIds: [...ui.getState().selectedClipIds]
      };
    };

    const ctx: TimelineOpContext = {
      newId: () => createTimeOrderedUuid(),
      async resolveAsset(ref: string): Promise<TimelineOpAsset | null> {
        const assetId = ref.startsWith("asset://")
          ? ref.slice("asset://".length).replace(/\.[A-Za-z0-9]{1,8}$/, "")
          : ref;
        const asset = await useAssetStore.getState().get(assetId);
        if (!asset) return null;
        const found: TimelineOpAsset = {
          id: asset.id,
          name: asset.name,
          contentType: asset.content_type ?? ""
        };
        if (asset.duration !== null && asset.duration !== undefined) {
          found.durationMs = Math.round(asset.duration * 1000);
        }
        const thumbnails = (asset.metadata as { thumbnails?: string[] } | null)
          ?.thumbnails;
        if (thumbnails && thumbnails.length > 0) {
          found.thumbnailAssetId = thumbnails[0];
        }
        return found;
      },
      parseSvgPath,
      loadComposition: {
        // A saved composition is a JSON asset. The shipped templates live in
        // the server's own package directory, which the browser cannot read, so
        // one of those is inserted through edit_timeline instead.
        async get(id: string) {
          const asset = await useAssetStore.getState().get(id);
          const url = getAssetUrl(asset);
          if (!url) return null;
          const response = await fetch(url);
          if (!response.ok) return null;
          const parsed: unknown = await response.json();
          return isComposition(parsed) ? parsed : null;
        },
        async listIds() {
          return [];
        }
      }
    };

    /**
     * Run one op and write the document it returns back. The write is a single
     * store action inside a history batch, so a tool call — including a batched
     * one that touches many clips — is one undo step.
     */
    const applyOp = async (op: TimelineOp): Promise<TimelineOpResult> => {
      const before = readState();
      const outcome = await applyTimelineOp(before, op, ctx);
      if (outcome.error !== undefined) throw new Error(outcome.error);
      const next = outcome.state;
      history.begin();
      doc.getState().applyAgentEdit({
        tracks: next.tracks,
        clips: next.clips,
        markers: next.markers
      });
      history.mark();
      history.end();
      // Selection and the playhead live in the other two stores, which carry no
      // undo history of their own.
      const selected = next.selectedClipIds;
      if (selected.join() !== before.selectedClipIds.join()) {
        if (selected.length === 0) ui.getState().clearSelection();
        else ui.getState().selectClip(selected[0]);
      }
      if (next.playheadMs !== before.playheadMs) {
        playback.getState().seek(next.playheadMs);
      }
      return outcome.result;
    };

    return {
      getSequenceId: () => doc.getState().sequenceId,

      applyOp,

      async generateClip(opts) {
        // Provider/model/voice resolution is the browser's: it remembers what
        // the user last picked, which no pure op can know.
        const remembered = getRememberedModel(KIND_TO_MODEL_KIND[opts.kind]);
        const provider = opts.provider ?? remembered?.provider;
        const model = opts.model ?? remembered?.model;
        const voice =
          opts.kind === "text-to-audio"
            ? (opts.voice ?? remembered?.voice)
            : opts.voice;
        const canGenerate =
          !!provider &&
          !!model &&
          opts.prompt.trim().length > 0 &&
          (opts.kind !== "text-to-audio" || !!voice);
        const wanted = opts.autoGenerate !== false;

        const result = (await applyOp({
          op: "generate_clip",
          kind: opts.kind,
          prompt: opts.prompt,
          trackId: opts.trackId,
          startMs: opts.startMs,
          durationMs: opts.durationMs,
          provider,
          model,
          voice,
          width: opts.width,
          height: opts.height,
          aspectRatio: opts.aspectRatio,
          resolution: opts.resolution,
          autoGenerate: wanted && canGenerate
        })) as { clip: TimelineClipSummary };

        if (!wanted) {
          return {
            clip: result.clip,
            generationStarted: false,
            note: "Clip created as a draft (autoGenerate was false)."
          };
        }
        if (!canGenerate) {
          return {
            clip: result.clip,
            generationStarted: false,
            note:
              opts.kind === "text-to-audio" && !voice
                ? "Clip created as a draft — set a provider, model and voice, then regenerate."
                : "Clip created as a draft — no model resolved. Set a provider and model, then regenerate."
          };
        }
        const requestId = await startDirectGen(result.clip.id);
        if (requestId === null) {
          return {
            clip: result.clip,
            generationStarted: false,
            note: "Generation could not be started; the clip is a draft."
          };
        }
        return { clip: result.clip, generationStarted: true };
      },

      async regenerateClip(clipId) {
        await startDirectGen(clipId);
      },

      async getClipFrames(target, opts) {
        const state = readState();
        const clip = resolveClipTarget(state, target);
        const summary = serializeClip(state, clip) as TimelineClipSummary;
        const timelineTimes =
          opts.timesMs && opts.timesMs.length > 0
            ? opts.timesMs
                .slice(0, MAX_FRAME_COUNT)
                .map((time) =>
                  timelineTimeForFrameRequest(clip, Math.round(time))
                )
            : sampleClipTimelineTimes(clip, opts.count ?? DEFAULT_FRAME_COUNT);
        const width = clampNumber(
          Math.round(opts.width ?? DEFAULT_FRAME_WIDTH),
          1,
          MAX_FRAME_WIDTH
        );

        if (clip.mediaType === "text" || clip.mediaType === "shape") {
          const frames = await renderRasterClipFrames(
            clip,
            timelineTimes,
            width,
            state.width,
            state.height
          );
          return {
            clip: summary,
            frames: frames.map((frame, index) => ({
              clipId: clip.id,
              clipName: clip.name,
              timelineTimeMs: timelineTimes[index],
              sourceTimeMs: timelineTimes[index] - clip.startMs,
              ...frame
            }))
          };
        }

        if (clip.mediaType !== "video" && clip.mediaType !== "overlay") {
          throw new Error(
            `Clip "${clip.name}" is ${clip.mediaType}; frame inspection requires a video clip.`
          );
        }
        if (!clip.currentAssetId) {
          throw new Error(`Clip "${clip.name}" has no rendered video asset.`);
        }

        const asset = await useAssetStore.getState().get(clip.currentAssetId);
        const url = getAssetUrl(asset);
        if (!url) {
          throw new Error(
            `Could not resolve video URL for clip "${clip.name}".`
          );
        }

        const sourceTimes = timelineTimes.map((time) =>
          sourceTimeForTimelineTime(clip, time)
        );
        const frames = await extractVideoFrames(
          url,
          sourceTimes.map((time) => time / 1000),
          width
        );
        const frameNodes: TimelineClipFrameNode[] = frames.map((frame, i) => ({
          clipId: clip.id,
          clipName: clip.name,
          timelineTimeMs: timelineTimes[i],
          sourceTimeMs: Math.round(frame.time * 1000),
          width: frame.width,
          height: frame.height,
          dataUrl: frame.dataUrl
        }));
        return { clip: summary, frames: frameNodes };
      }
    };
  }, [doc, ui, playback, history, startDirectGen]);

  useEffect(() => {
    if (!sequenceId) return;
    setTimelineAgentHandler(sequenceId, handler);
    return () => {
      // Only clear if we're still the handler registered for this id — a
      // remount may have already replaced us.
      if (
        hasTimelineAgentHandler(sequenceId) &&
        getTimelineAgentHandler(sequenceId) === handler
      ) {
        setTimelineAgentHandler(sequenceId, null);
      }
    };
  }, [sequenceId, handler]);
};
