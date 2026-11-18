/**
 * Generated sketch and audio tasks, in the style of `../task-families.ts`:
 * each seed draws a different request with its own starting document and
 * exact checks over the document the turn left behind.
 */
import {
  createAudioToolBridge,
  createSketchToolBridge,
  type AudioBridgeFinalState,
  type HeadlessSurfaceBridge,
  type HeadlessTool,
  type SketchBridgeFinalState
} from "@nodetool-ai/agents";
import { AUDIO_EFFECT_SPECS } from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";
import { COLORS, defineFamily, list, type Check, type ErasedFamily, type TaskFamily } from "../task-families.js";

// ---------------------------------------------------------------- sketch

const LAYER_NAMES = [
  "Sky", "Ground", "Trees", "Character", "Shadows", "Highlights",
  "Title", "Logo", "Frame", "Clouds", "Water", "Glow", "Sun", "Hills"
];
const BLEND_MODES = ["multiply", "screen", "overlay", "soft-light", "darken", "lighten", "color-dodge", "difference"];
const CANVAS_SIZES: Array<[number, number]> = [[512, 512], [640, 480], [800, 600], [600, 800], [768, 512]];

interface Pixel {
  color: string;
  alpha: number;
}

/** The sketch's final state plus pixels read at fixed points. */
export interface SketchTaskState extends SketchBridgeFinalState {
  /** Probe key to the pixel there after the last edit; null when the probe's layer is gone. */
  samples: Record<string, Pixel | null>;
}

interface Probe {
  key: string;
  /** Layer name, or null for the composite of every visible layer. */
  layer: string | null;
  x: number;
  y: number;
}

const READ_ONLY_SKETCH_TOOLS = new Set(["ui_sketch_get_state", "ui_sketch_pick_color", "ui_sketch_get_layer_image"]);

/**
 * A sketch bridge whose final state carries pixels. The final state is read
 * synchronously and the editor's eyedropper is a tool, so the probes are read
 * again after every tool call that can change pixels.
 */
async function probedSketchBridge(
  initial: Parameters<typeof createSketchToolBridge>[0],
  probes: Probe[]
): Promise<HeadlessSurfaceBridge<SketchTaskState>> {
  const bridge = await createSketchToolBridge(initial);
  const eyedropper = bridge.tools.find((t) => t.name === "ui_sketch_pick_color");
  if (!eyedropper) throw new Error("the sketch bridge has no ui_sketch_pick_color");
  let samples: Record<string, Pixel | null> = {};
  const sample = async (): Promise<void> => {
    const next: Record<string, Pixel | null> = {};
    for (const probe of probes) {
      try {
        const read = (await eyedropper.execute({ target: probe.layer, x: probe.x, y: probe.y })) as {
          color: string;
          rgba: { a: number };
        };
        next[probe.key] = { color: read.color.toLowerCase(), alpha: read.rgba.a };
      } catch {
        next[probe.key] = null;
      }
    }
    samples = next;
  };
  await sample();
  const tools: HeadlessTool[] = bridge.tools.map((tool) =>
    READ_ONLY_SKETCH_TOOLS.has(tool.name)
      ? tool
      : {
          ...tool,
          execute: async (args) => {
            try {
              return await tool.execute(args);
            } finally {
              await sample();
            }
          }
        }
  );
  return { tools, finalState: () => ({ ...bridge.finalState(), samples }) };
}

const layerNamed = (s: SketchBridgeFinalState, name: string) =>
  s.layers.find((l) => l.name.toLowerCase() === name.toLowerCase());
const isColor = (pixel: Pixel | null | undefined, hex: string) => pixel?.alpha === 255 && pixel.color === hex;

