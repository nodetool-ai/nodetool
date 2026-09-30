import { createCanvas, ImageData } from "@napi-rs/canvas";
import {
  loadMediaRefBytes,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";
import { clipSourceTimeSec } from "@nodetool-ai/timeline/scene";
import { forEachVideoFrame } from "../analysis/media-decode.js";
import { renderTimelineFrames } from "../timeline-preview/frames.js";

export async function inspectTimelineClipFrames(
  context: ProcessingContext,
  sequence: TimelineSequence,
  clip: TimelineClip,
  options: { timesMs?: number[]; count?: number; width?: number }
) {
  const width = Math.max(1, Math.min(1024, Math.round(options.width ?? 512)));
  const count = Math.max(1, Math.min(8, Math.round(options.count ?? 3)));
  const times = options.timesMs?.length
    ? options.timesMs
    : Array.from({ length: count }, (_, index) =>
        Math.round(
          clip.startMs +
            (count === 1 ? 0 : index / (count - 1)) *
              Math.max(0, clip.durationMs - 1)
        )
      );
  const timesMs = times.map((time) => {
    const rounded = Math.round(time);
    if (rounded >= clip.startMs && rounded <= clip.startMs + clip.durationMs) {
      return Math.min(rounded, clip.startMs + Math.max(0, clip.durationMs - 1));
    }
    if (rounded >= 0 && rounded <= clip.durationMs) {
      return Math.min(
        clip.startMs + rounded,
        clip.startMs + Math.max(0, clip.durationMs - 1)
      );
    }
    throw new Error(`Frame time ${time}ms is outside clip "${clip.name}".`);
  });
  const loadAsset = async (id: string): Promise<Uint8Array | null> =>
    (await loadMediaRefBytes(
      id.includes("://") ? { uri: id } : { asset_id: id },
      context
    )) ?? null;
  if (
    clip.mediaType === "text" ||
    clip.mediaType === "shape" ||
    clip.mediaType === "model3d"
  ) {
    const rendered = await renderTimelineFrames({
      sequence,
      onlyClipIds: [clip.id],
      timesMs,
      width,
      loadAsset
    });
    return rendered.frames.map((frame, index) => ({
      clipId: clip.id,
      clipName: clip.name,
      timelineTimeMs: timesMs[index],
      sourceTimeMs: timesMs[index] - clip.startMs,
      width: frame.width,
      height: frame.height,
      dataUrl: `data:image/png;base64,${Buffer.from(frame.png).toString("base64")}`,
      complete: frame.complete,
      degradations: frame.degraded,
      layers: frame.layers
    }));
  }
  if (clip.mediaType !== "video" && clip.mediaType !== "overlay") {
    throw new Error(
      `Clip "${clip.name}" is ${clip.mediaType}; frame inspection requires video, text, shape or 3D.`
    );
  }
  if (!clip.currentAssetId) {
    throw new Error(`Clip "${clip.name}" has no rendered video asset.`);
  }
  const bytes = await loadAsset(clip.currentAssetId);
  if (!bytes?.length) {
    throw new Error(`Could not load rendered video for clip "${clip.name}".`);
  }
  const timestamps = timesMs.map((time) => clipSourceTimeSec(clip, time));
  const frames: Array<{
    clipId: string;
    clipName: string;
    timelineTimeMs: number;
    sourceTimeMs: number;
    width: number;
    height: number;
    dataUrl: string;
    complete: boolean;
  }> = [];
  await forEachVideoFrame(bytes, timestamps, (frame) => {
    const height = Math.max(
      1,
      Math.round((width * frame.height) / frame.width)
    );
    const source = createCanvas(frame.width, frame.height);
    source
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
    const canvas = createCanvas(width, height);
    canvas.getContext("2d").drawImage(source, 0, 0, width, height);
    frames.push({
      clipId: clip.id,
      clipName: clip.name,
      timelineTimeMs: timesMs[frames.length],
      sourceTimeMs: Math.round(frame.time * 1000),
      width,
      height,
      dataUrl: `data:image/jpeg;base64,${canvas.toBuffer("image/jpeg").toString("base64")}`,
      complete: true
    });
  });
  if (frames.length !== timesMs.length) {
    throw new Error(
      `Could not decode every requested frame of "${clip.name}".`
    );
  }
  return frames;
}
