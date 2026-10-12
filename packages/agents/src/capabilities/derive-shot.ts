/**
 * The document work behind `derive_shot_from_clip`, kept out of
 * `storyboards.ts` so it can be tested without a database.
 *
 * A derived shot is a new storyboard shot conditioned on frames of a clip
 * already in the cut. The editor runs the same steps in
 * `web/src/hooks/timeline/useDeriveShotFromClip.ts`: frames at
 * `derivedFrameTimesMs`, a shot after the source shot that renders through
 * reference-to-video, and a clip following that shot on a new video track
 * directly above the source clip, over the same span.
 */

import { createCanvas, ImageData } from "@napi-rs/canvas";
import {
  loadMediaRefBytes,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import type { TimelineDocument } from "@nodetool-ai/models";
import {
  derivedFrameTimesMs,
  makeClip,
  makeTrack,
  type TimelineClip
} from "@nodetool-ai/timeline";
import { forEachVideoFrame } from "../analysis/media-decode.js";

type DocumentClip = TimelineDocument["clips"][number];

/** A clip by id, or by name when no id matches. */
export function findDocumentClip(
  clips: readonly DocumentClip[],
  target: string
): DocumentClip | undefined {
  const trimmed = target.trim();
  const lower = trimmed.toLowerCase();
  return (
    clips.find((clip) => clip.id === trimmed) ??
    clips.find((clip) => clip.name.toLowerCase() === lower)
  );
}

export interface DerivedFrame {
  /** Time in the clip's source media, in ms. */
  sourceTimeMs: number;
  png: Uint8Array;
}

/**
 * Decode `count` frames of a video clip's footage, spread over the span it
 * plays, at full resolution as PNG.
 */
export async function captureDerivedFrames(
  context: ProcessingContext,
  clip: TimelineClip,
  count: number
): Promise<DerivedFrame[]> {
  if (!clip.currentAssetId) {
    throw new Error(`Clip "${clip.name}" has no rendered video asset.`);
  }
  const bytes = await loadMediaRefBytes(
    { asset_id: clip.currentAssetId },
    context
  );
  if (!bytes?.length) {
    throw new Error(`Could not load the footage of clip "${clip.name}".`);
  }
  const timesMs = derivedFrameTimesMs(clip, count);
  const frames: DerivedFrame[] = [];
  await forEachVideoFrame(
    bytes,
    timesMs.map((ms) => ms / 1000),
    (frame) => {
      const canvas = createCanvas(frame.width, frame.height);
      canvas
        .getContext("2d")
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(frame.rgba),
            frame.width,
            frame.height
          ),
          0,
          0
        );
      frames.push({
        sourceTimeMs: Math.round(frame.time * 1000),
        png: new Uint8Array(canvas.toBuffer("image/png"))
      });
    }
  );
  if (frames.length !== timesMs.length) {
    throw new Error(
      `Decoded ${frames.length} of ${timesMs.length} frames of clip "${clip.name}".`
    );
  }
  return frames;
}

export interface DerivedShotPlacement {
  tracks: TimelineDocument["tracks"];
  clips: TimelineDocument["clips"];
  trackId: string;
  clipId: string;
}

/**
 * Add a video track directly above the source clip's track and a draft clip
 * on it over the source clip's span, linked to the derived shot. It has no
 * media until a take renders. A lower track index draws above.
 */
export function placeDerivedShotClip(
  document: Pick<TimelineDocument, "tracks" | "clips">,
  source: DocumentClip,
  link: { boardId: string; shotId: string; name: string }
): DerivedShotPlacement {
  const ordered = [...document.tracks].sort((a, b) => a.index - b.index);
  const slot = Math.max(
    0,
    ordered.findIndex((track) => track.id === source.trackId)
  );
  const track = makeTrack({ type: "video", name: "Derived shots" });
  ordered.splice(slot, 0, track);
  const tracks = ordered.map((candidate, index) =>
    candidate.index === index ? candidate : { ...candidate, index }
  );
  const clip = makeClip({
    trackId: track.id,
    name: link.name,
    startMs: source.startMs,
    durationMs: source.durationMs,
    mediaType: "video",
    sourceType: "imported",
    status: "draft",
    storyboardBoardId: link.boardId,
    storyboardShotId: link.shotId,
    versions: []
  });
  return {
    tracks,
    clips: [...document.clips, clip],
    trackId: track.id,
    clipId: clip.id
  };
}