export const SKETCH_COMPOSE: TaskFamily<SketchTaskState> = {
  id: "sketch-compose",
  surface: "sketch",
  make(pick) {
    const [w0, h0] = pick.one(CANVAS_SIZES);
    const resize = pick.chance(0.4) ? pick.one(CANVAS_SIZES.filter(([w, h]) => w !== w0 || h !== h0)) : null;
    const [width, height] = resize ?? [w0, h0];
    const roomW = Math.min(w0, width);
    const roomH = Math.min(h0, height);
    const background = pick.chance(0.5) ? pick.one(COLORS) : null;
    // Shapes never overlap, so each one's centre shows in the picture.
    const shapes: Array<{ name: string; kind: "rect" | "ellipse"; x: number; y: number; w: number; h: number; color: [string, string] }> = [];
    for (const name of pick.some(LAYER_NAMES, pick.int(1, 3))) {
      const w = pick.int(4, 12) * 10;
      const h = pick.int(4, 12) * 10;
      const kind = pick.one(["rect", "ellipse"] as const);
      const color = pick.one(COLORS.filter((c) => c !== background));
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = pick.int(1, Math.floor((roomW - w) / 10) - 1) * 10;
        const y = pick.int(1, Math.floor((roomH - h) / 10) - 1) * 10;
        const clear = shapes.every((o) => x + w + 10 <= o.x || o.x + o.w + 10 <= x || y + h + 10 <= o.y || o.y + o.h + 10 <= y);
        if (clear) {
          shapes.push({ name, kind, x, y, w, h, color });
          break;
        }
      }
    }

    const probes: Probe[] = shapes.flatMap((s) => {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      return [
        { key: `${s.name}:in`, layer: s.name, x: cx, y: cy },
        { key: `${s.name}:out`, layer: s.name, x: s.x - 6, y: cy },
        { key: `${s.name}:top`, layer: null, x: cx, y: cy }
      ];
    });
    if (background) {
      probes.push({ key: "bg:near", layer: null, x: 3, y: 3 }, { key: "bg:far", layer: null, x: width - 3, y: height - 3 });
    }

    const checks: Check<SketchTaskState>[] = [];
    if (resize) checks.push({ name: `canvas is ${width}×${height}`, test: (s) => s.width === width && s.height === height });
    if (background) {
      const hex = background[1];
      checks.push({
        name: `background is ${hex} across the canvas`,
        test: (s) => isColor(s.samples["bg:near"], hex) && isColor(s.samples["bg:far"], hex)
      });
    }
    for (const shape of shapes) {
      const hex = shape.color[1];
      const area = shape.kind === "rect" ? shape.w * shape.h : (Math.PI / 4) * shape.w * shape.h;
      // Anti-aliased edges add about one pixel of partial coverage around the outline.
      const slack = area * 0.03 + shape.w + shape.h;
      checks.push(
        {
          name: `'${shape.name}' holds a ${hex} ${shape.kind} at (${shape.x}, ${shape.y}) sized ${shape.w}×${shape.h}`,
          test: (s) => {
            const layer = layerNamed(s, shape.name);
            return (
              !!layer &&
              Math.abs(layer.paintedPixels - area) <= slack &&
              isColor(s.samples[`${shape.name}:in`], hex) &&
              s.samples[`${shape.name}:out`]?.alpha === 0
            );
          }
        },
        { name: `'${shape.name}' shows in the picture`, test: (s) => isColor(s.samples[`${shape.name}:top`], hex) }
      );
    }

    const describe = (s: (typeof shapes)[number]) =>
      `a layer named '${s.name}' with a filled ${s.color[0]} (${s.color[1]}) ${s.kind === "rect" ? "rectangle" : "ellipse"} ` +
      `whose top-left corner is at x ${s.x}, y ${s.y}, ${s.w} px wide and ${s.h} px tall`;
    const parts: string[] = [];
    if (resize) parts.push(`resize the canvas to ${width}×${height}`);
    if (background) parts.push(`fill the background with ${background[0]} (${background[1]}) so it covers the whole canvas`);
    parts.push(...shapes.map((s) => `add ${describe(s)}`));
    const opener = pick.one(["In this sketch,", "On the canvas,", "For this image,"]);
    const ending = shapes.length > 1 ? " Keep each shape on its own layer, above the background." : "";

    return {
      objective: `${opener} ${list(parts)}.${ending}`,
      createBridge: () => probedSketchBridge({ name: "poster", width: w0, height: h0 }, probes),
      checks,
      solve: async (call) => {
        if (resize) await call("ui_sketch_resize_canvas", { width, height });
        if (background) await call("ui_sketch_fill", { target: "Background", x: 1, y: 1, color: background[1] });
        for (const s of shapes) {
          await call("ui_sketch_add_layer", { name: s.name });
          await call("ui_sketch_draw_shape", { target: s.name, shape: s.kind, x: s.x, y: s.y, width: s.w, height: s.h, fill: s.color[1] });
        }
      }
    };
  }
};

