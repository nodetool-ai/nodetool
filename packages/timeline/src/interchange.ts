import { fadeShapeGain, resolveClipFades } from "./audioFade.js";
import { extractedAudioLinkIds } from "./clipAudio.js";
import {
  clipCurves,
  curveAt,
  EXPORTED_CURVE_PROPERTIES,
  motionKeys,
  PPRO_TICKS_PER_MS,
  pointParameter,
  scalarParameter,
  type MotionKey,
  type OutKey
} from "./interchangeMotion.js";
import { isKeyframeAnimation } from "./keyframes.js";
import { sourceRate } from "./sourceRate.js";
import { activeTakeIdOf } from "./takes.js";
import type { TimelineClip, TimelineMarker, TimelineTrack } from "./types.js";

/** The two editable project formats supported by the initial interchange pass. */
export type InterchangeTarget = "fcpxml" | "premiere_xml";

export interface InterchangeAsset {
  id: string;
  /** A local file URI or the path written into a collected export bundle. */
  uri: string;
  durationMs?: number;
  hasAudio?: boolean;
  /**
   * Picture size in pixels. Premiere shows a picture at its own size, so
   * without it Scale cannot carry the contain fit this editor applies.
   */
  width?: number;
  height?: number;
}

export interface InterchangeSequence {
  name: string;
  width: number;
  height: number;
  fps: number;
  tracks: readonly TimelineTrack[];
  clips: readonly TimelineClip[];
  markers?: readonly TimelineMarker[];
}

export interface InterchangeOptions {
  target: InterchangeTarget;
  /** Resolves only the active asset for every clip. */
  resolveAsset(assetId: string): InterchangeAsset | undefined;
}

export interface InterchangeWarning {
  clipId?: string;
  message: string;
}

export interface InterchangeReport {
  target: InterchangeTarget;
  clipsExported: number;
  clipsReferenced: number;
  missingMedia: number;
  warnings: readonly InterchangeWarning[];
}

export interface InterchangeExport {
  xml: string;
  report: InterchangeReport;
}

const XML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;"
};

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPE[character]!);
}

interface FrameRate {
  numerator: number;
  denominator: number;
  timebase: number;
  ntsc: boolean;
}

/**
 * The NTSC rates Premiere writes as a whole timebase with `ntsc` set: the
 * timebase is the rounded-up rate and the real rate is `timebase * 1000 / 1001`.
 */
const NTSC_RATES = [
  [23.976, 24_000, 1_001, 24],
  [29.97, 30_000, 1_001, 30],
  [47.952, 48_000, 1_001, 48],
  [59.94, 60_000, 1_001, 60],
  [119.88, 120_000, 1_001, 120]
] as const;

function frameRate(fps: number): FrameRate {
  const matchingRate = NTSC_RATES.find(([value]) => Math.abs(fps - value) < 0.01);
  if (matchingRate) {
    return { numerator: matchingRate[1], denominator: matchingRate[2], timebase: matchingRate[3], ntsc: true };
  }
  const timebase = Math.max(1, Math.round(fps));
  return { numerator: timebase, denominator: 1, timebase, ntsc: false };
}

/** The whole rate a fractional, non-NTSC `fps` is written as, or undefined when it is exact. */
function roundedRate(fps: number): number | undefined {
  if (!(fps > 0) || NTSC_RATES.some(([value]) => Math.abs(fps - value) < 0.01)) return undefined;
  return Math.abs(fps - Math.round(fps)) > 0.01 ? Math.max(1, Math.round(fps)) : undefined;
}

function frames(ms: number, rate: FrameRate): number {
  return Math.round((ms * rate.numerator) / (1000 * rate.denominator));
}

function frameDuration(rate: FrameRate): string {
  return `${rate.denominator}/${rate.numerator}s`;
}

function time(ms: number, rate: FrameRate): string {
  return `${frames(ms, rate) * rate.denominator}/${rate.numerator}s`;
}

function sequencedClips(sequence: InterchangeSequence): {
  track?: TimelineTrack;
  clip: TimelineClip;
}[] {
  const byId = new Map(sequence.tracks.map((track) => [track.id, track]));
  return sequence.clips
    .map((clip) => ({ track: byId.get(clip.trackId), clip }))
    .sort((left, right) =>
      (left.track?.index ?? Number.MAX_SAFE_INTEGER) - (right.track?.index ?? Number.MAX_SAFE_INTEGER) || left.clip.startMs - right.clip.startMs
    );
}

/** The asset a clip shows: `currentAssetId`, else its active take. */
export function clipActiveAssetId(clip: TimelineClip): string | undefined {
  if (clip.currentAssetId !== undefined) return clip.currentAssetId;
  const takeId = activeTakeIdOf({ ...clip, currentAssetId: undefined });
  const take = clip.versions.find((version) => version.id === takeId);
  return take?.assetId;
}

