/**
 * A motion-graphics timeline authoring API for the sandbox.
 *
 * Author a cut as code: `video({...})` returns `v`; `v.scene(name, seconds,
 * fn)` builds one scene at its own local clock; `v.series([...])` lays scenes
 * end to end with authored transitions between them; `v.save(nodetool.timelines)`
 * saves the result. Every time value anywhere in this API is seconds, local to
 * its own scene or `seq`. There is no absolute-time option: `v.series` is the
 * only place a scene's position in the whole video is decided. See the pack's
 * SKILL.md.
 */

import { barChart, lineChart, areaChart, donut, statCounter } from "./charts.js";
import {
  component as makeComponentDescriptor,
  defaultComponentProps,
  markerPropValue,
  pointerForProp,
  resolveComponentProps
} from "./components.js";

export const rad = (d) => (d * Math.PI) / 180;
export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * A deterministic 1D value-noise generator, seeded — no `Math.random`, so two
 * runs of the same script produce the same motion. `noise(seed)(x)` returns a
 * smoothly-interpolated value in 0..1; feed it an increasing `x` (frame index,
 * or `t` seconds) for organic jitter that never repeats and never re-rolls
 * between renders.
 */
export function noise(seed = 0) {
  const base = seed * 1013.9041;
  return (x) => {
    const xi = Math.floor(x), xf = x - xi;
    const a = hash(xi + base), b = hash(xi + 1 + base);
    const u = xf * xf * (3 - 2 * xf); // smoothstep
    return a + (b - a) * u;
  };
}

/** `[["M", x, y], ["L", x, y], …, ["Z"]?]` -> `{verts: [[x,y], …], closed}`. */
function polylineFromPoints(points) {
  const verts = [];
  let closed = false;
  for (const [cmd, ...args] of points) {
    if (cmd === "Z" || cmd === "z") { closed = true; continue; }
    if (args.length >= 2) verts.push([args[args.length - 2], args[args.length - 1]]);
  }
  return { verts, closed };
}