type LayerOp = "rename" | "hide" | "opacity" | "blend" | "delete" | "duplicate" | "fillLayer" | "reorder";

export const SKETCH_LAYERS: TaskFamily<SketchTaskState> = {
  id: "sketch-layers",
  surface: "sketch",
  make(pick) {
    const names = pick.some(LAYER_NAMES, pick.int(3, 5));
    const used = new Set(names);
    const freshName = () => {
      const name = pick.one(LAYER_NAMES.filter((n) => !used.has(n)));
      used.add(name);
      return name;
    };
    let ops = pick.some<LayerOp>(["rename", "hide", "opacity", "blend", "delete", "duplicate", "fillLayer", "reorder"], pick.int(2, 3));
    // "Move it to the top" is ambiguous once the same request adds layers.
    if (ops.includes("reorder")) ops = ops.filter((op) => op !== "duplicate" && op !== "fillLayer");
    const targets = pick.some(names, ops.length);
    const asks: string[] = [];
    const checks: Check<SketchTaskState>[] = [];
    const probes: Probe[] = [];
    const steps: Array<[string, Record<string, unknown>]> = [];
    const touched = new Set<string>();

    ops.forEach((op, i) => {
      const target = targets[i]!;
      if (op !== "fillLayer") touched.add(target);
      if (op === "rename") {
        const next = freshName();
        steps.push(["ui_sketch_set_layer_props", { target, name: next }]);
        asks.push(`rename '${target}' to '${next}'`);
        checks.push({ name: `${target} renamed ${next}`, test: (s) => !!layerNamed(s, next) && !layerNamed(s, target) });
      } else if (op === "hide") {
        steps.push(["ui_sketch_set_layer_props", { target, visible: false }]);
        asks.push(`hide '${target}' without deleting it`);
        checks.push({ name: `${target} hidden`, test: (s) => layerNamed(s, target)?.visible === false });
      } else if (op === "opacity") {
        const opacity = pick.one([0.25, 0.4, 0.5, 0.6, 0.75]);
        steps.push(["ui_sketch_set_layer_props", { target, opacity }]);
        asks.push(`set '${target}' to ${Math.round(opacity * 100)}% opacity`);
        checks.push({ name: `${target} opacity ${opacity}`, test: (s) => Math.abs((layerNamed(s, target)?.opacity ?? -1) - opacity) < 0.01 });
      } else if (op === "blend") {
        const mode = pick.one(BLEND_MODES);
        steps.push(["ui_sketch_set_layer_props", { target, blendMode: mode }]);
        asks.push(`set the blend mode of '${target}' to ${mode}`);
        checks.push({ name: `${target} blends ${mode}`, test: (s) => layerNamed(s, target)?.blendMode === mode });
      } else if (op === "delete") {
        steps.push(["ui_sketch_remove_layer", { target }]);
        asks.push(`delete the '${target}' layer`);
        checks.push({ name: `${target} deleted`, test: (s) => !layerNamed(s, target) });
      } else if (op === "duplicate") {
        const copy = freshName();
        steps.push(["ui_sketch_duplicate_layer", { target }], ["ui_sketch_set_layer_props", { target: `${target} copy`, name: copy }]);
        asks.push(`duplicate '${target}' and name the copy '${copy}'`);
        checks.push({ name: `${target} duplicated as ${copy}`, test: (s) => !!layerNamed(s, copy) && !!layerNamed(s, target) });
      } else if (op === "fillLayer") {
        const name = freshName();
        const color = pick.one(COLORS);
        probes.push({ key: `${name}:fill`, layer: name, x: 5, y: 5 });
        steps.push(["ui_sketch_add_layer", { name, fillColor: color[1] }]);
        asks.push(`add a new layer named '${name}' filled with ${color[0]} (${color[1]})`);
        checks.push({ name: `${name} filled ${color[1]}`, test: (s) => isColor(s.samples[`${name}:fill`], color[1]) });
      } else {
        const toTop = pick.chance(0.5);
        const moves = toTop ? names.length - 1 - names.indexOf(target) : names.indexOf(target);
        for (let m = 0; m < moves; m++) steps.push(["ui_sketch_reorder_layer", { target, direction: toTop ? "up" : "down" }]);
        // A layer already at the requested end is a check that cannot fail.
        if (moves === 0) {
          steps.push(["ui_sketch_set_layer_props", { target, visible: false }]);
          asks.push(`hide '${target}' without deleting it`);
          checks.push({ name: `${target} hidden`, test: (s) => layerNamed(s, target)?.visible === false });
          return;
        }
        asks.push(`move '${target}' to the ${toTop ? "top" : "bottom"} of the layer stack`);
        checks.push({
          name: `${target} at the ${toTop ? "top" : "bottom"}`,
          test: (s) => {
            const index = layerNamed(s, target)?.index;
            return index !== undefined && index === (toTop ? Math.max(...s.layers.map((l) => l.index)) : 0);
          }
        });
      }
    });
    for (const name of names.filter((n) => !touched.has(n))) {
      checks.push({
        name: `${name} left alone`,
        test: (s) => {
          const layer = layerNamed(s, name);
          return layer?.visible === true && layer.opacity === 1 && layer.blendMode === "normal";
        }
      });
    }
    const stack = [...names].reverse().map((n) => `'${n}'`);
    return {
      objective: `This sketch has the layers ${list(stack)}, top to bottom. Please ${list(asks)}. Leave the other layers as they are.`,
      createBridge: () => probedSketchBridge({ name: "scene", width: 256, height: 256, layers: names.map((name) => ({ name })) }, probes),
      checks,
      solve: async (call) => {
        for (const [name, args] of steps) await call(name, args);
      }
    };
  }
};

