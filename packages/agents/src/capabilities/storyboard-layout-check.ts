import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  compileClipAnimations,
  makeClip,
  makeTrack,
  type TimelineClip,
  type TimelineSequence
} from "@nodetool-ai/timeline";
import { renderTimelineFrames } from "../timeline-preview/frames.js";

/** A collision between copy and another layer, or between copy and the frame edge. */
export interface LayoutDefect {
  shotId: string;
  timeMs: number;
  clipIds: string[];
  message: string;
}

export interface ShotWindow {
  shotId: string;
  start: number;
  duration: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface LayerFootprint {
  clip: TimelineClip;
  box: Box;
}

/** Copy keeps this clearance from other layers and the frame edge, as a fraction of frame height. */
const CLEARANCE = 0.012;
/** Summed RGBA difference that counts a pixel as drawn by the layer. */
const CHANGE_THRESHOLD = 48;
/** A layer covering this much of the frame is a backdrop, and copy sits on it by design. */
const BACKDROP_COVERAGE = 0.9;
const CHECK_WIDTH = 540;
const BACKDROP_FILLS = ["#000000", "#FFFFFF"] as const;
const LAYOUT_MEDIA = new Set(["text", "image", "video", "shape"]);

const intersects = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const expand = (box: Box, by: number): Box => ({
  left: box.left - by,
  top: box.top - by,
  right: box.right + by,
  bottom: box.bottom + by
});
const contains = (outer: Box, inner: Box): boolean =>
  inner.left >= outer.left &&
  inner.top >= outer.top &&
  inner.right <= outer.right &&
  inner.bottom <= outer.bottom;

/**
 * The settled moment of a shot: midway between the last entrance finishing and
 * the first exit starting. That is the frame a viewer reads the shot at.
 */
export function shotHoldTimes(
  clips: readonly TimelineClip[],
  windows: readonly ShotWindow[],
  width: number,
  height: number
): Map<string, number> {
  const holds = new Map<string, number>();
  for (const window of windows) {
    const end = window.start + window.duration;
    let settled = window.start;
    let exit = end;
    for (const clip of clips) {
      if (clip.mediaType === "audio" || clip.startMs < window.start || clip.startMs >= end) {
        continue;
      }
      for (const animation of compileClipAnimations(clip.animations, clip.durationMs, { width, height })) {
        if (animation.loop) {
          continue;
        }
        if (animation.role === "in") {
          settled = Math.max(settled, clip.startMs + animation.windowEndMs);
        } else if (animation.role === "out") {
          exit = Math.min(exit, clip.startMs + animation.windowStartMs);
        }
      }
    }
    holds.set(
      window.shotId,
      Math.round(settled < exit ? (settled + exit) / 2 : window.start + window.duration / 2)
    );
  }
  return holds;
}

async function decodePixels(png: Uint8Array): Promise<Pixels> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return {
    data: context.getImageData(0, 0, image.width, image.height).data,
    width: image.width,
    height: image.height
  };
}

const changed = (layer: Pixels, empty: Pixels, i: number): boolean =>
  Math.abs(layer.data[i] - empty.data[i]) +
    Math.abs(layer.data[i + 1] - empty.data[i + 1]) +
    Math.abs(layer.data[i + 2] - empty.data[i + 2]) +
    Math.abs(layer.data[i + 3] - empty.data[i + 3]) >=
  CHANGE_THRESHOLD;

/**
 * The box of every pixel a layer changed over either backdrop. One backdrop
 * hides the layer's pixels that share its colour, so a dark product edge on
 * black or white copy on white is caught by the other one.
 */
function changedBox(
  renders: readonly { layer: Pixels; empty: Pixels }[]
): { box: Box; coverage: number } | null {
  const { width, height } = renders[0].layer;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let covered = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (!renders.some(({ layer, empty }) => changed(layer, empty, i))) {
        continue;
      }
      covered += 1;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return right < 0
    ? null
    : { box: { left, top, right, bottom }, coverage: covered / (width * height) };
}

/**
 * Render every visible layer of each shot alone at the shot's hold frame and
 * compare the boxes of the pixels each one draws. Copy that crosses an image
 * edge, crowds another layer or reaches the frame edge is a defect no
 * reference frame can approve. Copy set wholly inside a plate or image is a
 * deliberate overlay and passes.
 */
