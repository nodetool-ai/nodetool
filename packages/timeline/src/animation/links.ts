import type { TimelineClip, TimelineTempo } from "../types.js";
import { clipSourceMsAt } from "../timeRemap.js";
import { clipSteppedTime } from "../render/temporal.js";
import { resolveBeatAnimations } from "./beat.js";
import { compileClipAnimations, type CompiledAnimation } from "./compile.js";
import { sampleAnimations, type AnimationSample } from "./sample.js";

export type LinkChannel = "positionX" | "positionY" | "scale" | "rotation" | "opacity";

export type AnimationLink = {
  target: LinkChannel;
  sourceClipId: string;
  source: LinkChannel;
  /** Shift the source animation clock before sampling. */
  timeOffsetMs?: number;
  /** Repeat the source animation over its clip duration. */
  loop?: boolean;
  scale?: number;
  offset?: number;
} | {
  target: LinkChannel;
  kind: "wiggle";
  amplitude: number;
  /** Clip-local amplitude envelope. Values interpolate linearly. */
  amplitudeKeyframes?: { timeMs: number; value: number }[];
  frequencyHz: number;
  seed?: number;
};

export type LinkedChannels = Partial<Record<LinkChannel, number>>;

interface SourceCompilation {
  clip: TimelineClip;
  animations: TimelineClip["animations"];
  durationMs: number;
  width: number;
  height: number;
  beatSignature: string;
  compiled: CompiledAnimation[];
}

interface SourceIndex {
  byId: Map<string, TimelineClip>;
  compiled: Map<string, SourceCompilation>;
  samples: Map<string, AnimationSample>;
  frameMs: number;
  width: number;
  height: number;
  tempoSignature: string;
}

// A sequence's immutable clip array is shared across its layer resolutions.
// Indexing it once avoids a full clip scan for every follower in a grid.
const SOURCE_INDEXES = new WeakMap<readonly TimelineClip[], SourceIndex>();

function sourceIndex(clips: readonly TimelineClip[]): SourceIndex {
  const cached = SOURCE_INDEXES.get(clips);
  if (cached) return cached;
  const byId = new Map<string, TimelineClip>();
  for (const clip of clips) byId.set(clip.id, clip);
  const index: SourceIndex = {
    byId, compiled: new Map(), samples: new Map(),
    frameMs: Number.NaN, width: 0, height: 0, tempoSignature: ""
  };
  SOURCE_INDEXES.set(clips, index);
  return index;
}

function compiledSource(index: SourceIndex, clip: TimelineClip, canvas: { width: number; height: number }, tempo?: TimelineTempo): CompiledAnimation[] {
  const cached = index.compiled.get(clip.id);
  const beatSignature = clip.animations?.some((animation) => animation.beat)
    ? `${clip.startMs}:${tempo?.bpm ?? 120}:${tempo?.offsetMs ?? 0}`
    : "";
  if (cached && cached.clip === clip && cached.animations === clip.animations &&
      cached.durationMs === clip.durationMs && cached.width === canvas.width && cached.height === canvas.height &&
      cached.beatSignature === beatSignature) {
    return cached.compiled;
  }
  const compiled = compileClipAnimations(resolveBeatAnimations(clip, tempo), clip.durationMs, canvas);
  index.compiled.set(clip.id, {
    clip, animations: clip.animations, durationMs: clip.durationMs,
    width: canvas.width, height: canvas.height, beatSignature, compiled
  });
  return compiled;
}

function sampledSource(index: SourceIndex, clip: TimelineClip, atMs: number, canvas: { width: number; height: number }, tempo?: TimelineTempo): AnimationSample {
  const key = `${clip.id}:${atMs}`;
  const cached = index.samples.get(key);
  if (cached) return cached;
  const stepped = clipSteppedTime(clip, atMs);
  const sample = sampleAnimations(
    compiledSource(index, clip, canvas, tempo),
    stepped - clip.startMs,
    undefined,
    clipSourceMsAt(clip, stepped)
  );
  index.samples.set(key, sample);
  return sample;
}