// ---------------------------------------------------------------- audio

/** Times are tenths of a second, so the arithmetic stays exact. */
interface AudioBlock {
  kind: "silence" | "speech" | "cough";
  start: number;
  end: number;
  level: number;
}

const secs = (tenths: number) => String(tenths / 10);
const round2 = (x: number) => Math.round(Math.min(1, x) * 100) / 100;
const ORDINALS = ["first", "second", "third"];

function audioSaveCheck(save: boolean): Check<AudioBridgeFinalState> {
  return save
    ? { name: "saved", test: (s) => s.saves > 0 && !s.dirty }
    : { name: "not saved", test: (s) => s.saves === 0 };
}

type AudioEditOp = "silenceCough" | "gainDown" | "gainUp" | "fadeIn" | "fadeOut" | "normalize";
type AudioCut = "trimLead" | "cutGap" | "trimTail";

export const AUDIO_EDIT: TaskFamily<AudioBridgeFinalState> = {
  id: "audio-edit",
  surface: "audio",
  make(pick) {
    const blocks: AudioBlock[] = [];
    let at = 0;
    const push = (kind: AudioBlock["kind"], length: number, level: number) => {
      blocks.push({ kind, start: at, end: at + length, level });
      at += length;
    };
    if (pick.chance(0.5)) push("silence", pick.int(2, 5) * 5, 0);
    const sentences = pick.int(2, 3);
    for (let i = 0; i < sentences; i++) {
      if (i > 0) {
        if (pick.chance(0.5)) push("cough", 5, 0.9);
        else push("silence", pick.int(2, 4) * 5, 0);
      }
      push("speech", pick.int(6, 10) * 5, pick.one([0.3, 0.4, 0.5, 0.6, 0.7]));
    }
    if (pick.chance(0.4)) push("silence", pick.int(2, 4) * 5, 0);
    const total = at;
    const speech = blocks.filter((b) => b.kind === "speech");
    const lead = blocks[0]!.kind === "silence" ? blocks[0]! : null;
    const tail = blocks.at(-1)!.kind === "silence" ? blocks.at(-1)! : null;
    const gaps = blocks.filter((b) => b.kind === "silence" && b !== lead && b !== tail);
    const coughs = blocks.filter((b) => b.kind === "cough");

    // Every edit the request asks for, compatible with the ones before it.
    const candidates: AudioEditOp[] = [];
    if (coughs.length > 0) candidates.push("silenceCough");
    candidates.push("gainDown");
    if (speech.some((b) => b.level <= 0.4)) candidates.push("gainUp");
    if (!lead) candidates.push("fadeIn");
    if (!tail) candidates.push("fadeOut");
    if (coughs.length === 0) candidates.push("normalize");
    const ops: AudioEditOp[] = [];
    const wanted = pick.int(1, 2);
    for (const op of pick.some(candidates, candidates.length)) {
      if (ops.length >= wanted) break;
      const hasGain = ops.includes("gainDown") || ops.includes("gainUp");
      if (op === "normalize" && hasGain) continue;
      if ((op === "gainDown" || op === "gainUp") && ops.includes("normalize")) continue;
      ops.push(op);
    }
    const cuts: AudioCut[] = [];
    if (lead) cuts.push("trimLead");
    if (gaps.length > 0) cuts.push("cutGap");
    if (tail) cuts.push("trimTail");
    const cut = cuts.length > 0 && pick.chance(0.6) ? pick.one(cuts) : null;

    const factor = new Map<AudioBlock, number>(blocks.map((b) => [b, 1]));
    const asks: string[] = [];
    const steps: Array<[string, Record<string, unknown>]> = [];
    const fades: Array<{ kind: "in" | "out"; length: number }> = [];
    const gainTargets = pick.some(speech, speech.length);
    const sentenceName = (b: AudioBlock) => `the ${ORDINALS[speech.indexOf(b)]} sentence (${secs(b.start)}–${secs(b.end)} s)`;

    for (const op of ops) {
      if (op === "silenceCough") {
        const cough = pick.one(coughs);
        factor.set(cough, 0);
        steps.push(["ui_audio_edit", { op: "silence", start: cough.start / 10, end: cough.end / 10 }]);
        asks.push(`mute the cough at ${secs(cough.start)}–${secs(cough.end)} s without changing the length`);
      } else if (op === "gainDown" || op === "gainUp") {
        const pool = gainTargets.filter((b) => factor.get(b) === 1 && (op === "gainDown" || b.level <= 0.4));
        const target = pool[0];
        if (!target) continue;
        const db = op === "gainDown" ? -pick.one([3, 6, 9]) : pick.one([3, 6]);
        factor.set(target, 10 ** (db / 20));
        steps.push(["ui_audio_edit", { op: "gain", start: target.start / 10, end: target.end / 10, gain_db: db }]);
        asks.push(op === "gainDown" ? `turn ${sentenceName(target)} down by ${-db} dB` : `boost ${sentenceName(target)} by ${db} dB`);
      } else if (op === "fadeIn" || op === "fadeOut") {
        const length = pick.one([5, 10]);
        fades.push({ kind: op === "fadeIn" ? "in" : "out", length });
        if (op === "fadeIn") {
          steps.push(["ui_audio_edit", { op: "fade_in", start: 0, end: length / 10 }]);
          asks.push(`fade in the first ${secs(length)} s`);
        } else {
          steps.push(["ui_audio_edit", { op: "fade_out", start: (total - length) / 10, end: total / 10 }]);
          asks.push(`fade out the last ${secs(length)} s`);
        }
      } else {
        const peak = Math.max(...blocks.map((b) => b.level));
        for (const b of blocks) factor.set(b, 1 / peak);
        steps.push(["ui_audio_edit", { op: "normalize" }]);
        asks.push("normalize the whole clip");
      }
    }

    let removed: { start: number; end: number } | null = null;
    if (cut === "trimLead") {
      removed = { start: 0, end: lead!.end };
      asks.push(`then remove the ${secs(lead!.end)} s of silence at the start`);
    } else if (cut === "cutGap") {
      const gap = pick.one(gaps);
      removed = { start: gap.start, end: gap.end };
      asks.push(`then cut out the pause at ${secs(gap.start)}–${secs(gap.end)} s`);
    } else if (cut === "trimTail") {
      removed = { start: tail!.start, end: total };
      asks.push(`then remove the silence after ${secs(tail!.start)} s at the end`);
    }
    if (removed) steps.push(["ui_audio_edit", { op: "delete", start: removed.start / 10, end: removed.end / 10 }]);
    const finalTotal = total - (removed ? removed.end - removed.start : 0);
    const finalTime = (t: number) => (removed && t >= removed.end ? t - (removed.end - removed.start) : t);
    const expected = (b: AudioBlock) => round2(b.level * factor.get(b)!);

    const checks: Check<AudioBridgeFinalState>[] = [
      { name: `length is ${secs(finalTotal)} s`, test: (s) => Math.abs(s.durationSeconds - finalTotal / 10) <= 0.05 }
    ];
    for (const b of blocks) {
      if (removed && b.start >= removed.start && b.end <= removed.end) continue;
      const window = finalTime(Math.floor((b.start + b.end) / 2));
      const level = expected(b);
      checks.push({
        name: `${b.kind} at ${secs(b.start)}–${secs(b.end)} s peaks at ${level}`,
        test: (s) => Math.abs((s.peaks[window] ?? -1) - level) <= 0.02
      });
    }
    for (const fade of fades) {
      const edge = fade.kind === "in" ? speech[0]! : speech.at(-1)!;
      const level = expected(edge);
      if (fade.kind === "in") {
        checks.push({
          name: `fades in over ${secs(fade.length)} s`,
          test: (s) => (s.peaks[0] ?? 1) < 0.3 * level && Math.abs((s.peaks[fade.length] ?? -1) - level) <= 0.02
        });
      } else {
        checks.push({
          name: `fades out over ${secs(fade.length)} s`,
          test: (s) =>
            (s.peaks[finalTotal - 1] ?? 1) < 0.3 * level && Math.abs((s.peaks[finalTotal - fade.length - 2] ?? -1) - level) <= 0.02
        });
      }
    }
    const save = pick.chance(0.5);
    checks.push(audioSaveCheck(save));

    const opener = pick.one(["In this recording,", "Clean up this take:", "Edit this audio:"]);
    const ending = save ? "Save it when you're done." : "Don't save yet.";
    return {
      objective: `${opener} ${list(asks)}. ${ending}`,
      createBridge: () =>
        createAudioToolBridge({
          name: "take.wav",
          segments: blocks.map((b) => ({ seconds: (b.end - b.start) / 10, level: b.level }))
        }),
      checks,
      solve: async (call) => {
        for (const [name, args] of steps) await call(name, args);
        if (save) await call("ui_audio_save", {});
      }
    };
  }
};