export async function findLayoutDefects(options: {
  sequence: TimelineSequence;
  windows: readonly ShotWindow[];
  holds: ReadonlyMap<string, number>;
  loadAsset: (assetId: string) => Promise<Uint8Array | null>;
  signal?: AbortSignal;
}): Promise<LayoutDefect[]> {
  const { sequence, windows, holds } = options;
  const defects: LayoutDefect[] = [];
  for (const window of windows) {
    const timeMs = holds.get(window.shotId);
    if (timeMs === undefined) {
      continue;
    }
    // A layer is what it changes over a solid backdrop beneath every track.
    const backdropTrack = makeTrack({
      type: "overlay",
      name: "Layout check backdrop",
      index: Math.max(-1, ...sequence.tracks.map((track) => track.index)) + 1
    });
    const backdrops = BACKDROP_FILLS.map((fill) => {
      const clip = makeClip({
        trackId: backdropTrack.id,
        name: "Layout check backdrop",
        mediaType: "shape",
        sourceType: "imported",
        status: "generated",
        startMs: 0,
        durationMs: timeMs + 1,
        shapeStyle: { kind: "rect", fill, x: 0, y: 0, width: 1, height: 1 }
      });
      return {
        clipId: clip.id,
        sequence: {
          ...sequence,
          tracks: [...sequence.tracks, backdropTrack],
          clips: [...sequence.clips, clip]
        }
      };
    });
    const render = async (
      backdrop: (typeof backdrops)[number],
      clipId?: string
    ): Promise<Pixels | null> => {
      options.signal?.throwIfAborted();
      const frame = (
        await renderTimelineFrames({
          sequence: backdrop.sequence,
          timesMs: [timeMs],
          width: CHECK_WIDTH,
          onlyClipIds: clipId ? [backdrop.clipId, clipId] : [backdrop.clipId],
          loadAsset: options.loadAsset
        })
      ).frames[0];
      return frame ? decodePixels(frame.png) : null;
    };
    const empties: Pixels[] = [];
    for (const backdrop of backdrops) {
      const pixels = await render(backdrop);
      if (pixels) {
        empties.push(pixels);
      }
    }
    if (empties.length !== backdrops.length) {
      continue;
    }
    const empty = empties[0];
    const footprints: LayerFootprint[] = [];
    for (const clip of sequence.clips) {
      if (
        !LAYOUT_MEDIA.has(clip.mediaType) ||
        clip.hidden ||
        clip.startMs > timeMs ||
        timeMs >= clip.startMs + clip.durationMs
      ) {
        continue;
      }
      const renders: { layer: Pixels; empty: Pixels }[] = [];
      for (const [index, backdrop] of backdrops.entries()) {
        const layer = await render(backdrop, clip.id);
        if (layer) {
          renders.push({ layer, empty: empties[index] });
        }
      }
      const measured = renders.length === backdrops.length ? changedBox(renders) : null;
      if (measured && measured.coverage < BACKDROP_COVERAGE) {
        footprints.push({ clip, box: measured.box });
      }
    }
    // Report in sequence pixels, the unit set_clip_params takes.
    const toSequence = (sequence.width || empty.width) / empty.width;
    const px = (value: number): number => Math.round(value * toSequence);
    const clearance = Math.max(1, Math.round(CLEARANCE * empty.height));
    const label = (clip: TimelineClip): string =>
      clip.mediaType === "text"
        ? `"${clip.textStyle?.text?.trim() ?? clip.name}" (${clip.name}, ${clip.id})`
        : `${clip.name} (${clip.id})`;
    const safeArea = expand(
      { left: 0, top: 0, right: empty.width, bottom: empty.height },
      -clearance
    );
    const texts = footprints.filter((layer) => layer.clip.mediaType === "text");
    for (const text of texts) {
      if (!contains(safeArea, text.box)) {
        defects.push({
          shotId: window.shotId,
          timeMs,
          clipIds: [text.clip.id],
          message: `Copy ${label(text.clip)} reaches within ${px(clearance)}px of the frame edge at ${timeMs}ms. Keep all copy inside the safe area.`
        });
      }
      for (const other of footprints) {
        if (other === text) {
          continue;
        }
        const otherIsText = other.clip.mediaType === "text";
        // Report each pair of copy layers once.
        if (otherIsText && texts.indexOf(other) < texts.indexOf(text)) {
          continue;
        }
        if (!intersects(expand(text.box, clearance), other.box)) {
          continue;
        }
        if (!otherIsText && contains(expand(other.box, -clearance), text.box)) {
          continue;
        }
        const gap = Math.max(
          other.box.top - text.box.bottom,
          text.box.top - other.box.bottom,
          other.box.left - text.box.right,
          text.box.left - other.box.right,
          0
        );
        defects.push({
          shotId: window.shotId,
          timeMs,
          clipIds: [text.clip.id, other.clip.id],
          message: intersects(text.box, other.box)
            ? `Copy ${label(text.clip)} overlaps ${label(other.clip)} at ${timeMs}ms. Move or resize one so they keep at least ${px(clearance)}px apart.`
            : `Copy ${label(text.clip)} is ${px(gap)}px from ${label(other.clip)} at ${timeMs}ms. Keep at least ${px(clearance)}px apart.`
        });
      }
    }
  }
  return defects;
}
