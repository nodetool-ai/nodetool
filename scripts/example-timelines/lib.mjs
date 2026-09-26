// Document plumbing shared by the example-timeline builders (kite.mjs,
// voltra.mjs).
//
// To add an example timeline:
//
// 1. Write `scripts/example-timelines/<slug>.mjs`. Build each scene with
//    `createBuilder`, lay out its tracks with `sceneTracks` (or `bankTracks`),
//    and write the bundle to
//    `packages/base-nodes/nodetool/examples/timelines/<slug>.timeline.json`.
// 2. Run `node scripts/example-timelines/<slug>.mjs` to write the bundle.
// 3. Run `node scripts/render-example-timeline.mjs <slug>` to render the video
//    and poster that the bundle's `videoUri` and `posterUri` name.
// 4. Run `npm run dev:nodetool -- timeline validate <bundle>` and
//    `node scripts/validate-examples.mjs`.
//
// Frames are the unit throughout. Positions are px from the frame centre. A
// scene is a group clip on the `t_scenes` track; its layers are children of
// that group, placed on tracks by the assembly functions at the end.
import { typewriterTiming } from "@nodetool-ai/timeline";
import { applyTimelineOp } from "@nodetool-ai/timeline/ops";

export const rad = (d) => (d * Math.PI) / 180;
export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export const cv = (property, a, b, easing = "easeOutExpo") => ({ property, keyframes: [{ t: 0, value: a }, { t: 1, value: b, easing }] });
const keyframes = (list) => list.map(([t, value, easing]) => (easing ? { t, value, easing } : { t, value }));
export const kfs = (property, list) => ({ property, keyframes: keyframes(list) });
/** A style track, such as `effect.<id>.amount` or `text.color`, keyed like `kfs`. */
export const track = (target, list) => ({ target, keyframes: keyframes(list) });
/** A curve that changes nothing, for an animation that only carries a text animator or style tracks. */
export const NOOP = cv("opacity", 1, 1, "linear");
const REST = { opacity: 1, scale: 1, scaleX: 1, scaleY: 1, trimEnd: 1, wipeProgress: 1 };

export function tf(x = 0, y = 0, s = 1, extra = {}) {
  return { position: { x, y }, scale: { x: s, y: s }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, ...extra };
}

const FIELDS = ["shapeStyle", "textStyle", "effects", "animations", "opacity", "blendMode", "layout", "repeater", "motionBlur",
  "temporalEcho", "mask", "matte", "crop", "borderRadius", "currentAssetId", "caption", "transitionIn", "animationLinks"];

