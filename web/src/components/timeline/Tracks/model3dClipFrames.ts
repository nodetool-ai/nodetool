/**
 * Off-screen frames of a `model3d` clip, for the two surfaces that draw one
 * outside the live preview: the lane filmstrip and the agent's
 * `ui_timeline_get_clip_frames`.
 *
 * Both go through the same {@link Model3DLayerSource} the preview uses, so a
 * thumbnail and a preview frame at the same time are the same picture. What
 * they must not do is take the preview's WebGL contexts: the scene model lets
 * two 3D layers be live at once and the pool holds exactly that many sessions,
 * so a filmstrip pass that borrowed one would evict the clip the user is
 * scrubbing. These frames therefore run on their own pool of **one** session,
 * one job at a time, and release it the moment the last frame is drawn — a
 * context exists only while a strip is being built, never during playback.
 */

import { type TimelineClip } from "@nodetool-ai/timeline";
import {
  clipSourceTimeSec,
  resolveAnimatedLayerProps,
  createAnimationCompileCache,
  effectiveAssetId,
  type ActiveLayer
} from "@nodetool-ai/timeline/render";
import type { Model3DCameraChannels } from "@nodetool-ai/timeline";

import { useAssetStore } from "../../../stores/AssetStore";
import { getAssetUrl } from "../../../utils/assetHelpers";
import {
  Model3DLayerSource,
  type Model3DFrameSize
} from "../preview/Model3DLayerSource";
import type { ClipThumbnail } from "./clipThumbnails";

/** One frame to draw: when in the glTF's clock, and the camera it is seen with. */
export interface Model3DFrameRequest {
  /** The animation's own time in seconds — a layer's `sourceTimeSec`. */
  timeSec: number;
  /** Sampled camera channels; identity when nothing drives them. */
  anim: Model3DCameraChannels;
}

export interface Model3DClipFrameOptions {
  /** Overrides the shared one-session pool. Tests inject a mocked one. */
  source?: Model3DLayerSource;
}

/** Cells sampled across a lane filmstrip, independent of the clip's width. */
export const MODEL3D_FILMSTRIP_SAMPLES = 8;
/** Rendered width of one filmstrip cell, in device pixels. */
const FILMSTRIP_CELL_WIDTH_PX = 96;
const FILMSTRIP_QUALITY = 0.7;

/**
 * The glTF animation's own clock at a timeline time — `clipSourceTimeSec`
 * times `animation.speed`, exactly the number the scene model puts on a
 * `model3d` layer (design §D3), so trimming and retiming a 3D clip move its
 * thumbnails the way they move a video clip's.
 */
export function model3dSourceTimeSec(
  clip: TimelineClip,
  timelineTimeMs: number
): number {
  return (
    clipSourceTimeSec(clip, timelineTimeMs) *
    (clip.model3dStyle?.animation.speed ?? 1)
  );
}

let shared: Model3DLayerSource | undefined;

function sharedSource(): Model3DLayerSource {
  shared ??= new Model3DLayerSource({
    resolveUrl: async (assetId) =>
      getAssetUrl(await useAssetStore.getState().get(assetId)) ?? undefined,
    maxSessions: 1
  });
  return shared;
}

let queue: Promise<unknown> = Promise.resolve();

/** Run `job` after every earlier one, so only one session is ever open. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function layerAt(
  clip: TimelineClip,
  assetId: string,
  timeSec: number
): ActiveLayer {
  return {
    kind: "model3d",
    clip,
    clipId: clip.id,
    trackIndex: 0,
    blendMode: "normal",
    opacity: 1,
    assetId,
    model3dStyle: clip.model3dStyle,
    sourceTimeSec: timeSec
  };
}

/**
 * Draw each requested frame of a 3D clip and hand the session's canvas to
 * `draw`, which must consume it before returning: a session renders into one
 * canvas and the next frame overwrites it.
 *
 * Throws when the clip has no style or asset, and when the session cannot be
 * made — the pool's own message says which, so a caller can show it.
 */
export async function drawModel3DClipFrames<T>(
  clip: TimelineClip,
  frames: readonly Model3DFrameRequest[],
  size: Model3DFrameSize,
  draw: (canvas: OffscreenCanvas, index: number) => T,
  options: Model3DClipFrameOptions = {}
): Promise<T[]> {
  if (!clip.model3dStyle) {
    throw new Error(`3D clip "${clip.name}" has no model3dStyle to draw.`);
  }
  const assetId = effectiveAssetId(clip);
  if (!assetId) {
    throw new Error(`3D clip "${clip.name}" has no model asset.`);
  }
  if (frames.length === 0) return [];

  const source = options.source ?? sharedSource();
  return enqueue(async () => {
    try {
      const session = await source.load(layerAt(clip, assetId, 0));
      if (!session) {
        const state = source.state(clip.id);
        throw new Error(
          state && state.status === "unavailable"
            ? state.message
            : `3D clip "${clip.name}" could not be loaded.`
        );
      }
      return frames.map((frame, index) => {
        const canvas = source.frame(
          layerAt(clip, assetId, frame.timeSec),
          frame.anim,
          size
        );
        if (!canvas) {
          throw new Error(`3D clip "${clip.name}" stopped drawing mid-strip.`);
        }
        return draw(canvas, index);
      });
    } finally {
      // Hand the WebGL context back before the next job — and before the
      // preview needs one.
      source.release(clip.id);
    }
  });
}

/**
 * A filmstrip's worth of thumbnails for a 3D clip: {@link
 * MODEL3D_FILMSTRIP_SAMPLES} frames spread across the clip, each stamped with
 * the source second it sits at so `selectFilmstripCells` picks them the way it
 * picks a video clip's.
 *
 * The count is fixed rather than one per visible cell, so zooming the timeline
 * re-picks cells from what is cached instead of re-rendering the model.
 */
export async function extractModel3DThumbnails(
  clip: TimelineClip,
  sequence: { width: number; height: number },
  options: Model3DClipFrameOptions = {}
): Promise<ClipThumbnail[]> {
  const steps = Math.max(1, MODEL3D_FILMSTRIP_SAMPLES - 1);
  const animationCache = createAnimationCompileCache();
  const samples = Array.from(
    { length: MODEL3D_FILMSTRIP_SAMPLES },
    (_, i) => {
      const timelineTimeMs = clip.startMs + (i / steps) * clip.durationMs;
      const animated = resolveAnimatedLayerProps(
        { clip, transform: clip.transform, opacity: clip.opacity ?? 1 },
        timelineTimeMs,
        sequence,
        animationCache
      );
      return {
        sourceSec: clipSourceTimeSec(clip, timelineTimeMs),
        request: {
          timeSec: model3dSourceTimeSec(clip, timelineTimeMs),
          anim: animated
        }
      };
    }
  );

  const width = FILMSTRIP_CELL_WIDTH_PX;
  const height = Math.max(
    1,
    Math.round((width * sequence.height) / sequence.width)
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  return drawModel3DClipFrames(
    clip,
    samples.map((sample) => sample.request),
    { width, height },
    (frame, index) => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(frame, 0, 0, width, height);
      return {
        time: samples[index].sourceSec,
        dataUrl: canvas.toDataURL("image/jpeg", FILMSTRIP_QUALITY)
      };
    },
    options
  );
}