/**
 * A time remap that is one straight run through the source: a constant speed,
 * or the same run backwards. Premiere's Time Remap carries it as Speed and
 * Reverse. A ramp or a freeze needs keyframes Premiere rebuilds by hand.
 */
export function constantRemap(
  clip: Pick<TimelineClip, "timeRemap" | "durationMs">
): { rate: number; reverse: boolean; fromMs: number; toMs: number } | undefined {
  const keys = clip.timeRemap?.keyframes;
  if (!keys || keys.length !== 2 || !(clip.durationMs > 0)) return undefined;
  const [first, last] = keys as [(typeof keys)[number], (typeof keys)[number]];
  if (Math.abs(first.t) > 1e-6 || Math.abs(last.t - 1) > 1e-6) return undefined;
  if (last.easing !== undefined && last.easing !== "linear") return undefined;
  const delta = last.sourceMs - first.sourceMs;
  if (Math.abs(delta) < 1e-6) return undefined;
  return {
    rate: Math.abs(delta) / clip.durationMs,
    reverse: delta < 0,
    fromMs: Math.min(first.sourceMs, last.sourceMs),
    toMs: Math.max(first.sourceMs, last.sourceMs)
  };
}

function unsupported(clip: TimelineClip, track: TimelineTrack, target: InterchangeTarget): string[] {
  // Premiere XML carries enable flags, opacity, constant speed, clip volume,
  // fades and the 2D transform with its keyframes, so only FCPXML reports
  // those as needing a bake.
  const premiere = target === "premiere_xml";
  const issues: string[] = [];
  if ((clip.effects?.length ?? 0) > 0) issues.push("effects require baking");
  const otherAnimations = (clip.animations ?? []).filter((animation) => animation.enabled !== false && !(premiere && isKeyframeAnimation(animation)));
  if (otherAnimations.length > 0) issues.push("animations require baking");
  if (premiere) {
    const keyframed = [...clipCurves(clip).keys()].filter((property) => !EXPORTED_CURVE_PROPERTIES.includes(property));
    if (keyframed.length > 0) issues.push(`keyframes on ${keyframed.join(", ")} require baking`);
  }
  if (clip.generatedMatte?.status === "ready") issues.push("generated matte requires baking");
  const transform = clip.transform;
  if (clip.crop || clip.mask || clip.matte) issues.push("advanced transforms require baking");
  else if (transform && !premiere) issues.push("advanced transforms require baking");
  else if (transform && (transform.rotationX || transform.rotationY || transform.perspective || transform.depthPx)) {
    issues.push("3D transforms require baking");
  }
  if (clip.blendMode && clip.blendMode !== "normal") issues.push("blend mode requires baking");
  if (!premiere && clip.opacity !== undefined && clip.opacity !== 1) issues.push("opacity requires baking");
  if (clip.transitionIn) issues.push("transitions require baking");
  if (!premiere && (clip.hidden || clip.muted || !track.visible || track.muted)) issues.push("disabled media cannot be represented");
  if (!premiere && clip.speedMultiplier !== undefined && clip.speedMultiplier !== 1 && !clip.speedBaked) issues.push("playback speed requires baking");
  if (clip.timeRemap && !(premiere && constantRemap(clip))) issues.push("time remap requires baking");
  if (!premiere && clip.volumeDb !== undefined && clip.volumeDb !== 0) issues.push("audio volume requires baking");
  if (!premiere && (clip.fadeInMs || clip.fadeOutMs)) issues.push("audio fades require baking");
  if (clip.caption) issues.push("captions require baking");
  return issues;
}

function exportsMediaType(clip: TimelineClip, target: InterchangeTarget): boolean {
  if (clip.mediaType === "video" || clip.mediaType === "audio") return true;
  return target === "premiere_xml" && clip.mediaType === "image";
}

/**
 * The active asset ids of every clip `target` can carry, deduped in document
 * order. A host resolves these (bytes, duration, audio presence) before it
 * calls {@link exportInterchange}, whose resolver is synchronous.
 */
export function interchangeAssetIds(
  sequence: Pick<InterchangeSequence, "tracks" | "clips">,
  target: InterchangeTarget
): string[] {
  const trackIds = new Set(sequence.tracks.map((track) => track.id));
  const ids = new Set<string>();
  for (const clip of sequence.clips) {
    if (!trackIds.has(clip.trackId) || !exportsMediaType(clip, target)) continue;
    const assetId = clipActiveAssetId(clip);
    if (assetId) ids.add(assetId);
  }
  return [...ids];
}