function positiveModulo(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function hash(seed: number, index: number): number {
  const n = Math.sin(seed * 127.1 + index * 311.7) * 43758.5453123;
  return (n - Math.floor(n)) * 2 - 1;
}

function wiggle(atMs: number, amplitude: number, frequencyHz: number, seed: number): number {
  const position = atMs * Math.max(0, frequencyHz) / 1000;
  const index = Math.floor(position);
  const t = position - index;
  const smooth = t * t * (3 - 2 * t);
  return amplitude * (hash(seed, index) * (1 - smooth) + hash(seed, index + 1) * smooth);
}

function wiggleAmplitude(link: Extract<AnimationLink, { kind: "wiggle" }>, localMs: number): number {
  const frames = link.amplitudeKeyframes;
  if (!frames?.length) return link.amplitude;
  let before: (typeof frames)[number] | undefined;
  let after: (typeof frames)[number] | undefined;
  for (const frame of frames) {
    if (frame.timeMs <= localMs && (!before || frame.timeMs > before.timeMs)) before = frame;
    if (frame.timeMs >= localMs && (!after || frame.timeMs < after.timeMs)) after = frame;
  }
  if (!before) return after?.value ?? link.amplitude;
  if (!after || before.timeMs === after.timeMs) return before.value;
  const t = (localMs - before.timeMs) / (after.timeMs - before.timeMs);
  return before.value + (after.value - before.value) * t;
}

function channelAt(index: SourceIndex, clip: TimelineClip, source: LinkChannel, absoluteMs: number, canvas: { width: number; height: number }, tempo?: TimelineTempo): number {
  const sample = sampledSource(index, clip, absoluteMs, canvas, tempo);
  switch (source) {
    case "positionX": return (sample.positionX ?? clip.transform?.position.x ?? 0) + sample.offsetX;
    case "positionY": return (sample.positionY ?? clip.transform?.position.y ?? 0) + sample.offsetY;
    case "scale": return ((clip.transform?.scale.x ?? 1) + (clip.transform?.scale.y ?? 1)) / 2 * sample.scale;
    case "rotation": return (clip.transform?.rotation ?? 0) + sample.rotation;
    case "opacity": return (clip.opacity ?? 1) * sample.opacity;
  }
}

/** Pure, cycle-free links: sources are sampled from their authored state, never from their own links. */
export function resolveAnimationLinks(
  clip: Pick<TimelineClip, "animationLinks"> & { startMs?: number },
  currentTimeMs: number,
  clips: readonly TimelineClip[],
  canvas: { width: number; height: number },
  tempo?: TimelineTempo
): LinkedChannels {
  const resolved: LinkedChannels = {};
  if (!clip.animationLinks?.length) return resolved;
  const index = sourceIndex(clips);
  const tempoSignature = `${tempo?.bpm ?? 120}:${tempo?.offsetMs ?? 0}`;
  if (index.frameMs !== currentTimeMs || index.width !== canvas.width ||
      index.height !== canvas.height || index.tempoSignature !== tempoSignature) {
    index.samples.clear();
    index.frameMs = currentTimeMs;
    index.width = canvas.width;
    index.height = canvas.height;
    index.tempoSignature = tempoSignature;
  }
  for (const link of clip.animationLinks ?? []) {
    if ("kind" in link) {
      const base = link.target === "scale" || link.target === "opacity" ? 1 : 0;
      resolved[link.target] = base + wiggle(currentTimeMs, wiggleAmplitude(link, currentTimeMs - (clip.startMs ?? 0)), link.frequencyHz, link.seed ?? 0);
      continue;
    }
    const source = index.byId.get(link.sourceClipId);
    if (!source || source.durationMs <= 0) continue;
    const shifted = currentTimeMs + (link.timeOffsetMs ?? 0);
    const at = link.loop
      ? source.startMs + positiveModulo(shifted - source.startMs, source.durationMs)
      : shifted;
    const value = channelAt(index, source, link.source, at, canvas, tempo);
    resolved[link.target] = value * (link.scale ?? 1) + (link.offset ?? 0);
  }
  return resolved;
}