interface EffectAsk {
  id: string;
  params: Record<string, number>;
  say: string;
}

const EFFECT_ASKS: Array<(pick: { one<T>(items: readonly T[]): T }) => EffectAsk> = [
  (p) => {
    const decay = p.one([1.5, 3, 4.5]);
    const mix = p.one([20, 40, 60]);
    return { id: "reverb", params: { decay, mix }, say: `reverb with a ${decay} s decay and the mix at ${mix}%` };
  },
  (p) => {
    const delayMs = p.one([250, 500, 750]);
    const feedback = p.one([20, 30, 50]);
    return { id: "echo", params: { delayMs, feedback }, say: `an echo with a ${delayMs} ms delay and ${feedback}% feedback` };
  },
  (p) => {
    const frequency = p.one([80, 120, 200]);
    return { id: "lowCut", params: { frequency }, say: `a low cut at ${frequency} Hz to remove the rumble` };
  },
  (p) => {
    const frequency = p.one([4000, 6000, 10000]);
    return { id: "highCut", params: { frequency }, say: `a high cut at ${frequency} Hz` };
  },
  (p) => {
    const thresholdDb = p.one([-24, -18, -12]);
    const ratio = p.one([2, 3, 6]);
    return { id: "compressor", params: { thresholdDb, ratio }, say: `a compressor with a ${thresholdDb} dB threshold and a ${ratio}:1 ratio` };
  },
  (p) => {
    const ceilingDb = p.one([-1, -2, -3]);
    return { id: "limiter", params: { ceilingDb }, say: `a limiter with the ceiling at ${ceilingDb} dB` };
  },
  (p) => {
    const thresholdDb = p.one([-50, -45, -35]);
    return { id: "noiseGate", params: { thresholdDb }, say: `a noise gate with the threshold at ${thresholdDb} dB` };
  },
  (p) => {
    const band = p.one([["low", "low band (80 Hz)"], ["high", "high band (12 kHz)"], ["mid", "mid band (1 kHz)"]] as const);
    const db = p.one([-6, -3, 3, 6]);
    return {
      id: "equalizer",
      params: { [band[0]]: db },
      say: `the equalizer with the ${band[1]} ${db > 0 ? "boosted" : "cut"} by ${Math.abs(db)} dB`
    };
  },
  (p) => {
    const rateHz = p.one([3, 6, 8]);
    const depth = p.one([40, 70]);
    return { id: "tremolo", params: { rateHz, depth }, say: `a tremolo at ${rateHz} Hz with ${depth}% depth` };
  },
  (p) => {
    const bits = p.one([4, 6, 10]);
    return { id: "bitcrusher", params: { bits }, say: `a bitcrusher at ${bits} bits` };
  },
  (p) => {
    const driveDb = p.one([6, 18, 24]);
    return { id: "distortion", params: { driveDb }, say: `distortion with ${driveDb} dB of drive` };
  }
];