function renderFcpXml(sequence: InterchangeSequence, items: readonly {
  track: TimelineTrack;
  clip: TimelineClip;
  asset: InterchangeAsset;
  ref: string;
}[]): string {
  const rate = frameRate(sequence.fps);
  const assetLines = items
    .map(({ clip, asset, ref }) =>
      `      <asset id="${ref}" name="${escapeXml(asset.id)}" duration="${time(asset.durationMs ?? (clip.inPointMs ?? 0) + clip.durationMs, rate)}" hasVideo="${clip.mediaType === "video" ? "1" : "0"}" hasAudio="${clip.mediaType === "audio" || asset.hasAudio ? "1" : "0"}"><media-rep kind="original-media" src="${escapeXml(asset.uri)}"/></asset>`
    )
    .join("\n");
  const spine = items
    .filter(({ clip }) => clip.mediaType === "video")
    .map(({ track, clip, ref }) =>
      `        <asset-clip ref="${ref}" name="${escapeXml(clip.name)}" offset="${time(clip.startMs, rate)}" duration="${time(clip.durationMs, rate)}" start="${time(clip.inPointMs ?? 0, rate)}" lane="${track.index + 1}"/>`
    )
    .join("\n");
  const audio = items
    .filter(({ clip }) => clip.mediaType === "audio")
    .map(({ track, clip, ref }) =>
      `        <asset-clip ref="${ref}" name="${escapeXml(clip.name)}" offset="${time(clip.startMs, rate)}" duration="${time(clip.durationMs, rate)}" start="${time(clip.inPointMs ?? 0, rate)}" lane="-${track.index + 1}"/>`
    )
    .join("\n");
  const markers = (sequence.markers ?? [])
    .map((marker) => `        <gap name="Marker" offset="${time(marker.timeMs, rate)}" duration="0s"><marker start="0s" duration="0s" value="${escapeXml(marker.label)}"/></gap>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<fcpxml version="1.10">\n  <resources>\n    <format id="r1" name="FFVideoFormat" frameDuration="${frameDuration(rate)}" width="${sequence.width}" height="${sequence.height}"/>\n${assetLines}\n  </resources>\n  <library><event name="NodeTool"><project name="${escapeXml(sequence.name)}"><sequence format="r1"><spine>\n${spine}\n${audio}\n${markers}\n      </spine></sequence></project></event></library>\n</fcpxml>\n`;
}

interface ExportItem {
  track: TimelineTrack;
  clip: TimelineClip;
  asset: InterchangeAsset;
  ref: string;
  /** Premiere only: also place the video file's own sound on an audio track. */
  embeddedAudio?: boolean;
}

/** One clipitem in a Premiere XML sequence. */
interface PremiereEntry {
  id: string;
  kind: "video" | "audio";
  item: ExportItem;
  /** Entries sharing a key are linked (move and trim together in Premiere). */
  linkKey: string;
  start: number;
  end: number;
  span: SourceSpan;
}

interface PremiereLane {
  enabled: boolean;
  locked: boolean;
  entries: PremiereEntry[];
}

function xmlNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

function bool(value: boolean): string {
  return value ? "TRUE" : "FALSE";
}

/**
 * A NodeTool track may hold overlapping clips (a transition, a free drop);
 * a Premiere track may not. Overlaps stack onto extra lanes, the later clip
 * above, which is also the clip that draws on top here.
 */
function packLanes(entries: readonly PremiereEntry[], enabled: boolean, locked: boolean): PremiereLane[] {
  const lanes: PremiereLane[] = [];
  let highestActiveLane = -1;
  for (const entry of [...entries].sort((left, right) => left.start - right.start)) {
    // Place it above every overlapping predecessor, even if a lower lane is free.
    while (highestActiveLane >= 0 && (lanes[highestActiveLane]?.entries.at(-1)?.end ?? 0) <= entry.start) {
      highestActiveLane -= 1;
    }
    highestActiveLane += 1;
    const lane = lanes[highestActiveLane];
    if (lane) { lane.entries.push(entry); }
    else { lanes.push({ enabled, locked, entries: [entry] }); }
  }
  return lanes;
}

function premiereEffect(name: string, effectId: string, category: string, mediaType: "video" | "audio", parameters: string): string {
  return `<filter><effect><name>${name}</name><effectid>${effectId}</effectid><effectcategory>${category}</effectcategory><effecttype>${category}</effecttype><mediatype>${mediaType}</mediatype>${parameters}</effect></filter>`;
}

function premiereParameter(id: string, value: string, range?: [number, number]): string {
  const bounds = range ? `<valuemin>${range[0]}</valuemin><valuemax>${range[1]}</valuemax>` : "";
  return `<parameter authoringApp="PremierePro"><parameterid>${id}</parameterid><name>${id}</name>${bounds}<value>${value}</value></parameter>`;
}

/** Premiere's Audio Levels gain is linear, capped at +12 dB. */
const MAX_AUDIO_LEVEL = 3.98109;

/** Where a clipitem reads its source, in frames and in milliseconds. */
interface SourceSpan {
  in: number;
  out: number;
  inMs: number;
  outMs: number;
  /** Source frames consumed per timeline frame. */
  speed: number;
  reverse: boolean;
}

function fileName(uri: string): string {
  return uri.split(/[\\/]/).pop() || uri;
}

function sourceSpanOf(clip: TimelineClip, start: number, end: number, rate: FrameRate): SourceSpan {
  const record = end - start;
  if (clip.mediaType === "image") return { in: 0, out: record, inMs: 0, outMs: 0, speed: 1, reverse: false };
  const remap = clip.timeRemap ? constantRemap(clip) : undefined;
  if (remap) {
    const inFrame = frames(remap.fromMs, rate);
    return {
      in: inFrame,
      out: Math.max(inFrame + 1, frames(remap.toMs, rate)),
      inMs: remap.fromMs,
      outMs: remap.toMs,
      speed: remap.rate,
      reverse: remap.reverse
    };
  }
  const inMs = clip.inPointMs ?? 0;
  const inFrame = frames(inMs, rate);
  // A remap Premiere cannot carry (reported) plays the record span 1:1.
  const speed = clip.timeRemap ? 1 : sourceRate(clip);
  // At normal speed the source span is the record span. Rounded on its own it
  // can come out a frame short or long of `end - start`.
  const length = speed === 1 ? record : Math.round(record * speed);
  return { in: inFrame, out: inFrame + length, inMs, outMs: inMs + clip.durationMs * speed, speed, reverse: false };
}

function renderPremiereXml(
  sequence: InterchangeSequence,
  items: readonly ExportItem[],
  warnings: InterchangeWarning[]
): string {
  const rate = frameRate(sequence.fps);
  const rateXml = `<rate><timebase>${rate.timebase}</timebase><ntsc>${bool(rate.ntsc)}</ntsc></rate>`;
  let clipCount = 0;
  const entry = (item: ExportItem, kind: "video" | "audio"): PremiereEntry => {
    const start = frames(item.clip.startMs, rate);
    const end = frames(item.clip.startMs + item.clip.durationMs, rate);
    return {
      id: `clipitem-${++clipCount}`,
      kind,
      item,
      linkKey: item.clip.linkId ? `link:${item.clip.linkId}` : `clip:${item.clip.id}`,
      start,
      end,
      span: sourceSpanOf(item.clip, start, end, rate)
    };
  };
  const visual = items.filter(({ clip }) => clip.mediaType === "video" || clip.mediaType === "image").map((item) => entry(item, "video"));
  const embedded = items.filter((item) => item.embeddedAudio).map((item) => entry(item, "audio"));
  const sound = items.filter(({ clip }) => clip.mediaType === "audio").map((item) => entry(item, "audio"));

  const warned = new Set<string>();
  const warn = (clip: TimelineClip, message: string): void => {
    const text = `${clip.name}: ${message}`;
    if (warned.has(`${clip.id}\n${text}`)) return;
    warned.add(`${clip.id}\n${text}`);
    warnings.push({ clipId: clip.id, message: text });
  };

  /** The source frame a key `localMs` into the clip lands on. */
  const sourceFrame = (placed: PremiereEntry, localMs: number): number => {
    const moved = Math.round(frames(localMs, rate) * placed.span.speed);
    return placed.span.reverse ? placed.span.out - moved : placed.span.in + moved;
  };
  /** True when `frame` does not come after `previous` in the clip's source direction. */
  const notAfter = (placed: PremiereEntry, frame: number, previous: number | undefined): boolean =>
    previous !== undefined && (placed.span.reverse ? frame >= previous : frame <= previous);

  /** The keys of one parameter as source frames, dropping any that land on a frame already used. */
  const sourceKeys = (placed: PremiereEntry, keys: readonly MotionKey[]): { out: OutKey[]; ts: number[] } => {
    const out: OutKey[] = [];
    const ts: number[] = [];
    let previous: number | undefined;
    for (const key of keys) {
      const frame = sourceFrame(placed, key.t * placed.item.clip.durationMs);
      if (notAfter(placed, frame, previous)) continue;
      previous = frame;
      out.push({ frame, interpolation: key.interpolation });
      ts.push(key.t);
    }
    if (out.length < 2) return { out: [], ts: [] };
    if (out.some((key) => key.interpolation === "curve")) {
      warn(placed.item.clip, "keyframe easing was written as smooth curves, without its handles.");
    }
    if (!placed.span.reverse) return { out, ts };
    // A reversed clip reads its source backwards, so its keys run from the later frame to the
    // earlier. Premiere lists them by frame, and each one's interpolation leaves toward the later frame.
    // A hold keeps the key it leaves, which on a reversed clip is the later one in time: Premiere cannot say that.
    if (out.some((key) => key.interpolation === "hold")) {
      warn(placed.item.clip, "hold keyframes on a reversed clip were written as straight segments.");
    }
    const count = out.length;
    const leaving = (index: number) => (index < count - 1 && out[count - 2 - index]!.interpolation !== "hold" ? out[count - 2 - index]!.interpolation : "linear");
    return {
      out: out.map((_, index) => ({ frame: out[count - 1 - index]!.frame, interpolation: leaving(index) })),
      ts: [...ts].reverse()
    };
  };

  const basicMotion = (placed: PremiereEntry): string => {
    const { clip, asset } = placed.item;
    const curves = clipCurves(clip);
    const base = clip.transform;
    const known = (asset.width ?? 0) > 0 && (asset.height ?? 0) > 0;
    const fit = known ? Math.min(sequence.width / asset.width!, sequence.height / asset.height!) : 1;
    const shownWidth = known ? asset.width! * fit : sequence.width;
    const shownHeight = known ? asset.height! * fit : sequence.height;
    const moves = ["scale", "rotation", "offsetX", "offsetY", "positionX", "positionY", "anchorX", "anchorY"];
    const moved = base !== undefined || moves.some((property) => curves.has(property));
    if (!moved && Math.abs(fit - 1) < 1e-9) return "";
    if (!known && moved) {
      warn(clip, "the picture size is unknown, so Scale and Center assume it fills the frame.");
    }
    if ((base && Math.abs(base.scale.x - base.scale.y) > 1e-6) || curves.has("scaleX") || curves.has("scaleY")) {
      warn(clip, "Premiere Basic Motion scales evenly, so the horizontal scale was written for both axes.");
    }
    const scaleCurve = curves.get("scale");
    const scaleAt = (t: number): number => fit * 100 * (base?.scale.x ?? 1) * curveAt(scaleCurve, t, 1);
    const rotationAt = (t: number): number => (((base?.rotation ?? 0) + curveAt(curves.get("rotation"), t, 0)) * 180) / Math.PI;
    const anchorAt = (t: number): { x: number; y: number } => ({
      x: curves.has("anchorX") ? curveAt(curves.get("anchorX"), t, 0.5) : (base?.anchor.x ?? 0.5),
      y: curves.has("anchorY") ? curveAt(curves.get("anchorY"), t, 0.5) : (base?.anchor.y ?? 0.5)
    });
    // Premiere's Center is where the anchor lands, so it carries the anchor's
    // offset from the picture's centre as well as the position.
    const centerAt = (t: number): { horiz: number; vert: number } => {
      const anchor = anchorAt(t);
      const x = curves.has("positionX") ? curveAt(curves.get("positionX"), t, 0) : (base?.position.x ?? 0) + curveAt(curves.get("offsetX"), t, 0);
      const y = curves.has("positionY") ? curveAt(curves.get("positionY"), t, 0) : (base?.position.y ?? 0) + curveAt(curves.get("offsetY"), t, 0);
      return { horiz: (x + (anchor.x - 0.5) * shownWidth) / sequence.width, vert: (y + (anchor.y - 0.5) * shownHeight) / sequence.height };
    };
    const scale = sourceKeys(placed, motionKeys([scaleCurve]));
    const rotation = sourceKeys(placed, motionKeys([curves.get("rotation")]));
    const center = sourceKeys(placed, motionKeys(["offsetX", "offsetY", "positionX", "positionY", "anchorX", "anchorY"].map((property) => curves.get(property))));
    const anchor = sourceKeys(placed, motionKeys([curves.get("anchorX"), curves.get("anchorY")]));
    let clamped = false;
    const limit = (value: number, low: number, high: number): number => {
      if (value < low || value > high) clamped = true;
      return Math.min(high, Math.max(low, value));
    };
    const parameters = [
      scalarParameter("scale", "Scale", [0, 1000], scale.out, (index) => limit(scaleAt(scale.ts[index] ?? 0), 0, 1000)),
      scalarParameter("rotation", "Rotation", [-8640, 8640], rotation.out, (index) => limit(rotationAt(rotation.ts[index] ?? 0), -8640, 8640)),
      pointParameter("center", "Center", center.out, (index) => centerAt(center.ts[index] ?? 0)),
      pointParameter("centerOffset", "Anchor Point", anchor.out, (index) => {
        const point = anchorAt(anchor.ts[index] ?? 0);
        return { horiz: point.x - 0.5, vert: point.y - 0.5 };
      })
    ].join("");
    if (clamped) warn(clip, "scale or rotation went past Premiere's limits and was clamped.");
    return premiereEffect("Basic Motion", "basic", "motion", "video", parameters);
  };

  const opacityFilter = (placed: PremiereEntry): string => {
    const { clip } = placed.item;
    const curve = clipCurves(clip).get("opacity");
    const opacity = clip.opacity ?? 1;
    if (opacity === 1 && !curve) return "";
    const keys = sourceKeys(placed, motionKeys([curve]));
    const at = (index: number): number => Math.min(100, Math.max(0, opacity * curveAt(curve, keys.ts[index] ?? 0, 1) * 100));
    return premiereEffect("Opacity", "opacity", "motion", "video", scalarParameter("opacity", "opacity", [0, 100], keys.out, at));
  };

  const timeRemapFilter = (placed: PremiereEntry): string => {
    const { clip } = placed.item;
    const { speed, reverse } = placed.span;
    if (clip.mediaType === "image" || (speed === 1 && !reverse)) return "";
    return premiereEffect("Time Remap", "timeremap", "motion", placed.kind, [
      premiereParameter("variablespeed", "0", [0, 1]),
      premiereParameter("speed", xmlNumber(speed * 100), [-100_000, 100_000]),
      premiereParameter("reverse", bool(reverse)),
      premiereParameter("frameblending", "FALSE")
    ].join(""));
  };

  /** Audio Levels: the clip's gain, with its fades as keyframes. */
  const levelsFilter = (placed: PremiereEntry): string => {
    const { clip, track } = placed.item;
    const trackDb = track.type === "audio" ? (track.volumeDb ?? 0) : 0;
    const decibels = (clip.volumeDb ?? 0) + trackDb;
    const gain = 10 ** (decibels / 20);
    const fades = resolveClipFades(clip, clip.durationMs);
    const points: { ms: number; gain: number }[] = [];
    if (fades.fadeInMs > 0 || fades.fadeOutMs > 0) {
      const ramp = (length: number, shape: Parameters<typeof fadeShapeGain>[0], rising: boolean, from: number): void => {
        const steps = shape === "linear" ? 1 : 4;
        for (let step = 0; step <= steps; step += 1) {
          const ms = from + (length * step) / steps;
          // Premiere joins the keys with straight lines, so each key carries the
          // gain at the frame it lands on, not at the time it was meant for.
          const landed = (frames(ms, rate) * 1000 * rate.denominator) / rate.numerator;
          const progress = Math.min(1, Math.max(0, (landed - from) / length));
          points.push({ ms, gain: fadeShapeGain(shape, rising ? progress : 1 - progress) });
        }
      };
      if (fades.fadeInMs > 0) ramp(fades.fadeInMs, fades.fadeInShape, true, 0);
      else points.push({ ms: 0, gain: 1 });
      if (fades.fadeOutMs > 0) ramp(fades.fadeOutMs, fades.fadeOutShape, false, clip.durationMs - fades.fadeOutMs);
      else points.push({ ms: clip.durationMs, gain: 1 });
    }
    if (decibels === 0 && points.length === 0) return "";
    const keys: OutKey[] = [];
    const values: number[] = [];
    let previous: number | undefined;
    for (const point of points) {
      const frame = sourceFrame(placed, point.ms);
      if (notAfter(placed, frame, previous)) continue;
      previous = frame;
      keys.push({ frame, interpolation: "linear" });
      values.push(point.gain);
    }
    const usable = keys.length >= 2;
    if (placed.span.reverse) {
      keys.reverse();
      values.reverse();
    }
    if (gain > MAX_AUDIO_LEVEL) warn(clip, "volume above +12 dB was limited to +12 dB, the most Premiere's Audio Levels holds.");
    const level = (index: number): number => Math.min(MAX_AUDIO_LEVEL, gain * (usable ? (values[index] ?? 1) : 1));
    return premiereEffect("Audio Levels", "audiolevels", "audiolevels", "audio",
      scalarParameter("level", "level", [0, MAX_AUDIO_LEVEL], usable ? keys : [], level));
  };

  const panFilter = (placed: PremiereEntry): string => {
    const { track } = placed.item;
    if (track.type !== "audio" || !track.pan) return "";
    return premiereEffect("Audio Pan", "audiopan", "audiopan", "audio",
      scalarParameter("pan", "pan", [-1, 1], [], () => Math.min(1, Math.max(-1, track.pan ?? 0))));
  };

  const premiereFilters = (placed: PremiereEntry): string =>
    placed.kind === "video"
      ? basicMotion(placed) + opacityFilter(placed) + timeRemapFilter(placed)
      : timeRemapFilter(placed) + levelsFilter(placed) + panFilter(placed);

  // Index 0 draws on top here; Premiere's V1 is the bottom track.
  const bottomUp = [...sequence.tracks].sort((left, right) => right.index - left.index);
  const topDown = [...sequence.tracks].sort((left, right) => left.index - right.index);
  const lanesFor = (entries: readonly PremiereEntry[], order: readonly TimelineTrack[], kind: "video" | "audio") =>
    order.flatMap((track) => {
      const own = entries.filter((candidate) => candidate.item.track.id === track.id);
      if (own.length === 0) return [];
      return packLanes(own, kind === "video" ? track.visible : track.muted !== true, track.locked);
    });
  const videoLanes = lanesFor(visual, bottomUp, "video");
  const audioLanes = [...lanesFor(embedded, bottomUp, "audio"), ...lanesFor(sound, topDown, "audio")];

  const placement = new Map<string, { trackIndex: number; clipIndex: number }>();
  for (const lanes of [videoLanes, audioLanes]) {
    lanes.forEach((lane, laneIndex) => lane.entries.forEach((placed, clipIndex) => {
      placement.set(placed.id, { trackIndex: laneIndex + 1, clipIndex: clipIndex + 1 });
    }));
  }
  const groups = new Map<string, PremiereEntry[]>();
  for (const placed of [...visual, ...embedded, ...sound]) {
    groups.set(placed.linkKey, [...(groups.get(placed.linkKey) ?? []), placed]);
  }
  const links = (placed: PremiereEntry): string => {
    const group = groups.get(placed.linkKey) ?? [];
    // Premiere links one picture to its sound; anything else stays unlinked.
    if (group.length < 2 || group.filter((member) => member.kind === "video").length > 1) return "";
    let audioGroup = 0;
    return group.map((member) => {
      const at = placement.get(member.id)!;
      const groupIndex = member.kind === "audio" ? `<groupindex>${++audioGroup}</groupindex>` : "";
      return `<link><linkclipref>${member.id}</linkclipref><mediatype>${member.kind}</mediatype><trackindex>${at.trackIndex}</trackindex><clipindex>${at.clipIndex}</clipindex>${groupIndex}</link>`;
    }).join("");
  };

  // One <file> per asset: written in full where it first appears, then by id.
  const allEntries = [...visual, ...embedded, ...sound];
  const fileIds = new Map<string, string>();
  const fileDurations = new Map<string, number>();
  for (const placed of allEntries) {
    const { asset } = placed.item;
    if (!fileIds.has(asset.id)) fileIds.set(asset.id, `file-${fileIds.size + 1}`);
    const known = asset.durationMs !== undefined ? frames(asset.durationMs, rate) : 0;
    fileDurations.set(asset.id, Math.max(fileDurations.get(asset.id) ?? 0, known, placed.span.out));
  }
  const fileHasVideo = new Set(visual.map((placed) => placed.item.asset.id));
  const fileHasAudio = new Set([...embedded, ...sound].map((placed) => placed.item.asset.id));
  const written = new Set<string>();
  const fileXml = (asset: InterchangeAsset): string => {
    const id = fileIds.get(asset.id)!;
    if (written.has(asset.id)) return `<file id="${id}"/>`;
    written.add(asset.id);
    const size = (asset.width ?? 0) > 0 && (asset.height ?? 0) > 0 ? `<width>${asset.width}</width><height>${asset.height}</height>` : "";
    const video = fileHasVideo.has(asset.id) ? `<video><samplecharacteristics>${rateXml}${size}</samplecharacteristics></video>` : "";
    const audio = fileHasAudio.has(asset.id)
      ? "<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>"
      : "";
    return `<file id="${id}"><name>${escapeXml(fileName(asset.uri))}</name><pathurl>${escapeXml(asset.uri)}</pathurl>${rateXml}<duration>${fileDurations.get(asset.id)}</duration><media>${video}${audio}</media></file>`;
  };

  const ticks = (ms: number): number => Math.round(ms * PPRO_TICKS_PER_MS);
  const clipXml = (placed: PremiereEntry): string => {
    const { clip, asset } = placed.item;
    const { span } = placed;
    const enabled = placed.kind === "video" ? clip.hidden !== true : clip.muted !== true;
    const sourceTrack = `<sourcetrack><mediatype>${placed.kind}</mediatype><trackindex>1</trackindex></sourcetrack>`;
    const pproTicks = clip.mediaType === "image" ? "" : `<pproTicksIn>${ticks(span.inMs)}</pproTicksIn><pproTicksOut>${ticks(span.outMs)}</pproTicksOut>`;
    return `<clipitem id="${placed.id}"><name>${escapeXml(clip.name)}</name><enabled>${bool(enabled)}</enabled><duration>${fileDurations.get(asset.id)}</duration>${rateXml}<start>${placed.start}</start><end>${placed.end}</end><in>${span.in}</in><out>${span.out}</out>${pproTicks}${fileXml(asset)}${sourceTrack}${premiereFilters(placed)}${links(placed)}</clipitem>`;
  };
  const tracksXml = (lanes: readonly PremiereLane[]): string =>
    lanes.map((lane) => `        <track><enabled>${bool(lane.enabled)}</enabled><locked>${bool(lane.locked)}</locked>\n${lane.entries.map((placed) => `          ${clipXml(placed)}`).join("\n")}\n        </track>`).join("\n");

  const duration = Math.max(0, ...allEntries.map((placed) => placed.end));
  const markers = (sequence.markers ?? [])
    .map((marker) => {
      const begin = frames(marker.timeMs, rate);
      const finish = marker.durationMs && marker.durationMs > 0 ? Math.max(begin + 1, frames(marker.timeMs + marker.durationMs, rate)) : -1;
      return `    <marker><comment>${escapeXml(marker.note ?? "")}</comment><name>${escapeXml(marker.label)}</name><in>${begin}</in><out>${finish}</out></marker>`;
    })
    .join("\n");
  // Drop-frame timecode exists only for 29.97 and 59.94.
  const dropFrame = rate.ntsc && (rate.timebase === 30 || rate.timebase === 60);
  const timecode = `<timecode>${rateXml}<string>${dropFrame ? "00;00;00;00" : "00:00:00:00"}</string><frame>0</frame><displayformat>${dropFrame ? "DF" : "NDF"}</displayformat></timecode>`;
  const format = `<format><samplecharacteristics>${rateXml}<width>${sequence.width}</width><height>${sequence.height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!DOCTYPE xmeml>",
    '<xmeml version="4">',
    '  <sequence id="sequence-1">',
    `    <name>${escapeXml(sequence.name)}</name><duration>${duration}</duration>${rateXml}${timecode}`,
    "    <media>",
    `      <video>${format}`,
    tracksXml(videoLanes),
    "      </video>",
    '      <audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>',
    tracksXml(audioLanes),
    "      </audio>",
    "    </media>",
    markers,
    "  </sequence>",
    "</xmeml>",
    ""
  ].filter((line) => line !== "").join("\n");
}

/**
 * Produces a self-contained editable project document. Unsupported visual
 * operations are never silently represented: callers use the report to bake
 * those clips before writing the final bundle.
 */
export function exportInterchange(
  sequence: InterchangeSequence,
  options: InterchangeOptions
): InterchangeExport {
  const warnings: InterchangeWarning[] = [];
  const items: ExportItem[] = [];
  // A video whose sound was detached onto an audio clip plays only that clip.
  const extractedAudio = extractedAudioLinkIds(sequence.clips, sequence.tracks);
  for (const { track, clip } of sequencedClips(sequence)) {
    if (!track) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: timeline track is missing.` });
      continue;
    }
    if (!exportsMediaType(clip, options.target)) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: ${clip.mediaType} media requires baking.` });
      continue;
    }
    for (const issue of unsupported(clip, track, options.target)) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: ${issue}.` });
    }
    const assetId = clipActiveAssetId(clip);
    const asset = assetId ? options.resolveAsset(assetId) : undefined;
    if (!asset) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: active media is missing.` });
      continue;
    }
    const item: ExportItem = { track, clip, asset, ref: `r${items.length + 2}` };
    const soundsHere =
      clip.mediaType === "video" && (track.type === "video" || track.type === "overlay") &&
      !(clip.linkId && extractedAudio.has(clip.linkId));
    if (options.target === "premiere_xml" && soundsHere) {
      if (asset.hasAudio === true) item.embeddedAudio = true;
      else if (asset.hasAudio === undefined) {
        warnings.push({ clipId: clip.id, message: `${clip.name}: embedded audio could not be checked and was left out.` });
      }
    }
    items.push(item);
  }
  const rounded = options.target === "premiere_xml" ? roundedRate(sequence.fps) : undefined;
  if (rounded !== undefined) {
    warnings.push({ message: `${sequence.fps} fps is not a Premiere timebase, so the sequence was written at ${rounded} fps and clip times shift.` });
  }
  // Rendering can add warnings of its own, so the report is counted after it.
  const xml = options.target === "fcpxml" ? renderFcpXml(sequence, items) : renderPremiereXml(sequence, items, warnings);
  const report: InterchangeReport = {
    target: options.target,
    clipsExported: items.length,
    clipsReferenced: items.length,
    missingMedia: warnings.filter((warning) => warning.message.endsWith("active media is missing.")).length,
    warnings
  };
  return { xml, report };
}