export function createBuilder({ W, H, FPS, font = "Inter" }) {
  const ms = (f) => Math.floor((f * 1000) / FPS);
  let idc = 0;
  const nid = (p) => `${p}${++idc}`;
  const scenes = [];
  let cur = null;

  function scene(name, start, end, extra = {}) {
    const s = { name, start, end, layers: [], slots: new Map(), trackEffects: new Map() };
    s.group = {
      id: name, name, trackId: "t_scenes", startMs: ms(start), durationMs: ms(end + 1) - ms(start),
      mediaType: "group", sourceType: "imported", status: "generated", locked: false, versions: [],
      transform: tf(), ...extra
    };
    scenes.push(s);
    cur = s;
    return s;
  }

  /**
   * Adds a clip to the current scene, above everything added before it. Clips
   * naming the same `slot` share one track: a montage's hard cuts, or two
   * groups a transition runs between. `trackEffects` go on the clip's track.
   */
  function add(mediaType, o) {
    const s = cur;
    const from = o.from ?? s.start;
    const to = o.to ?? s.end;
    const clip = {
      id: o.id ?? nid(mediaType[0]), name: o.name ?? mediaType, startMs: ms(from), durationMs: ms(to + 1) - ms(from),
      mediaType, sourceType: "imported", status: "generated", locked: false, versions: [],
      parentId: o.parent ?? s.name
    };
    if (mediaType !== "adjustment") clip.transform = o.transform ?? tf(o.x ?? 0, o.y ?? 0, o.s ?? 1, o.tx ?? {});
    for (const k of FIELDS) if (o[k] !== undefined) clip[k] = o[k];
    if (o.slot !== undefined && s.slots.has(o.slot)) clip._z = s.slots.get(o.slot);
    else {
      clip._z = s.layers.length;
      if (o.slot !== undefined) s.slots.set(o.slot, clip._z);
    }
    if (o.trackEffects) s.trackEffects.set(clip._z, o.trackEffects);
    clip._from = from;
    s.layers.push(clip);
    return clip;
  }

  const group = (o) => add("group", o);
  const image = (assetId, o = {}) => add("image", { ...o, currentAssetId: assetId });
  const adjust = (effects, o = {}) => add("adjustment", { name: "adjust", ...o, effects });

  /** A shape drawn centred in the frame raster, then placed by its transform. */
  function box(w, h, fill, o = {}) {
    const shape = { kind: o.kind ?? "rect", x: 0.5 - w / 2 / W, y: 0.5 - h / 2 / H, width: w / W, height: h / H, cornerRadius: (o.r ?? 0) / W };
    if (typeof fill === "string") shape.fill = fill; else if (fill) shape.fillStyle = fill;
    if (o.stroke) { shape.stroke = o.stroke; shape.strokeWidthPx = o.sw ?? 1; }
    Object.assign(shape, o.shape ?? {});
    return add("shape", { ...o, shapeStyle: shape });
  }
  const ellipse = (d, fill, o = {}) => box(d, d, fill, { ...o, kind: "ellipse" });

  /** An SVG path given in px from the frame centre. */
  function path(points, o = {}) {
    const X = (v) => ((W / 2 + v) / W).toFixed(5), Y = (v) => ((H / 2 + v) / H).toFixed(5);
    const d = points.map(([cmd, ...xy]) => cmd + xy.map((v, i) => (i % 2 ? Y(v) : X(v))).join(" ")).join(" ");
    const shape = { kind: "path", d, lineCap: "round", lineJoin: "round" };
    if (o.fill) { if (typeof o.fill === "string") shape.fill = o.fill; else shape.fillStyle = o.fill; }
    if (o.stroke) { shape.stroke = o.stroke; shape.strokeWidthPx = o.sw ?? 4; }
    return add("shape", { ...o, shapeStyle: shape });
  }

  /** A text clip. `anchor` "left" puts the block's left edge at x, "right" its right edge. */
  function text(str, size, weight, color, o = {}) {
    const anchor = o.anchor ?? "center";
    const mw = o.mw ?? 0.9;
    const x0 = o.x ?? 0;
    const x = anchor === "left" ? x0 + (mw * W) / 2 : anchor === "right" ? x0 - (mw * W) / 2 : x0;
    const style = { text: str, fontFamily: o.font ?? font, fontSizePx: size, fontWeight: weight, color, align: anchor, maxWidthFrac: mw, ...(o.style ?? {}) };
    if (o.tracking) style.letterSpacingPx = o.tracking * size;
    if (o.fill) style.fill = o.fill;
    return add("text", { ...o, x, textStyle: style });
  }

  /**
   * One custom animation on `clip`, starting at scene frame `f0` and running
   * `dur` frames. An "in" that ends mid-clip away from its rest pose becomes an
   * "out" so its end value holds for the rest of the clip.
   */
  function on(clip, f0, dur, curves, opts = {}) {
    const local = cur.start + f0 - clip._from;
    const delayMs = ms(clip._from + local) - ms(clip._from);
    const durationMs = Math.max(1, ms(clip._from + local + dur) - ms(clip._from + local));
    const a = { id: nid("a"), role: "in", preset: "custom", delayMs, durationMs, custom: { curves }, ...opts };
    const endMs = a.delayMs + a.durationMs;
    const leavesRest = curves.some((c) => c.keyframes.at(-1).value !== (REST[c.property] ?? 0)) || (a.styleTracks && !a.textAnimator);
    if (a.role === "in" && endMs < clip.durationMs && leavesRest) {
      a.role = "out";
      a.delayMs = clip.durationMs - endMs;
    }
    clip.animations = [...(clip.animations ?? []), a];
    return clip;
  }

  /**
   * Curves stretched over the whole clip, so the end value holds without an
   * "out". Use it when a curve must start from its first value at the clip
   * start: an "in" that ends away from rest becomes an "out", which holds the
   * end value until its window opens.
   */
  function across(clip, curves, opts = {}) {
    clip.animations = [...(clip.animations ?? []), { id: nid("a"), role: "in", preset: "custom", delayMs: 0, durationMs: clip.durationMs, custom: { curves }, ...opts }];
    return clip;
  }

  /** A looping custom animation with a cycle of `dur` frames. */
  function loop(clip, dur, curves) {
    clip.animations = [...(clip.animations ?? []), { id: nid("a"), role: "loop", preset: "custom", delayMs: 0, durationMs: ms(dur), custom: { curves } }];
    return clip;
  }

  /** Fade the whole clip out over its last `dur` frames. */
  function fadeOut(clip, dur) {
    clip.animations = [...(clip.animations ?? []), { id: nid("a"), role: "out", preset: "custom", delayMs: 0, durationMs: ms(dur), custom: { curves: [cv("opacity", 1, 0, "easeIn")] } }];
    return clip;
  }

  /**
   * A typewriter on a text clip, `delay` frames after the clip starts and
   * `dur` frames long. Stored the way `animate_clip` stores it: one-millisecond
   * reveals, one per character. A typewriter written with a plain duration
   * draws nothing until its window ends. It replaces the clip's animations.
   */
  function typewriter(clip, delay, dur, opts = {}) {
    const typed = typewriterTiming(clip.textStyle.text, clip.durationMs - ms(delay), ms(dur));
    clip.animations = [{ id: nid("a"), role: "in", preset: "typewriter", delayMs: ms(delay), ...typed, ...opts }];
    return clip;
  }

  /**
   * Rain that falls: the plate jumps to a new offset every two frames on held
   * keys, the way a flicker of streaks reads in live action. A scrolling tile
   * showed its seam, because the generated plate is denser at the top.
   */
  function rainShimmer(clip, seed, reach = 140) {
    const frames = Math.round((clip.durationMs / 1000) * FPS);
    const steps = Math.max(2, Math.floor(frames / 2));
    const at = (axis) => kfs(axis, Array.from({ length: steps + 1 }, (_, k) => [k / steps, Math.round((hash(seed * 97 + k * 3 + (axis === "offsetX" ? 1 : 2)) - 0.5) * 2 * reach), k ? "hold" : undefined]));
    return across(clip, [at("offsetX"), at("offsetY")]);
  }

  function finish(clip, trackId) {
    clip.trackId = trackId;
    delete clip._z;
    delete clip._from;
    return clip;
  }

  /**
   * Each scene gets its own tracks, one per layer or slot, with later scenes
   * above earlier ones so an incoming scene covers the one it transitions
   * from. A track effect then never reaches another scene. Returns the layer
   * tracks (indexed from `offset`, unsorted) and their clips.
   */
  function sceneTracks(offset) {
    const tracks = [], clips = [];
    for (const s of [...scenes].reverse()) {
      const slots = [...new Set(s.layers.map((clip) => clip._z))].sort((a, b) => a - b);
      const size = slots.length;
      slots.forEach((z, i) => {
        const t = { id: `t_${s.name}_${i}`, name: `${s.name} ${i}`, type: "video", index: offset + size - 1 - i, visible: true, locked: false };
        if (s.trackEffects.has(z)) t.effects = s.trackEffects.get(z);
        tracks.push(t);
      });
      for (const clip of s.layers) clips.push(finish(clip, `t_${s.name}_${slots.indexOf(clip._z)}`));
      offset += size;
    }
    return { tracks, clips };
  }

  /**
   * Layers alternate between track banks named by each scene's `bank`, so a
   * transition's overlapping scenes never share a track. Slots and track
   * effects are not supported. Returns the layer tracks and their clips.
   */
  function bankTracks(offset, banks) {
    const tracks = [], clips = [];
    for (const bank of banks) {
      const inBank = scenes.filter((s) => s.bank === bank);
      const size = Math.max(...inBank.map((s) => s.layers.length));
      for (let i = 0; i < size; i++) tracks.push({ id: `t_${bank}${i}`, name: `${bank}${i}`, type: "video", index: offset + i, visible: true, locked: false });
      for (const s of inBank) {
        [...s.layers].sort((a, b) => a._z - b._z).forEach((clip, i) => clips.push(finish(clip, `t_${bank}${size - 1 - i}`)));
      }
      offset += size;
    }
    return { tracks, clips };
  }

  /**
   * The beat grid, through the same ops the editor's tempo tools run: markers
   * on every beat of `durationMs`, then the `snap` clip ids snapped to it. A
   * cut off the grid fails the build instead of shipping a drag. Returns the
   * resulting editor state.
   */
  async function beatGrid(tracks, clips, { bpm, durationMs, snap }) {
    let state = { fps: FPS, width: W, height: H, tracks, clips, markers: [], mediaTracks: [], playheadMs: 0, selectedClipIds: [] };
    const opCtx = { newId: (kind) => nid(kind) };
    const beats = Math.floor((durationMs / 1000) * (bpm / 60));
    for (const op of [
      { op: "set_markers_from_beats", bpm, offset_ms: 0, count: beats, label: "Beat" },
      { op: "snap_to_beats", targets: snap, bpm, offset_ms: 0, mode: "start", action: "move", tolerance_ms: 40 }
    ]) {
      const outcome = await applyTimelineOp(state, op, opCtx);
      if (outcome.error) throw new Error(`${op.op}: ${outcome.error}`);
      if (op.op === "snap_to_beats") {
        const off = outcome.result.clips.filter((c) => !c.snapped && c.reason !== "already on the grid");
        if (off.length) throw new Error(`cut off the beat: ${JSON.stringify(off)}`);
      }
      state = outcome.state;
    }
    return state;
  }

  return {
    ms, nid, scenes, current: () => cur,
    scene, add, group, image, adjust, box, ellipse, path, text,
    on, across, loop, fadeOut, typewriter, rainShimmer,
    sceneTracks, bankTracks, beatGrid
  };
}