const effectDefaults = (id: string): Record<string, number> =>
  Object.fromEntries((AUDIO_EFFECT_SPECS.find((e) => e.id === id)?.params ?? []).map((p) => [p.key, p.defaultValue]));
const sameParams = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(b).every(([k, v]) => Math.abs((a[k] ?? NaN) - v) < 1e-6);

export const AUDIO_EFFECTS: TaskFamily<AudioBridgeFinalState> = {
  id: "audio-effects",
  surface: "audio",
  make(pick) {
    const total = pick.int(8, 16) * 5;
    const speed = pick.chance(0.25) ? pick.one([0.8, 1.25, 1.5]) : null;
    const asks = pick.some(EFFECT_ASKS, pick.int(1, 2)).map((make) => {
      const ask = make(pick);
      // A range only on a clip whose length stays put.
      const ranged = !speed && pick.chance(0.35);
      const start = ranged ? pick.int(0, total / 5 - 3) * 5 : 0;
      // A range that spans the clip would just be "the whole clip".
      const end = ranged ? Math.min(start + pick.int(2, total / 5 - start / 5) * 5, start === 0 ? total - 5 : total) : total;
      return { ...ask, range: ranged ? { start, end } : null };
    });
    const checks: Check<AudioBridgeFinalState>[] = asks.map((ask) => {
      const expected = { ...effectDefaults(ask.id), ...ask.params };
      const where = ask.range ? ` on ${secs(ask.range.start)}–${secs(ask.range.end)} s` : " on the whole clip";
      return {
        name: `${ask.id} ${JSON.stringify(ask.params)}${where}`,
        test: (s) =>
          s.effects.some((e) => {
            if (e.effectId !== ask.id || !sameParams(e.params, expected)) return false;
            if (ask.range) return !!e.range && Math.abs(e.range.start - ask.range.start / 10) < 0.01 && Math.abs(e.range.end - ask.range.end / 10) < 0.01;
            return e.range === null || (e.range.start <= 0.01 && e.range.end >= total / 10 - 0.01);
          })
      };
    });
    const effectCount = asks.length + (speed ? 1 : 0);
    checks.push({ name: `exactly ${effectCount} effect(s) applied`, test: (s) => s.effects.length === effectCount });
    if (speed) {
      checks.push({
        name: `speed ${speed}×`,
        test: (s) => s.effects.some((e) => e.effectId === "speed" && Math.abs((e.params.rate ?? 0) - speed) < 1e-6)
      });
    }
    const finalSeconds = speed ? total / 10 / speed : total / 10;
    checks.push({ name: `length ${finalSeconds.toFixed(2)} s`, test: (s) => Math.abs(s.durationSeconds - finalSeconds) <= 0.05 });
    const save = pick.chance(0.5);
    checks.push(audioSaveCheck(save));

    const phrases = asks.map((a) => `${a.say}${a.range ? ` only between ${secs(a.range.start)} and ${secs(a.range.end)} s` : ""}`);
    const speedAsk = speed ? ` and ${speed > 1 ? "speed the clip up" : "slow the clip down"} to ${speed}×` : "";
    const ending = save ? "Save the result." : "Don't save it yet.";
    return {
      objective: `On this ${secs(total)} s clip, apply ${list(phrases)}${speedAsk}. Leave every setting I didn't mention at its default. ${ending}`,
      createBridge: () =>
        createAudioToolBridge({
          name: "voice.wav",
          segments: [
            { seconds: total / 20, level: 0.5 },
            { seconds: total / 20, level: 0.35 }
          ]
        }),
      checks,
      solve: async (call) => {
        for (const ask of asks) {
          const range = ask.range ? { start: ask.range.start / 10, end: ask.range.end / 10 } : {};
          await call("ui_audio_apply_effect", { effect_id: ask.id, params: ask.params, ...range });
        }
        if (speed) await call("ui_audio_apply_effect", { effect_id: "speed", params: { rate: speed } });
        if (save) await call("ui_audio_save", {});
      }
    };
  }
};

export const SKETCH_AUDIO_FAMILIES: readonly ErasedFamily[] = [
  defineFamily(SKETCH_COMPOSE),
  defineFamily(SKETCH_LAYERS),
  defineFamily(AUDIO_EDIT),
  defineFamily(AUDIO_EFFECTS)
];