/** Even arc-length resampling of a polyline to exactly `n` vertices. */
function resamplePolyline(verts, closed, n) {
  const pts = closed ? [...verts, verts[0]] : verts;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = lens[lens.length - 1] || 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const target = closed ? (i / n) * total : (i / Math.max(1, n - 1)) * total;
    let seg = 1;
    while (seg < lens.length - 1 && lens[seg] < target) seg++;
    const segStart = lens[seg - 1], segEnd = lens[seg];
    const u = segEnd === segStart ? 0 : (target - segStart) / (segEnd - segStart);
    const a = pts[seg - 1], b = pts[seg];
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

/** Resampled vertices back into `path()`'s point-command shape: one `M`, the rest `L`. */
function verticesToPoints(verts, closed) {
  const cmds = verts.map((v, i) => [i === 0 ? "M" : "L", v[0], v[1]]);
  if (closed) cmds.push(["Z"]);
  return cmds;
}

/**
 * Piecewise-linear keyframe reduction: drop a sample when the straight line
 * between its neighbours already predicts it within `epsilon`, so a baked
 * `el.expr()` curve stays small instead of one keyframe per frame.
 */
function reduceLinearKeyframes(points, epsilon) {
  if (points.length <= 2) return points;
  const kept = [points[0]];
  let anchor = 0;
  let i = 1;
  while (i < points.length) {
    let j = i;
    while (j + 1 < points.length) {
      const a = points[anchor], b = points[j + 1];
      const span = b.t - a.t || 1;
      let ok = true;
      for (let k = anchor + 1; k <= j; k++) {
        const p = points[k];
        const expected = a.v + (b.v - a.v) * ((p.t - a.t) / span);
        if (Math.abs(p.v - expected) > epsilon) { ok = false; break; }
      }
      if (!ok) break;
      j++;
    }
    kept.push(points[j]);
    anchor = j;
    i = j + 1;
  }
  return kept;
}

/** Drop a sample when it repeats the last kept value — for string-valued style tracks. */
function reduceConstantRuns(points) {
  if (points.length <= 2) return points;
  const kept = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (points[i].v !== kept[kept.length - 1].v) kept.push(points[i]);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

/** Ticks per quarter note in a midi clip's `notes`, as the document counts them. */
export const MIDI_PPQ = 960;
/**
 * `[beat, pitch, lenBeats?, velocity?]` tuples (musical time — beats, not
 * seconds; a track's tempo maps them to real time) into the document's
 * `notes: MidiNote[]`.
 */
function midiNotes(list, nid) {
  return list.map(([beat, pitch, len = 0.25, velocity = 100]) => ({
    id: nid("n"), pitch, velocity,
    startTick: Math.round(beat * MIDI_PPQ), durationTick: Math.max(1, Math.round(len * MIDI_PPQ))
  }));
}

const EASE = { in: "easeIn", out: "easeOut", inOut: "easeInOut", outExpo: "easeOutExpo", inExpo: "easeInExpo", linear: "linear" };
/** Resolve a short ease name (`"outExpo"`) or pass through a raw curve name (`"spring(160,20,1)"`). */
export const ease = (name) => EASE[name] ?? name;

/** A property's neutral pose: what `enter`/`exit` animate to/from by default. */
const REST_ONE = new Set(["opacity", "scale", "scaleX", "scaleY", "trimEnd", "wipeProgress"]);
const restOf = (property) => (REST_ONE.has(property) ? 1 : 0);

/**
 * `animate()`'s default role when the caller names none: "in" is right for
 * most calls (a slide, a scale bump), but a call whose curves end farther
 * from every property's own rest pose than they started — opacity trailing
 * off toward 0, an offset drifting away from center — is shaped like an
 * exit, not an entrance, and defaulting it "in" anchors the window to the
 * clip's start the way `enter()` does instead of hugging the end the way a
 * fade-out needs. Unanimous across every curve, numeric values only —
 * anything else (a glyph.* style-track curve, a curve with fewer than two
 * keyframes) falls through to the safe "in" default.
 */
function isExitShapedCurves(curves) {
  if (curves.length === 0) return false;
  return curves.every((curve) => {
    const kfs = curve.keyframes;
    if (!kfs || kfs.length < 2) return false;
    const first = kfs[0].value;
    const last = kfs[kfs.length - 1].value;
    if (typeof first !== "number" || typeof last !== "number") return false;
    const rest = restOf(curve.property);
    return Math.abs(last - rest) > Math.abs(first - rest);
  });
}

/** `el.react()`'s default `[quiet, loud]` when the caller gives no `range`. */
const REACT_DEFAULT_RANGE = { scale: [1, 1.15], opacity: [0.55, 1], offsetX: [0, 24], offsetY: [0, 24] };

function keyframesFor(spec) {
  // spec is [from, to] or [from, to, easing] (a cv-style pair), or a list of
  // [t, value] / [t, value, easing] tuples across the animation's own window.
  if (Array.isArray(spec[0])) {
    return spec.map(([t, value, easing]) => (easing ? { t, value, easing: ease(easing) } : { t, value }));
  }
  const [a, b, easing] = spec;
  return [{ t: 0, value: a }, { t: 1, value: b, easing: ease(easing ?? "outExpo") }];
}

const FIELDS = ["shapeStyle", "textStyle", "effects", "animations", "opacity", "blendMode", "layout", "flexItem", "repeater", "motionBlur",
  "temporalEcho", "mask", "matte", "crop", "borderRadius", "currentAssetId", "caption", "transitionIn", "animationLinks", "steppedTime",
  "inPointMs", "outPointMs", "volumeDb", "fadeInMs", "fadeOutMs", "fadeInShape", "fadeOutShape", "speedMultiplier", "speedBaked", "timeRemap", "muted"];

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * `component(name, {props, duration}, (s, props) => {...})` — a reusable
 * scene piece, used with `s.use(Comp, {...props}, {at, dur})`. The type/
 * default checking lives in `./components.js`; this wrapper adds
 * `Comp.saveAsComposition(timelines, {width, height, fps, palette, fonts,
 * name, description})`, which needs `video()` (defined below, but hoisted)
 * to build the throwaway documents it probes.
 */
export function component(name, spec, build) {
  const Comp = makeComponentDescriptor(name, spec, build);
  Comp.saveAsComposition = (timelines, o = {}) => saveComponentAsComposition(Comp, timelines, o);
  return Comp;
}

/**
 * Builds `Comp` once inside a throwaway `video()`/`scene()` (its own fresh id
 * sequence), folds its clips into a group via `s.use()`, and returns that
 * group's direct children — the same set `save_composition`'s server-side
 * extraction will see, since a composition captures only a group's direct
 * children (nested `stack`/`row` grandchildren are not captured — a
 * component built for `saveAsComposition` should stay flat).
 */
/**
 * Every clip transitively parented under `rootId` — a nested flex container
 * (`s.stack`/`s.row`) inside the component names *it*, not `rootId`, as
 * `parentId`, so a direct-children-only filter would miss it. Mirrors
 * `descendantIds` in `packages/timeline/src/composition.ts`, which is what
 * `save_composition`'s server-side extraction now walks — matching it here
 * is what lets a prop reaching into a nested container still get a pointer.
 */
function descendantIds(clips, rootId) {
  const found = new Set();
  let frontier = new Set([rootId]);
  while (frontier.size > 0) {
    const next = new Set();
    for (const clip of clips) {
      if (clip.id !== rootId && frontier.has(clip.parentId) && !found.has(clip.id)) {
        found.add(clip.id);
        next.add(clip.id);
      }
    }
    frontier = next;
  }
  return found;
}

function buildComponentProbe(Comp, props, dims) {
  const probe = video(dims);
  let groupId;
  const scene = probe.scene(Comp.name, Comp.duration ?? 2, (s) => {
    groupId = s.use(Comp, props).id;
  });
  const ordered = [...scene.layers].sort((a, b) => a._z - b._z);
  const descendants = descendantIds(ordered, groupId);
  // A JSON round-trip, not a shallow spread: `attachMotion` puts the motion
  // methods (`enter`, `exit`, ...) directly on the clip object as functions,
  // which are never equal between two builds and would swamp the diff below
  // in false positives. The real document a save writes never carries them,
  // so stripping through JSON is also what makes this comparison the same
  // shape `save_composition`'s server-side extraction sees.
  const children = ordered
    .filter((clip) => descendants.has(clip.id))
    .map((clip) => JSON.parse(JSON.stringify(clip)));
  return { probe, scene, groupId, children };
}

/**
 * Save `Comp` as a composition: build it once at its declared prop defaults,
 * save that as a scratch source timeline, then — for every declared prop —
 * rebuild with a marker value distinct from its default and diff the two
 * children arrays to find the one JSON pointer the prop reaches
 * (`pointerForProp`). A prop with no single-field effect (unused, structural,
 * or reaching more than one field) is left out of `params` and named in
 * `skippedParams` rather than guessed. Requires `{width, height, fps}` — the
 * frame `Comp` was authored for — since a bare `component()` descriptor
 * carries none of its own.
 */
async function saveComponentAsComposition(Comp, timelines, o = {}) {
  const { width, height, fps, palette, fonts, name = Comp.name, description } = o;
  if (!timelines) {
    throw new Error(`${Comp.name}.saveAsComposition(timelines, {...}) — pass the script's own nodetool.timelines.`);
  }
  if (!width || !height || !fps) {
    throw new Error(`${Comp.name}.saveAsComposition(): pass {width, height, fps} — the frame this component targets, same as video({...}).`);
  }
  const dims = { width, height, fps, palette, fonts };
  const defaults = defaultComponentProps(Comp);
  const base = buildComponentProbe(Comp, defaults, dims);
  const params = {};
  const skippedParams = [];
  for (const [propName, spec] of Object.entries(Comp.props)) {
    const marker = markerPropValue(spec, defaults[propName]);
    const marked = buildComponentProbe(Comp, { ...defaults, [propName]: marker }, dims);
    const path = pointerForProp(base.children, marked.children, marker);
    if (path === undefined) {
      skippedParams.push(propName);
      continue;
    }
    const param = { type: spec.type, default: spec.default, path };
    if (spec.description !== undefined) param.description = spec.description;
    params[propName] = param;
  }
  base.probe.series([base.scene]);
  const saved = await base.probe.save(timelines, { name: `${name} (component source)` });
  const savedComposition = await timelines.compositions.save(
    saved.timeline_id,
    base.groupId,
    name,
    params,
    description !== undefined ? { description } : undefined
  );
  return { ...savedComposition, source_timeline_id: saved.timeline_id, skippedParams };
}

/**
 * `video({width, height, fps, palette, fonts})` — the entry point. `palette`
 * supplies colours the craft helpers (`backdrop`, `glow`, `kicker`, `pill`,
 * `streaks`, `finish`) fall back to (`ink`, `ink2`, `text`, `dim`, `accent`).
 * `fonts` maps short keys (`display`, `body`) to real font family names; a
 * text element's `font` option takes either a key or a literal family.
 */
export function video({ width, height, fps, palette = {}, fonts = {} } = {}) {
  const W = width, H = height, FPS = fps;
  // Clip/effect/animation ids are deterministic and scoped, not one global
  // counter: a counter shared by the whole script means editing scene B (or
  // even a helper called before scene A in the script) shifts every id after
  // the edit point, including scene A's — which breaks the editor's selection
  // across a rebake and defeats `mergeTimelineSource`'s hash-of-subtree
  // untouched check (a scene whose *content* did not change still hashes
  // differently because its ids moved). Each scope — a scene's own name, or
  // a stable key for a non-scene element — gets its own counter, so an id is
  // `${scope}_${prefix}${n}`: identical for two bakes of the same code, and
  // unaffected by anything outside its own scope.
  const idCounters = new Map();
  const nid = (prefix, scope = "root") => {
    const n = (idCounters.get(scope) ?? 0) + 1;
    idCounters.set(scope, n);
    return `${scope}_${prefix}${n}`;
  };
  /** The id scope for an element built inside a scene: that scene's own name. */
  const sceneScope = (ctx) => (ctx && ctx.scene && ctx.scene.name ? String(ctx.scene.name) : "root");
  /** Snap a second value to the frame grid and convert to ms. */
  const msFor = (sec) => Math.round(Math.round((sec ?? 0) * FPS) * 1000 / FPS);

  const v = { width: W, height: H, fps: FPS };
  /** `el.react()` calls waiting for `v.save()` to bake them onto the saved document. */
  v._pendingReacts = [];

  // -------------------------------------------------------------------------
  // Elements: plain clip objects with motion methods attached.

  /**
   * Fill an effect list's bookkeeping — `id` and `enabled: true` — the
   * document schema requires but an author has no reason to hand-write.
   * A value already present (an explicit `id`, `enabled: false` to author a
   * disabled effect) is kept as authored.
   */
  function fillEffects(effects, scope) {
    return effects?.map((fx) => ({ ...fx, id: fx.id ?? nid("fx", scope), enabled: fx.enabled ?? true }));
  }

  function makeClip(mediaType, ctx, o) {
    const at = o.at ?? 0;
    const dur = o.dur ?? (ctx.durationSec - at);
    const startMs = ctx.startMs + msFor(at);
    const durationMs = Math.max(1, msFor(dur));
    const scope = sceneScope(ctx);
    const clip = {
      id: o.id ?? nid(mediaType[0], scope), name: o.name ?? mediaType, startMs, durationMs,
      mediaType, sourceType: "imported", status: "generated", locked: false, versions: [],
      parentId: o.parent ?? ctx.scene.id,
      // Private authoring-time bookkeeping (stripped in v.series(), same as
      // _pathPoints/_staggerAt/_lastStagger): the scope this clip's own id,
      // effect ids and animation ids were minted under, so a motion method
      // attached below (which only ever sees `clip`, not `ctx`) can keep
      // minting into the same scope.
      _scope: scope
    };
    if (mediaType !== "adjustment") {
      // `rotation` (degrees, the author-facing unit everywhere else in this
      // API) and `anchor` ({x, y} pivot fraction, default {0.5, 0.5}) are
      // convenience options for the two `transform` fields callers reach for
      // most; `tx` remains the raw escape hatch for the rest (rotationX/Y,
      // perspective, depthPx, …). An explicit `o.transform` wins outright.
      const extra = { ...(o.tx ?? {}) };
      if (o.rotation !== undefined) extra.rotation = rad(o.rotation);
      if (o.anchor !== undefined) extra.anchor = o.anchor;
      clip.transform = o.transform ?? tf(o.x ?? 0, o.y ?? 0, o.s ?? 1, extra);
    }
    for (const k of FIELDS) if (o[k] !== undefined) clip[k] = o[k];
    if (clip.effects) clip.effects = fillEffects(clip.effects, scope);
    // `absolute: true` is sugar for the flex item shape a background plate
    // (a pill's fill, a card's backdrop) needs: taken out of flow, sized to
    // its flex-parent's own computed box. `inset` (default 0, fully covering)
    // takes the same px/edges shape as everywhere else. Only meaningful when
    // this clip's `parentId` is itself a flex container.
    if (o.absolute) clip.flexItem = { ...(clip.flexItem ?? {}), position: "absolute", inset: o.inset ?? 0 };
    clip._z = ctx.scene.layers.length;
    ctx.scene.layers.push(clip);
    attachMotion(clip);
    return clip;
  }

  function tf(x = 0, y = 0, s = 1, extra = {}) {
    return { position: { x, y }, scale: { x: s, y: s }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, ...extra };
  }

  /**
   * SVG path data for points in px from the frame centre, normalized to the
   * frame. Most commands (`M`/`L`/`T`/`C`/`S`/`Q`) are pure x,y pairs and
   * normalize by alternating X/Y; `H`/`V` take one coordinate on their own
   * axis, and `A rx ry xRotDeg largeArc sweep x y` mixes two radii (scaled as
   * sizes, by W and H respectively), an angle and two flags (passed through
   * unscaled) with a trailing point. Lives at this scope (not inside
   * `makeSceneApi`) so `el.morph()`, which builds a `d` string outside any
   * scene's own closure, can call it too.
   */
  function pathDataFor(points) {
    const X = (val) => ((W / 2 + val) / W).toFixed(5);
    const Y = (val) => ((H / 2 + val) / H).toFixed(5);
    const RX = (val) => (val / W).toFixed(5);
    const RY = (val) => (val / H).toFixed(5);
    return points.map(([cmd, ...args]) => {
      if (cmd === "Z" || cmd === "z") return cmd;
      if (cmd === "H" || cmd === "h") return cmd + X(args[0]);
      if (cmd === "V" || cmd === "v") return cmd + Y(args[0]);
      if (cmd === "A" || cmd === "a") {
        const [rx, ry, xRotDeg, largeArc, sweep, x, y] = args;
        return cmd + [RX(rx), RY(ry), xRotDeg, largeArc, sweep, X(x), Y(y)].join(" ");
      }
      return cmd + args.map((val, i) => (i % 2 ? Y(val) : X(val))).join(" ");
    }).join(" ");
  }

  function pushAnim(clip, partial) {
    clip.animations = [...(clip.animations ?? []), { id: nid("a", clip._scope), ...partial }];
    return clip;
  }

  /**
   * Attach the motion primitives to a clip in place. `at`/`dur` on every
   * primitive are seconds local to the clip's own start (frame `0` is the
   * moment the clip appears) unless `stagger()` set a default `at` for it.
   */
  function attachMotion(clip) {
    clip.enter = (o = {}) => {
      const { from, at = clip._staggerAt ?? 0, dur = 0.3, ease: e = "outExpo", by, staggerMs, mask } = o;
      const curves = Object.entries(from).map(([prop, val]) => ({ property: prop, ...curvePair(val, restOf(prop), e) }));
      const stagger = staggerOpt(by, staggerMs);
      // Remembered so a `tween()` authored alongside this `enter()` — the
      // common case for a glyph.* style track riding the same reveal — picks
      // up the same per-character/word/line split without repeating `by`.
      if (stagger.stagger) clip._lastStagger = stagger.stagger;
      pushAnim(clip, { role: "in", delayMs: msFor(at), durationMs: msFor(dur), preset: "custom", custom: { curves, ...maskOpt(mask) }, ...stagger });
      return clip;
    };
    clip.exit = (o = {}) => {
      const { to, dur = 0.3, ease: e = "inExpo" } = o;
      const at = o.at ?? Math.max(0, clip.durationMs / 1000 - dur);
      const curves = Object.entries(to).map(([prop, val]) => ({ property: prop, ...curvePair(restOf(prop), val, e) }));
      // The compiler places an "out" role's window by counting `delayMs` back
      // from the clip's own end (windowEndMs = clipDurationMs - delayMs), not
      // forward from the start like every other role. `at`/`dur` here are
      // authored the same way as everywhere else in this API — seconds from
      // the clip's own start — so convert to that end-relative offset here,
      // once, rather than asking every caller to do the arithmetic.
      const windowEndMs = msFor(at + dur);
      const delayMs = Math.max(0, clip.durationMs - windowEndMs);
      pushAnim(clip, { role: "out", delayMs, durationMs: msFor(dur), preset: "custom", custom: { curves } });
      return clip;
    };
    clip.animate = (props, o = {}) => {
      const { at = clip._staggerAt ?? 0, dur = 0.3, ease: e = "outExpo", by, staggerMs, mask } = o;
      const curves = Object.entries(props).map(([prop, spec]) => ({ property: prop, keyframes: keyframesFor(withEase(spec, e)) }));
      // "in" unless the caller named a role: an unnamed role that looks like
      // an exit (see isExitShapedCurves) gets "out" instead, so its window
      // anchors to the clip's end the way exit() already does.
      const role = o.role ?? (isExitShapedCurves(curves) ? "out" : "in");
      const stagger = staggerOpt(by, staggerMs);
      if (stagger.stagger) clip._lastStagger = stagger.stagger;
      pushAnim(clip, { role, delayMs: msFor(at), durationMs: msFor(dur), preset: "custom", custom: { curves, ...maskOpt(mask) }, ...stagger });
      return clip;
    };
    clip.loop = (props, period, o = {}) => {
      const { ease: e = "linear" } = o;
      const curves = Object.entries(props).map(([prop, spec]) => ({ property: prop, keyframes: keyframesFor(withEase(spec, e)) }));
      pushAnim(clip, { role: "loop", delayMs: 0, durationMs: msFor(period), preset: "custom", custom: { curves } });
      return clip;
    };
    clip.count = (o = {}) => {
      const { from, to, at = clip._staggerAt ?? 0, dur = 1, prefix, suffix, decimals, padTo, groupSeparator, ease: e = "outExpo" } = o;
      // No property curve drives this reveal — it is `textAnimator` alone —
      // so `custom.curves` is empty rather than the `NOOP` 1→1 opacity curve
      // this used to carry. `styleOnly` in `animation/compile.ts` already
      // treats an empty-curves custom animation with a `textAnimator` as
      // valid; a curve that never changes just added dead weight to the
      // document for the compiler to skip.
      pushAnim(clip, { role: "in", delayMs: msFor(at), durationMs: msFor(dur), preset: "custom", custom: { curves: [] }, textAnimator: { kind: "ticker", from, to, prefix, suffix, decimals, padTo, groupSeparator }, easing: ease(e) });
      return clip;
    };
    /** A scramble-in reveal: the ticker sibling, `kind: "scramble"`. */
    clip.scramble = (o = {}) => {
      const { at = clip._staggerAt ?? 0, dur = 0.5, charset, seed, ease: e = "outExpo" } = o;
      pushAnim(clip, { role: "in", delayMs: msFor(at), durationMs: msFor(dur), preset: "custom", custom: { curves: [NOOP] }, textAnimator: { kind: "scramble", charset, seed }, easing: ease(e) });
      return clip;
    };
    clip.tween = (target, keyframes, o = {}) => {
      const { at = clip._staggerAt ?? 0, dur = 0.3, by, staggerMs } = o;
      const kfs = keyframes.map(([t, value, easing]) => (easing ? { t, value, easing: ease(easing) } : { t, value }));
      // A `glyph.*` target (glyph.color, glyph.blurPx, glyph.trackingPx, …)
      // needs a stagger or the document validator refuses it — the whole
      // point of a per-glyph style track is to ride a per-character/word/line
      // split, not animate as one block. `by` here works the same as on
      // `enter`/`animate`; left unset, a tween authored right after an
      // `enter()`/`animate()` call on this same clip inherits THAT call's
      // stagger, so the common case (a glyph.color tween riding the same
      // by:"character" reveal as its enter) needs no repeated `by`.
      const stagger = by ? staggerOpt(by, staggerMs) : clip._lastStagger ? { stagger: clip._lastStagger } : {};
      pushAnim(clip, { role: "in", delayMs: msFor(at), durationMs: msFor(dur), preset: "custom", custom: { curves: [NOOP] }, styleTracks: [{ target, keyframes: kfs }], ...stagger });
      return clip;
    };
    clip.draw = (o = {}) => clip.enter({ from: { trimEnd: 0 }, at: o.at, dur: o.dur ?? 0.5, ease: o.ease ?? "outExpo", mask: o.mask });
    /**
     * A catalog animation by name — `"pop"`, `"shake"`, `"spin"`, `"float"`,
     * `"rotate"`, `"hueShift"`, `"kenBurns"`, `"pulse"`, `"bounce"`,
     * `"squash"`, `"breathe"`, `"orbit"`, `"followPath"`, `"wipe"`, `"blur"`,
     * `"colorFade"`, `"flash"`, `"slide"`, `"fade"`, `"typewriter"` — every
     * preset the document's animation compiler knows, baked server-side from
     * its own curve generator rather than hand-authored keyframes here. `o`'s
     * own named fields (`at`, `dur`, `ease`, `role`, `by`, `staggerMs`)
     * control the animation window; every other key in `o` is a preset
     * param, passed through as-is (read a preset's `PresetParamSpec[]` in
     * `packages/timeline/src/animation/presets.ts` for its names and
     * defaults).
     */
    clip.preset = (name, o = {}) => {
      const { at = clip._staggerAt ?? 0, dur = 0.5, ease: e, role = "in", by, staggerMs, ...params } = o;
      pushAnim(clip, {
        role, preset: name, delayMs: msFor(at), durationMs: msFor(dur),
        ...(e !== undefined ? { easing: ease(e) } : {}),
        ...(Object.keys(params).length ? { params } : {}),
        ...staggerOpt(by, staggerMs)
      });
      return clip;
    };
    /**
     * A typewriter reveal: `set_timeline_document` resolves `dur` to one
     * reveal per character. Replaces the clip's animations — a typewriter is
     * the whole entrance, not one animation among others. `o.caret`:
     * `{color, widthPx, blinkPeriodMs}`.
     */
    clip.typewriter = (o = {}) => {
      const { at = 0, dur = 1, caret } = o;
      clip.animations = [{ id: nid("a", clip._scope), role: "in", preset: "typewriter", delayMs: msFor(at), durationMs: msFor(dur), ...(caret ? { caret } : {}) }];
      return clip;
    };
    /**
     * A hand-written motion function, baked to a keyframe-per-frame custom
     * animation at authoring time — nothing runs at render time (per
     * docs/timeline-custom-animations.md). `fn(t, {p, frame, fps})` is
     * sampled once per frame across the window: `t` is seconds local to the
     * window, `p` its 0..1 progress. `fn` returns an object of animatable
     * properties (`opacity`, `offsetX`, `scale`, …) and/or style-track
     * targets (any key with a `.`, e.g. `"text.color"`, `"shape.fill"`).
     * A property whose samples never change emits no curve at all; a curve
     * that does change is reduced to the fewest keyframes a straight-line
     * interpolation still reproduces within a small tolerance, not one
     * keyframe per frame.
     */
    clip.expr = (fn, o = {}) => {
      const { at = clip._staggerAt ?? 0, dur = clip.durationMs / 1000, role = "in" } = o;
      const frameCount = Math.max(1, Math.round(dur * FPS));
      const samples = [];
      for (let i = 0; i <= frameCount; i++) {
        const p = i / frameCount;
        samples.push({ p, values: fn(p * dur, { p, frame: i, fps: FPS }) ?? {} });
      }
      const keys = Object.keys(samples[0].values);
      const curves = [];
      const styleTracks = [];
      for (const key of keys) {
        const pts = samples.map((s) => ({ t: s.p, v: s.values[key] }));
        if (key.includes(".")) {
          const kept = reduceConstantRuns(pts);
          if (kept.length > 1 || kept[0].v !== pts[0].v) styleTracks.push({ target: key, keyframes: kept.map((pt) => ({ t: pt.t, value: pt.v })) });
          continue;
        }
        if (pts.every((pt) => Math.abs(pt.v - pts[0].v) < 1e-6)) continue; // constant — no curve
        const kept = reduceLinearKeyframes(pts, 1e-4);
        curves.push({ property: key, keyframes: kept.map((pt) => ({ t: pt.t, value: pt.v })) });
      }
      if (curves.length === 0 && styleTracks.length === 0) return clip; // fn produced no motion
      pushAnim(clip, {
        role, delayMs: msFor(at), durationMs: msFor(dur), preset: "custom",
        custom: { curves: curves.length ? curves : [NOOP] },
        ...(styleTracks.length ? { styleTracks } : {})
      });
      return clip;
    };
    /**
     * Morphs a path shape's outline toward `toPoints` (the same point
     * commands `s.path()` takes) via a `shape.d` style track. Only straight
     * segments (`M`/`L`) morph — the document's morph only interpolates when
     * both paths share the same command sequence and token count
     * (`morphCompatiblePath`, and it refuses arcs outright), so both the
     * clip's own current outline and the target are resampled to the same
     * vertex count by even arc length, and the clip's own `shapeStyle.d` is
     * rewritten to that resampled start shape so the morph's first frame
     * matches what was already authored. A curved (`C`/`A`/…) path throws —
     * approximate it with enough `L` segments first.
     */
    clip.morph = (toPoints, o = {}) => {
      const { at = clip._staggerAt ?? 0, dur = 0.4, ease: e = "outExpo" } = o;
      if (!clip._pathPoints) throw new Error("morph(): the clip must be created with s.path(points, o) — its own points are what gets resampled toward the target");
      for (const points of [clip._pathPoints, toPoints]) {
        if (points.some(([cmd]) => !["M", "L", "Z", "z"].includes(cmd))) {
          throw new Error(`morph(): only straight (M/L/Z) paths morph; approximate curves with more L segments first (got "${points.find(([cmd]) => !["M", "L", "Z", "z"].includes(cmd))?.[0]}")`);
        }
      }
      const from = polylineFromPoints(clip._pathPoints);
      const to = polylineFromPoints(toPoints);
      if (from.verts.length < 2 || to.verts.length < 2) throw new Error("morph(): both shapes need at least two points");
      const n = Math.max(from.verts.length, to.verts.length, 3);
      const closed = from.closed || to.closed;
      const fromD = pathDataFor(verticesToPoints(resamplePolyline(from.verts, closed, n), closed));
      const toD = pathDataFor(verticesToPoints(resamplePolyline(to.verts, closed, n), closed));
      clip.shapeStyle.d = fromD;
      clip.tween("shape.d", [[0, fromD], [1, toD, e]], { at, dur });
      return clip;
    };
    /**
     * Drive `prop` from a piece of audio — no per-frame JS. Records the
     * request; `v.save()` bakes it onto this clip right after the document
     * is written, through `bake_audio_animation` (the same op
     * `nodetool.timelines.bakeAudioAnimation` exposes directly), additive
     * with anything hand-keyframed on the same property. `audioClip` is the
     * clip `s.audio()`/`v.audio()` returned — its `.id` must be in the saved
     * document, which is why this only takes effect at save time, not now.
     *
     * `o`: `prop` (`"scale"|"opacity"|"offsetX"|"offsetY"`), `mode`
     * (`"envelope"` follows loudness continuously, `"beats"` pulses on each
     * onset; default `"envelope"`), `range` (`[quiet, loud]`, defaulted per
     * `prop`), `gain` (sensitivity: higher reaches the loud end of `range`
     * at a quieter level), `smooth` (seconds, sets both `attack`/`release`),
     * `attack`/`release` (seconds), `offset` (seconds, shifts the whole
     * curve along the timeline), `replace` (default true — overwrite an
     * earlier bake on this property rather than stack another one).
     *
     * **No frequency band.** `bake_audio_animation` measures the full mix
     * (`envelope`) or its onsets (`beats`); there is no band-pass filter
     * behind it. `o.band` throws rather than silently reacting to the whole
     * mix under a name that promises otherwise — isolate that range in the
     * source audio first if the cut needs it.
     */
    clip.react = (audioClip, o = {}) => {
      if (o.band !== undefined) {
        throw new Error(
          `${clip.name || clip.id}.react(): band-pass audio-reactive motion isn't supported — ` +
          'bake_audio_animation only measures the full mix (mode: "envelope") or its onsets ' +
          '(mode: "beats"), never one frequency band. Drop `band`, or isolate that range in the ' +
          "source audio before importing it."
        );
      }
      if (!audioClip || typeof audioClip.id !== "string") {
        throw new Error(`${clip.name || clip.id}.react(): pass the clip s.audio()/v.audio() returned, not an asset id.`);
      }
      const property = o.prop ?? o.property;
      if (!property) throw new Error(`${clip.name || clip.id}.react(): 'prop' is required — scale, opacity, offsetX or offsetY.`);
      const range = o.range ?? REACT_DEFAULT_RANGE[property];
      if (!range) throw new Error(`${clip.name || clip.id}.react(): no default range for "${property}" — pass range: [quiet, loud].`);
      const { mode = "envelope", gain, smooth, attack = smooth, release = smooth, offset = 0, tolerance, maxPoints, frameMs, maxSeconds, replace } = o;
      v._pendingReacts.push({
        audioClipId: audioClip.id,
        targetClipId: clip.id,
        params: {
          property, mode, output_range: range,
          ...(gain !== undefined ? { sensitivity: gain } : {}),
          ...(attack !== undefined ? { attack_ms: msFor(attack) } : {}),
          ...(release !== undefined ? { release_ms: msFor(release) } : {}),
          offset_ms: msFor(offset),
          ...(tolerance !== undefined ? { tolerance } : {}),
          ...(maxPoints !== undefined ? { max_points: maxPoints } : {}),
          ...(frameMs !== undefined ? { frame_ms: frameMs } : {}),
          ...(maxSeconds !== undefined ? { max_seconds: maxSeconds } : {}),
          ...(replace !== undefined ? { replace } : {})
        }
      });
      return clip;
    };
  }

  function curvePair(from, to, easing) { return { keyframes: [{ t: 0, value: from }, { t: 1, value: to, easing: ease(easing) }] }; }
  function withEase(spec, defaultEase) {
    if (Array.isArray(spec[0])) return spec.map((tuple) => (tuple.length === 3 ? tuple : [...tuple]));
    const [a, b, e] = spec;
    return [a, b, e ?? defaultEase];
  }
  function staggerOpt(by, staggerMs) { return by ? { stagger: { unit: by, offsetMs: staggerMs ?? 90 } } : {}; }
  /** `mask: {direction, softness}` — required by the document whenever a curve drives `wipeProgress`. */
  function maskOpt(mask) { return mask ? { mask } : {}; }

  /** A curve that changes nothing, for an animation that only carries a text animator or a style track. */
  const NOOP = { property: "opacity", keyframes: [{ t: 0, value: 1 }, { t: 1, value: 1, easing: "linear" }] };

  /**
   * Offset each item's default motion `at` by its index times `offsetSec`,
   * then call `fn(item, index)`. `fn` calling `.enter()`/`.animate()`/`.count()`
   * with no explicit `at` picks up that offset.
   */
  function stagger(items, offsetSec, fn) {
    items.forEach((item, i) => {
      item._staggerAt = i * offsetSec;
      fn(item, i);
    });
  }

  // -------------------------------------------------------------------------
  // Layout containers.

  function reparent(el, parentId) { el.parentId = parentId; return el; }

  function group(ctx, o = {}) {
    return makeClip("group", ctx, o);
  }

  /** Named anchor points, `{x, y}` fractions of the container's own computed box. */
  const ANCHOR_NAMES = {
    "top-left": { x: 0, y: 0 }, top: { x: 0.5, y: 0 }, "top-right": { x: 1, y: 0 },
    left: { x: 0, y: 0.5 }, center: { x: 0.5, y: 0.5 }, right: { x: 1, y: 0.5 },
    "bottom-left": { x: 0, y: 1 }, bottom: { x: 0.5, y: 1 }, "bottom-right": { x: 1, y: 1 }
  };
  function resolveAnchor(anchor) {
    if (anchor === undefined) return { x: 0.5, y: 0.5 };
    if (typeof anchor !== "string") return anchor;
    const named = ANCHOR_NAMES[anchor];
    if (!named) throw new Error(`anchor: unknown name ${JSON.stringify(anchor)} — pass {x, y} (0..1) or one of ${Object.keys(ANCHOR_NAMES).join(", ")}.`);
    return named;
  }
  const JUSTIFY_NAMES = { start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around", evenly: "space-evenly" };
  const ALIGN_NAMES = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "baseline" };

  /**
   * `direction` `"row"` | `"column"`. A real CSS/Yoga flex container: its
   * `children` become its REAL children (`parentId`), laid out by the
   * document's own flex resolver — nothing here computes a position. The
   * container's own placement in the frame is `at` (default the frame
   * centre) + `anchor` (default `"center"`): `at` is canvas-centre-relative,
   * the same coordinate space every clip's own position already is (0,0 is
   * frame centre; negative x is left of centre, negative y is above it).
   * `anchor` names the point of the container's *computed* box that lands
   * at `at` — so `anchor: "left"` with `at: {x: -860, y: -212}` puts that
   * box's left edge near the left of a 1920-wide frame (-860 = 960px left
   * of centre), not near `x: 110`, which sits just right of centre. No
   * measuring a sibling's width required either way. `align` (default
   * `"start"`, not CSS's own `"stretch"` default — stretching a text child to
   * a sibling's width is rarely what an author wants) is the cross axis:
   * `alignItems`. `justify` is the main axis: `justifyContent`.
   */
  function container(ctx, direction, children, o = {}) {
    const at = o.at ?? { x: 0, y: 0 };
    const anchor = resolveAnchor(o.anchor);
    const align = o.align ?? "start";
    if (!(align in ALIGN_NAMES)) throw new Error(`${direction === "column" ? "stack" : "row"}(): align must be one of ${Object.keys(ALIGN_NAMES).join(", ")}, not ${JSON.stringify(align)}.`);
    const layout = { display: "flex", flexDirection: direction, alignItems: ALIGN_NAMES[align] };
    if (o.justify !== undefined) {
      if (!(o.justify in JUSTIFY_NAMES)) throw new Error(`${direction === "column" ? "stack" : "row"}(): justify must be one of ${Object.keys(JUSTIFY_NAMES).join(", ")}, not ${JSON.stringify(o.justify)}.`);
      layout.justifyContent = JUSTIFY_NAMES[o.justify];
    }
    if (o.gap !== undefined) layout.gap = o.gap;
    if (o.padding !== undefined) layout.padding = o.padding;
    if (o.width !== undefined) layout.width = o.width;
    if (o.height !== undefined) layout.height = o.height;
    if (o.wrap) layout.flexWrap = o.wrap === true ? "wrap" : o.wrap;
    // `at` is the container's frame position (team-lead's call), so its own
    // clip *time* window uses `start`/`dur` instead — the one place in this
    // API "at" doesn't mean seconds. Defaults to the whole enclosing scope,
    // same as every other element.
    const g = group(ctx, { name: o.name ?? direction, parent: o.parent, transform: tf(at.x, at.y, 1, { anchor }), layout, flexItem: o.item, at: o.start, dur: o.dur });
    for (const c of children) reparent(c, g.id);
    return g;
  }

  // -------------------------------------------------------------------------
  // Scene-local API: everything a scene builder function receives.

  function makeSceneApi(ctx) {
    const text = (str, o = {}) => {
      const { size = 48, weight = 500, color = "#ffffff", font, tracking, italic, anchor = "center", mw = 0.9, x = 0, style: styleOverride, path: onPath, ...rest } = o;
      const family = fonts[font] ?? font ?? fonts.body ?? "Inter";
      const style = { text: str, fontFamily: family, fontSizePx: size, fontWeight: weight, color, align: anchor, maxWidthFrac: mw };
      if (tracking !== undefined) {
        if (Math.abs(tracking) > 1) throw new Error(`text "${str}": tracking is in em (a fraction of the font size, e.g. -0.04 or 0.2), not ${tracking}`);
        style.letterSpacingPx = tracking * size;
      }
      if (italic) style.fontStyle = "italic";
      // Text-on-path: the same point commands `path()` takes, in px from the
      // frame centre — converted through the one `pathData` formatter so
      // both draw from the same normalized `d` string.
      if (onPath) style.path = pathData(onPath);
      // Passthrough for every other textStyle field the document supports —
      // lineHeight, verticalAlign, stroke, shadow, background, fill — so
      // nothing needs mutating the clip after creation.
      Object.assign(style, styleOverride ?? {});
      const x0 = anchor === "left" ? x + (mw * W) / 2 : anchor === "right" ? x - (mw * W) / 2 : x;
      return makeClip("text", ctx, { ...rest, x: x0, textStyle: style });
    };
    const rect = (w, h, fill, o = {}) => {
      const shape = { kind: o.kind ?? "rect", x: 0.5 - w / 2 / W, y: 0.5 - h / 2 / H, width: w / W, height: h / H, cornerRadius: (o.r ?? 0) / W };
      if (typeof fill === "string") shape.fill = fill; else if (fill) shape.fillStyle = fill;
      if (o.stroke) { shape.stroke = o.stroke; shape.strokeWidthPx = o.sw ?? 1; }
      Object.assign(shape, o.shape ?? {});
      return makeClip("shape", ctx, { ...o, shapeStyle: shape });
    };
    const ellipse = (d, fill, o = {}) => rect(d, d, fill, { ...o, kind: "ellipse" });
    /**
     * SVG path data for points in px from the frame centre, normalized to the
     * frame. Most commands (`M`/`L`/`T`/`C`/`S`/`Q`) are pure x,y pairs and
     * normalize by alternating X/Y; `H`/`V` take one coordinate on their own
     * axis, and `A rx ry xRotDeg largeArc sweep x y` mixes two radii (scaled
     * as sizes, by W and H respectively), an angle and two flags (passed
     * through unscaled) with a trailing point.
     */
    const pathData = pathDataFor;
    const path = (points, o = {}) => {
      const shape = { kind: "path", d: pathData(points), lineCap: "round", lineJoin: "round" };
      if (o.fill) { if (typeof o.fill === "string") shape.fill = o.fill; else shape.fillStyle = o.fill; }
      if (o.stroke) { shape.stroke = o.stroke; shape.strokeWidthPx = o.sw ?? 4; }
      const clip = makeClip("shape", ctx, { ...o, shapeStyle: shape });
      // Stashed so a later el.morph(toPoints) can resample from this shape's
      // own authored points, not re-parse the normalized `d` string.
      clip._pathPoints = points;
      return clip;
    };
    const image = (assetId, o = {}) => makeClip("image", ctx, { ...o, currentAssetId: assetId });

    /**
     * `media(mediaType, assetId, o)` is the shared body for `video`/`audio`:
     * friendly names for the clip fields that carry a source-media edit —
     * `in` (`inPointMs`), `volume` (`volumeDb`), `fadeIn`/`fadeOut`
     * (`fadeInMs`/`fadeOutMs`), `speed` (`speedMultiplier`), `mute`
     * (`muted`), and `remap` (a `timeRemap`: `[{t, sourceAt, ease?}, …]`,
     * `t` 0..1 across the clip, `sourceAt` seconds into the *source* media —
     * not scene-local time). Every other clip field (`outPointMs`,
     * `speedBaked`, `fadeInShape`/`fadeOutShape`, …) still passes through
     * raw, unmutated after creation.
     */
    function media(mediaType, assetId, o = {}) {
      const { in: inAt, volume, fadeIn, fadeOut, speed, mute, remap, ...rest } = o;
      const clip = { ...rest, currentAssetId: assetId };
      if (inAt !== undefined) clip.inPointMs = msFor(inAt);
      if (volume !== undefined) clip.volumeDb = volume;
      if (fadeIn !== undefined) clip.fadeInMs = msFor(fadeIn);
      if (fadeOut !== undefined) clip.fadeOutMs = msFor(fadeOut);
      if (speed !== undefined) clip.speedMultiplier = speed;
      if (mute !== undefined) clip.muted = mute;
      if (remap) clip.timeRemap = { keyframes: remap.map((k) => (k.ease ? { t: k.t, sourceMs: msFor(k.sourceAt), easing: k.ease } : { t: k.t, sourceMs: msFor(k.sourceAt) })) };
      return makeClip(mediaType, ctx, clip);
    }
    const video = (assetId, o = {}) => media("video", assetId, o);
    const audio = (assetId, o = {}) => media("audio", assetId, o);
    const adjust = (effects, o = {}) => makeClip("adjustment", ctx, { name: "adjust", ...o, effects });
    const fill = (color, o = {}) => rect(W, H, color, { name: "fill", x: 0, y: 0, ...o });

    const stack = (children, o = {}) => container(ctx, "column", children, o);
    const row = (children, o = {}) => container(ctx, "row", children, o);
    const center = (child, o = {}) => { child.transform.position = o.at === "center" || o.at === undefined ? { x: 0, y: 0 } : o.at; return child; };

    /** A nested local clock: elements/motion inside `fn` are local to `atSec` within the enclosing scope. */
    const seq = (atSec, durSec, fn) => {
      const child = { scene: ctx.scene, startMs: ctx.startMs + msFor(atSec), durationMs: msFor(durSec), durationSec: durSec };
      return fn(makeSceneApi(child));
    };

    // -----------------------------------------------------------------------
    // Craft: the recurring structural vocabulary, bound to this scene's
    // palette. Every helper has a default, so `s.backdrop()` alone renders a
    // full bleed. `palette` colours are read fresh from `video()`'s palette.
    const {
      ink = "#06110e", ink2 = "#0c2a21", text: textColor = "#f4fbf8",
      dim = "#8fb3a6", accent = "#34d399"
    } = palette;

    const backdrop = (o = {}) => {
      const { colors = [ink, ink2], opacity = 0.7, seed = 3 } = o;
      const [colorA, colorB] = colors;
      rect(W, H, colorA, { name: "ink" });
      return rect(W, H, colorA, {
        name: "field", opacity,
        effects: [{ id: nid("gf", sceneScope(ctx)), type: "generator", enabled: true, mode: "gradientField", colorA, colorB, scale: 3, animate: true, seed }]
      });
    };

    const glow = (o = {}) => {
      const { size = 1200, alpha = 0.25, color = accent, ...rest } = o;
      const c = (a) => hexToRgba(color, a);
      return ellipse(size, { type: "radial", stops: [{ offset: 0, color: c(alpha) }, { offset: 0.35, color: c(alpha * 0.4) }, { offset: 0.7071, color: c(0) }] }, { name: "glow", ...rest });
    };

    const flash = (o = {}) => {
      const { at = 0, dur = 0.27, peak = 0.7, color = "#ffffff" } = o;
      const c = rect(W, H, color, { name: "flash", at, dur, blendMode: "screen" });
      // Opacity ramps from `peak` to 0 — a fade-out — so it is tagged
      // `role: "out"`. Untagged it defaulted to "in", which happened to
      // render identically only because this window spans the clip's whole
      // duration; a caller widening the flash clip without widening this
      // animation would have kept an "in"-anchored ramp pinned to the start
      // instead of the end it is meant to hug.
      return c.animate({ opacity: [peak, 0] }, { at: 0, dur, ease: "linear", role: "out" });
    };

    const kicker = (str, o = {}) => {
      const { x = 0, y = 0, at = 0, dur = 0.33, size = 28, weight = 600, color = accent, font = "display", parent, ...rest } = o;
      const k = text(str.toUpperCase(), { name: "kicker", anchor: "left", mw: 0.4, x, y, size, weight, color, font, tracking: 5 / size, parent, ...rest });
      k.animate({ wipeProgress: [0, 1], opacity: [0, 1] }, { at, dur, ease: "outExpo", mask: { direction: "left", softness: 0.05 } });
      return k;
    };

    /** A pill: a flex row (optional leading dot + label) over an absolute, inset-0 background plate created first so it draws behind. */
    const pill = (label, o = {}) => {
      const {
        size = 28, weight = 600, color = textColor, fillColor = ink2, stroke = "rgba(255,255,255,0.14)",
        dot, shadow, padX, padY, name = "pill", x = 0, y = 0, anchor, at, dur, font = "display", parent
      } = o;
      const plate = rect(10, 10, fillColor, {
        name: `${name}-bg`, stroke, r: size * 1.1, at, dur, absolute: true,
        effects: shadow ? [{ id: nid("sh", sceneScope(ctx)), type: "dropShadow", enabled: true, offsetX: 0, offsetY: 12, blur: 30, color: "rgba(0,0,0,0.4)" }] : undefined
      });
      const kids = [];
      if (dot) kids.push(ellipse(size * 0.5, dot, { name: `${name}-dot`, at, dur }));
      kids.push(text(label, { name: `${name}-label`, at, dur, font, size, weight, color, mw: 1 }));
      const g = row(kids, {
        name, parent, at: { x, y }, anchor, start: at, dur, align: "center", gap: size * 0.4,
        padding: { top: padY ?? size * 0.55, bottom: padY ?? size * 0.55, left: padX ?? size * 1.4, right: padX ?? size * 1.4 }
      });
      reparent(plate, g.id);
      return g;
    };

    const streaks = (o = {}) => {
      const { count = 3, colors = [accent], name = "streaks", rotationDeg = -8, opacity = 0.9 } = o;
      const g = group(ctx, { name, opacity, transform: tf(0, 0, 1, { rotation: rad(rotationDeg) }) });
      for (let i = 0; i < count; i++) {
        const width = 260 + i * 180, barH = 3 + i * 2.5, color = colors[i % colors.length];
        const copies = Math.max(4, 14 - i * 4), dy = 84 + i * 34;
        const cycleSec = Math.max(8, 34 - i * 9) / 30; // seconds; the reference authored these as frames at 30fps
        const cycleMs = msFor(cycleSec);
        const c = rect(width, barH, color, {
          name: `streak-${i}`, parent: g.id, r: barH / 2, opacity: Math.min(1, 0.8 + i * 0.05), y: -H / 2 - dy,
          repeater: { count: copies, positionStep: { x: 0, y: dy }, timeStepMs: Math.round((cycleMs / copies) * 3.7) % cycleMs },
          motionBlur: { samplesPerFrame: 6, shutterAngle: 240 }
        });
        const drift = hash(i + 1) * 400;
        c.loop({ offsetX: [[0, W * 0.8 + drift], [1, -W * 0.8 + drift]] }, cycleSec, { ease: "linear" });
      }
      return g;
    };

    const finish = (o = {}) => {
      const { vignette = 0.25, softness = 0.7, grain: grainAmt = 0.04, seed = 1, saturation = 1, contrast = 1, ...rest } = o;
      const effects = [
        { id: nid("vig", sceneScope(ctx)), type: "vignette", enabled: true, amount: vignette, softness },
        { id: nid("grain", sceneScope(ctx)), type: "grain", enabled: true, amount: grainAmt, animate: true, seed }
      ];
      if (saturation !== 1 || contrast !== 1) effects.push({ id: nid("color", sceneScope(ctx)), type: "color", enabled: true, saturation, contrast });
      return adjust(effects, { name: "finish", ...rest });
    };

    /**
     * Instantiate a `component()` descriptor: fold its build's clips into one
     * group, reparented the way `pill()` folds its own dot+label+plate —
     * anything the build left parented to this enclosing scope becomes a
     * direct child of the returned group; anything the build itself
     * reparented deeper (its own `stack`/`row`) stays there. `propsIn` is
     * checked and defaulted against `Comp.props`, throwing and naming the
     * offending prop. `o.at`/`o.dur` place the group in this scope's own
     * local time (seconds), defaulting to `Comp.duration` then the whole
     * enclosing scope, same as every other element.
     */
    const use = (Comp, propsIn = {}, o = {}) => {
      if (!Comp || Comp.__component !== true) {
        throw new Error("use(): expected a component() descriptor as the first argument.");
      }
      const resolved = resolveComponentProps(Comp, propsIn);
      const at = o.at ?? 0;
      const dur = o.dur ?? Comp.duration ?? (ctx.durationSec - at);
      const g = group(ctx, { name: o.name ?? Comp.name, parent: o.parent, x: o.x ?? 0, y: o.y ?? 0, at, dur });
      const before = ctx.scene.layers.length;
      const childCtx = { scene: ctx.scene, startMs: ctx.startMs + msFor(at), durationMs: g.durationMs, durationSec: dur };
      Comp.build(makeSceneApi(childCtx), resolved);
      for (let i = before; i < ctx.scene.layers.length; i++) {
        const clip = ctx.scene.layers[i];
        if (clip.id !== g.id && clip.parentId === ctx.scene.id) reparent(clip, g.id);
      }
      return g;
    };

    const s = { text, rect, ellipse, path, image, video, audio, group: (o) => group(ctx, o), adjust, fill, stack, row, center, seq, stagger, backdrop, glow, flash, kicker, pill, streaks, finish, noise, use };
    // Charts are pure functions over this same `s` (packages/sandbox-packs/
    // sandbox-timeline/sandbox/charts.js) — wiring them here just binds them
    // to this scene's own `s` and palette defaults, which a caller's own `o`
    // still overrides.
    s.barChart = (data, o = {}) => barChart(s, data, { color: accent, dim, ...o });
    s.lineChart = (series, o = {}) => lineChart(s, series, { color: accent, ...o });
    s.areaChart = (series, o = {}) => areaChart(s, series, { color: accent, ...o });
    s.donut = (data, o = {}) => donut(s, data, { color: accent, ...o });
    s.statCounter = (value, o = {}) => statCounter(s, value, { color: textColor, ...o });
    return s;
  }

  // -------------------------------------------------------------------------
  // Scenes and series.

  /** One scene: its own local clock from 0. `fn(s)` builds its content. */
  v.scene = (name, durationSec, fn, extra = {}) => {
    const scene = { name, id: name, layers: [], durationMs: msFor(durationSec), durationSec, extra };
    const ctx = { scene, startMs: 0, durationMs: scene.durationMs, durationSec };
    fn(makeSceneApi(ctx));
    scene.group = {
      id: name, name, trackId: "t_scenes", startMs: 0, durationMs: scene.durationMs,
      mediaType: "group", sourceType: "imported", status: "generated", locked: false, versions: [],
      transform: tf(), sourceScene: name, ...extra
    };
    return scene;
  };

  /** A transition item for `series()`: goes between the two scenes it joins. */
  v.transition = (type, durationSec, opts = {}) => ({ __transition: true, type, durationMs: msFor(durationSec), opts });

  /**
   * Lay scenes end to end. A transition item between two scenes overlaps them
   * by its own duration and sets `transitionIn` on the incoming scene's group;
   * omitting one between a pair makes a hard cut. Scenes are banked onto two
   * alternating track sets so an overlapping pair never shares a track.
   */
  v.series = (items) => {
    const scenes = [];
    let cursorMs = 0;
    let pending = null;
    for (const item of items) {
      if (item && item.__transition) { pending = item; continue; }
      const scene = item;
      const overlapMs = pending ? pending.durationMs : 0;
      const absStart = cursorMs - overlapMs;
      if (pending) {
        scene.group.transitionIn = { type: pending.type, durationMs: pending.durationMs, ...pending.opts };
      }
      for (const clip of scene.layers) clip.startMs += absStart;
      scene.group.startMs = absStart;
      cursorMs = absStart + scene.durationMs;
      scene.bank = scenes.length % 2 === 0 ? "A" : "B";
      scenes.push(scene);
      pending = null;
    }

    const banks = ["A", "B"];
    const tracks = [];
    const clips = [];
    let offset = 0;
    for (const bank of banks) {
      const inBank = scenes.filter((s) => s.bank === bank);
      const size = Math.max(0, ...inBank.map((s) => s.layers.length));
      for (let i = 0; i < size; i++) tracks.push({ id: `t_${bank}${i}`, name: `${bank}${i}`, type: "video", index: offset + i, visible: true, locked: false });
      for (const s of inBank) {
        [...s.layers].sort((a, b) => a._z - b._z).forEach((clip, i) => {
          clip.trackId = `t_${bank}${size - 1 - i}`;
          delete clip._z;
          // Private authoring-time bookkeeping, not a document field: morph()
          // reads `_pathPoints` back off its own clip, stagger() sets
          // `_staggerAt` as a default `at` for later motion calls,
          // enter()/animate() remember `_lastStagger` so a co-authored
          // tween() can inherit it, and `_scope` is the id scope a motion
          // method mints new effect/animation ids into. Left on, any of
          // these shows up as a `field_stripped` warning on the next schema
          // round trip.
          delete clip._pathPoints;
          delete clip._staggerAt;
          delete clip._lastStagger;
          delete clip._scope;
          clips.push(clip);
        });
      }
      offset += size;
    }
    for (const s of scenes) clips.push(s.group);

    v._durationMs = cursorMs;
    /** The video's total duration in ms, once `v.series()` has run. */
    v.durationMs = cursorMs;
    v._document = {
      tracks: [{ id: "t_scenes", name: "scenes", type: "video", index: tracks.length, visible: true, locked: false }, ...tracks],
      clips,
      markers: []
    };
    return v;
  };

  /**
   * A top-level timed adjustment layer, in absolute video seconds — for a
   * whole-video finish (grain/vignette across everything) or a short local
   * effect at a cut (a glitch burst spanning both sides of a hard cut). Adds
   * its own track above every scene bank so it always sees the composite.
   */
  v.adjust = (effects, o = {}) => {
    if (!v._document) throw new Error("v.adjust() runs after v.series()");
    const at = o.at ?? 0, dur = o.dur ?? (v._durationMs / 1000 - at);
    const clip = {
      id: o.id ?? nid("adj", `adjust:${o.trackId ?? "t_top"}`), name: o.name ?? "adjust", trackId: o.trackId ?? "t_top",
      startMs: msFor(at), durationMs: Math.max(1, msFor(dur)),
      mediaType: "adjustment", sourceType: "imported", status: "generated", locked: false, versions: [],
      effects: fillEffects(effects, `adjust:${o.trackId ?? "t_top"}`)
    };
    if (o.animations) clip.animations = o.animations;
    attachMotion(clip);
    const trackId = clip.trackId;
    if (!v._document.tracks.some((t) => t.id === trackId)) {
      for (const t of v._document.tracks) t.index += 1;
      v._document.tracks.unshift({ id: trackId, name: trackId, type: "video", index: 0, visible: true, locked: false });
    }
    v._document.clips.push(clip);
    return clip;
  };

  /**
   * A top-level audio clip in absolute video seconds — a score, a countdown,
   * a narration bed spanning (part of) the series. Lands on its own audio
   * track (default `t_audio`) that the author never has to name; two calls
   * with different `trackId`s (or `v.music`, which defaults to `t_music`)
   * land on separate tracks so two beds can overlap in time. Same friendly
   * fields as a scene's `s.audio()`: `volume`, `fadeIn`, `fadeOut`, `mute`.
   */
  v.audio = (assetId, o = {}) => {
    if (!v._document) throw new Error("v.audio()/v.music() run after v.series()");
    const { at = 0, dur, trackId = "t_audio", trackName, volume, fadeIn, fadeOut, mute, ...rest } = o;
    const clip = {
      id: o.id ?? nid("aud", `audio:${trackId}`), name: o.name ?? "audio", trackId,
      startMs: msFor(at), durationMs: Math.max(1, msFor(dur ?? v._durationMs / 1000 - at)),
      mediaType: "audio", sourceType: "imported", status: "generated", locked: false, versions: [],
      currentAssetId: assetId
    };
    for (const k of FIELDS) if (rest[k] !== undefined) clip[k] = rest[k];
    if (volume !== undefined) clip.volumeDb = volume;
    if (fadeIn !== undefined) clip.fadeInMs = msFor(fadeIn);
    if (fadeOut !== undefined) clip.fadeOutMs = msFor(fadeOut);
    if (mute !== undefined) clip.muted = mute;
    if (!v._document.tracks.some((t) => t.id === trackId)) {
      v._document.tracks.push({ id: trackId, name: trackName ?? clip.name, type: "audio", index: v._document.tracks.length, visible: true, locked: false });
    }
    v._document.clips.push(clip);
    return clip;
  };
  /** `v.audio` on its own `t_music` track, so a score and a narration bed never collide. */
  v.music = (assetId, o = {}) => v.audio(assetId, { trackId: "t_music", name: "music", ...o });

  /**
   * A midi clip in absolute video seconds, on its own midi track (creates it
   * the first time `trackId` is seen). `notes` is `[beat, pitch, lenBeats?,
   * velocity?]` tuples — musical time, independent of the clip's own
   * placement, exactly the way a score is written. `o.instrument` is a
   * preset id (`"bl1-acid"`) or a full instrument object; `set_timeline_document`
   * resolves the shorthand. Two calls with different `trackId`s (a drum
   * track, a bass track) never collide.
   */
  v.midi = (trackId, notes, o = {}) => {
    if (!v._document) throw new Error("v.midi() runs after v.series()");
    const { at = 0, dur, instrument, name } = o;
    if (!v._document.tracks.some((t) => t.id === trackId)) {
      v._document.tracks.push({
        id: trackId, name: name ?? trackId, type: "midi", index: v._document.tracks.length, visible: true, locked: false,
        instrument: typeof instrument === "string" ? { preset: instrument } : instrument
      });
    }
    const clip = {
      id: o.id ?? nid("midi", `midi:${trackId}`), name: o.name ?? trackId, trackId,
      startMs: msFor(at), durationMs: Math.max(1, msFor(dur ?? v.durationMs / 1000 - at)),
      mediaType: "midi", sourceType: "imported", status: "generated", locked: false, versions: [],
      notes: midiNotes(notes, (p) => nid(p, `midi:${trackId}:notes`))
    };
    v._document.clips.push(clip);
    return clip;
  };

  /**
   * Sets the document's `tempo` (so midi and beat-driven motion play at
   * `bpm`) and returns edit ops for `v.save`'s `ops`: a marker per beat, then
   * (only when `snap` names clip ids) those clips' starts snapped onto the
   * grid. Pass the result straight through:
   * `v.save(nodetool.timelines, {ops: v.beats({bpm: 120})})`.
   */
  v.beats = ({ bpm, offset = 0, count, snap, timeSignature } = {}) => {
    if (!v._document) throw new Error("v.beats() runs after v.series()");
    v._document.tempo = { bpm, offsetMs: msFor(offset), timeSignature: timeSignature ?? { beatsPerBar: 4, beatUnit: 4 } };
    const beatCount = count ?? Math.floor(((v.durationMs / 1000) - offset) * (bpm / 60));
    // Markers are a plain document field (`v._document.markers` already
    // exists), so they are written directly here — the same grid math
    // `buildBeatGrid`/`set_markers_from_beats` use (`offset + i * interval`,
    // not an accumulated sum, so a fractional interval like 140 BPM's
    // 428.571…ms does not drift) — rather than through an edit op. A code
    // bake is hermetic (no `ops`, see `timeline-code-bake.ts`), so a script
    // that only marks beats — the common case — now bakes clean; only
    // `snap` (which moves existing clips, an edit only `edit_timeline` can
    // do) still needs one.
    const offsetMs = msFor(offset);
    const intervalMs = 60000 / bpm;
    const taken = new Set(v._document.markers.map((m) => m.timeMs));
    for (let i = 0; i < beatCount; i++) {
      const timeMs = Math.round(offsetMs + i * intervalMs);
      if (taken.has(timeMs)) continue;
      taken.add(timeMs);
      v._document.markers.push({ id: nid("marker", "beats"), timeMs, label: `Beat ${i + 1}` });
    }
    // An empty/absent `snap` must only add markers: `snap_to_beats` treats an
    // empty `targets` as "every clip", which would move clips nobody asked to.
    const ops = [];
    if (Array.isArray(snap) && snap.length > 0) {
      ops.push({ op: "snap_to_beats", targets: snap, bpm, offset_ms: offsetMs, mode: "start", action: "move", tolerance_ms: 40 });
    }
    return ops;
  };

  /** Extra top-level document fields (`camera2d`, `trackFolders`, `tempo`) applied verbatim before save. */
  v.document = (fields) => { Object.assign(v._document, fields); return v; };

  /**
   * Create the timeline, write the document, validate (with `tier:
   * "showcase"` when `showcase: true`), and return `{timeline_id, errors,
   * warnings}`. Never throws after create without naming the timeline id.
   */
  v.save = async (timelines, { name, showcase = false, ops = [], timeline_id } = {}) => {
    if (!timelines) throw new Error("v.save(nodetool.timelines, {name}) — pass the script's nodetool.timelines.");
    if (!v._document) throw new Error("v.save() runs after v.series()");
    const document = v._document;
    const preflight = await timelines.validate(document, { normalize: true, fps: FPS, width: W, height: H });
    if (!preflight.ok) throw new Error(`validate_timeline: ${JSON.stringify(preflight.errors, null, 2)}`);

    // Resolve where to write: an explicit timeline_id, else a new timeline.
    // A code-backed timeline's own rebake goes through
    // `nodetool.timelines.code.rebake()`, not through re-running this script
    // by hand — that call bakes the code itself and merges the result, so
    // `v.save()` here needs no id threading of its own.
    let id = timeline_id;
    const created = !id;
    if (created) {
      ({ timeline_id: id } = await timelines.create(name, { fps: FPS, width: W, height: H }));
    }
    try {
      const set = await timelines.setDocument(id, document);
      if (!set.written) throw new Error(`set_timeline_document: ${JSON.stringify(set.validation ?? set.error, null, 2)}`);
      if (ops.length) {
        const edit = await timelines.edit(id, ops);
        if (edit.failed) throw new Error(`edit_timeline: ${JSON.stringify(edit.ops.filter((r) => !r.ok), null, 2)}`);
      }
      // el.react() calls only recorded intent; the audio and target clips
      // are now in the saved document, so this is the first point their ids
      // resolve. Runs before the final validate() so that validation sees
      // the baked curves too.
      for (const react of v._pendingReacts) {
        const bake = await timelines.bakeAudioAnimation(id, react.audioClipId, react.targetClipId, react.params);
        if (!bake || bake.error) {
          throw new Error(`bake_audio_animation (${react.targetClipId} <- ${react.audioClipId}): ${JSON.stringify((bake && bake.error) ?? bake, null, 2)}`);
        }
      }
      const validation = await timelines.validate(id, showcase ? { tier: "showcase" } : undefined);
      if (!validation.ok) throw new Error(`validate_timeline: ${JSON.stringify(validation.errors, null, 2)}`);
      return { timeline_id: id, fps: FPS, width: W, height: H, durationMs: v.durationMs, errors: validation.errors ?? [], warnings: validation.warnings ?? [] };
    } catch (error) {
      throw new Error(`${name} (timeline ${id}): ${error && error.message ? error.message : error}`);
    }
  };

  return v;
}
