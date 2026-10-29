#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { BUNDLED_FONTS, compileClipAnimations, resolveAnimatedStyleTracks, resolveAnimatedTextContent, createAnimationSample } from "@nodetool-ai/timeline";
import { drawText, drawShape, drawCaption, drawStaggeredText, layoutTextBlock, textFontSpec, measureTextWith, countTextStaggerUnits } from "@nodetool-ai/timeline/render";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fonts = path.resolve(root, "../../packages/timeline/fonts");
for (const face of BUNDLED_FONTS) {
  if (!GlobalFonts.registerFromPath(path.join(fonts, face.file))) throw new Error(`font unavailable: ${face.file}`);
}
const out = path.resolve(process.argv[2] ?? path.join(root, "build/render2d-reference"));
fs.mkdirSync(out, { recursive: true });
const width = 640, height = 360;
const title = { text: "Native timeline", fontFamily: "Inter", fontSizePx: 40, fontWeight: 400, color: "#e6e9f0", maxWidthFrac: 0.8 };
const cases = [];
function add(name, kind, style, animations = [], timeMs = 500, width = 640, height = 360) {
  cases.push({ name, kind, style, animations, timeMs, width, height });
}
for (const family of ["Inter", "JetBrains Mono", "Lora", "Playfair Display", "Space Grotesk", "Bebas Neue"]) {
  add(`font-${family.replaceAll(" ", "-")}`, "text", { ...title, fontFamily: family });
}
add("text-weight", "text", { ...title, fontWeight: 800 });
add("regression-serein-counter-493", "text", { text: "493", fontFamily: "Inter", fontSizePx: 300, fontWeight: 800, color: "#f8fafc", align: "center", maxWidthFrac: 0.9, letterSpacingPx: -13.5 }, [], 1600, 1920, 1080);
cases.at(-1).minPsnr = 40;
for (const size of [256, 257]) {
  add(`text-path-boundary-${size}`, "text", { ...title, text: "493", fontSizePx: size, fontWeight: 800, letterSpacingPx: -13.5 }, [], 500, 1920, 1080);
  cases.at(-1).minPsnr = size > 256 ? 40 : 35;
}
add("text-large-overlap-alpha", "text", { ...title, text: "OO", fontSizePx: 300, fontWeight: 800, color: "rgba(248,250,252,0.5)", letterSpacingPx: -150 }, [], 500, 1920, 1080);
cases.at(-1).minPsnr = 40;
for (const [name, fill] of [["quarter", "rgba(248,250,252,0.25)"], ["opaque", "#f8fafc"], ["gradient", { type: "linear", angle: 0, stops: [{ offset: 0, color: "rgba(248,250,252,0)" }, { offset: 1, color: "#f8fafc" }] }]]) {
  add(`text-large-shadow-alpha-${name}`, "text", { ...title, text: "OO", fontSizePx: 300, fontWeight: 800, color: typeof fill === "string" ? fill : "#f8fafc", ...(typeof fill === "string" ? {} : { fill }), letterSpacingPx: -150, shadow: { color: "rgba(96,48,255,0.5)", blurPx: 4, offsetX: 400, offsetY: 0 } }, [], 500, 1920, 1080);
  cases.at(-1).minPsnr = 40;
}
add("text-large-outline-alpha", "text", { ...title, text: "493", fontSizePx: 300, fontWeight: 800, color: "rgba(248,250,252,0.6)", letterSpacingPx: -13.5, stroke: { color: "rgba(100,70,220,0.7)", widthPx: 3 }, shadow: { color: "rgba(20,80,240,0.5)", blurPx: 4, offsetX: 6, offsetY: -4 } }, [], 500, 1920, 1080);
cases.at(-1).minPsnr = 40;

add("text-italic", "text", { ...title, fontFamily: "Lora", fontStyle: "italic" });
add("text-wrap", "text", { ...title, text: "Measured words wrap to the same lines\nSecond paragraph", maxWidthFrac: 0.5, fontSizePx: 32, align: "left", verticalAlign: "top", lineHeight: 1.4, letterSpacingPx: 1.2 });
add("text-right-bottom", "text", { ...title, text: "Right\nAligned", align: "right", verticalAlign: "bottom" });
add("text-outline", "text", { ...title, stroke: { color: "#7c3aed", widthPx: 3 } });
add("text-background", "text", { ...title, background: { color: "#162536", paddingPx: 12, radiusPx: 8 }, strikethrough: true });
add("text-shadow", "text", { ...title, shadow: { color: "rgba(80,120,255,0.8)", blurPx: 6, offsetX: 4, offsetY: 6 } });
const gradient = { type: "linear", angle: 25, stops: [{ offset: 0, color: "#ff2040" }, { offset: 1, color: "#22caff" }] };
add("text-gradient", "text", { ...title, fill: gradient });
add("text-path", "text", { ...title, path: "M0.1 0.5 Q0.5 0.1 0.9 0.5" });
for (const kind of ["rect", "ellipse", "line", "polygon", "star", "path"]) {
  add(`shape-${kind}`, "shape", { kind, x: 0.15, y: 0.2, width: 0.7, height: 0.6, x2: 0.85, y2: 0.8, fill: "#417ad9", stroke: "#efb040", strokeWidthPx: 3, sides: 5, cornerRadius: 0.025, d: "M0.15 0.8 C0.15 0.2 0.85 0.2 0.85 0.8 Z" });
}
add("shape-css-percent", "shape", { kind: "rect", fill: "rgb(100% 0% 0% / 50%)" });
add("shape-css-hsl", "shape", { kind: "rect", fill: "hsl(120, 100%, 50%)" });
add("shape-gradient", "shape", { kind: "rect", fillStyle: gradient, cornerRadius: 0.03 });
add("shape-radial", "shape", { kind: "ellipse", fillStyle: { ...gradient, type: "radial" } });
add("shape-trim-dash", "shape", { kind: "ellipse", stroke: "#d4ff3a", strokeWidthPx: 6, dash: [0.02, 0.01], lineCap: "round", trimStart: 0.12, trimEnd: 0.7 });
add("caption", "caption", { words: [{ text: "Speak", active: false }, { text: "these", active: true }, { text: "words", active: false }] });
add("caption-style", "caption", { words: [{ text: "Styled", active: true }, { text: "caption", active: false }], style: { fontFamily: "JetBrains Mono", fontSizeFrac: 0.09, bottomMarginFrac: 0.2, outline: { color: "#ab42e0", widthPx: 2 }, background: { color: "#14283e", paddingPx: 8, radiusPx: 4 } } });
const curve = (property, from, to) => ({ property, keyframes: [{ t: 0, value: from }, { t: 1, value: to }] });
const motion = (unit, from = "start") => ({ id: "motion", role: "in", preset: "custom", durationMs: 400, stagger: { unit, offsetMs: 90, from }, custom: { curves: [curve("opacity", 0, 1), curve("offsetY", 30, 0)] } });
for (const unit of ["word", "character", "line"]) {
  add(`stagger-${unit}`, "text", { ...title, text: "Words move\ninto place" }, [motion(unit)], 250);
}
add("stagger-end", "text", title, [motion("character", "end")], 600);
add("stagger-center", "text", title, [motion("character", "center")], 350);
add("ticker", "text", title, [{ id: "ticker", role: "in", preset: "custom", durationMs: 1000, textAnimator: { kind: "ticker", from: 0, to: 12345, groupSeparator: "," } }], 350);
add("text-style-track", "text", title, [{ id: "style", role: "in", preset: "custom", durationMs: 1000, styleTracks: [{ target: "text.color", keyframes: [{ t: 0, value: "#ff0000" }, { t: 1, value: "#0000ff" }] }] }]);
add("shape-style-track", "shape", { kind: "rect", fill: "#ff0000" }, [{ id: "style", role: "in", preset: "custom", durationMs: 1000, styleTracks: [{ target: "shape.height", keyframes: [{ t: 0, value: 0.1 }, { t: 1, value: 0.8 }] }, { target: "shape.fill", keyframes: [{ t: 0, value: "#ff0000" }, { t: 1, value: "#0000ff" }] }] }]);
add("typewriter", "text", title, [{ id: "type", role: "in", preset: "typewriter", durationMs: 1, stagger: { unit: "character", offsetMs: 65 }, caret: { color: "#e6e9f0", widthPx: 2, blinkPeriodMs: 1000 } }], 350);
add("glyph-color", "text", title, [{ ...motion("character"), styleTracks: [{ target: "glyph.color", keyframes: [{ t: 0, value: "#f02030" }, { t: 1, value: "#40a0ff" }] }] }], 350);
add("glyph-tracking", "text", title, [{ ...motion("character"), styleTracks: [{ target: "glyph.trackingPx", keyframes: [{ t: 0, value: 12 }, { t: 1, value: 0 }] }] }], 350);

// Actual example styles exercise fractional metrics, negative tracking and
// path overflow at the same raster sizes used by the stills check.
const examples = path.resolve(root, "../../packages/base-nodes/nodetool/examples/timelines");
for (const [slug, ids] of [
  ["cadence", ["S1_t31", "S1_t33", "S2_t6", "S2_t20", "S2_t30", "S2_t40", "S2_t44", "S5_t21", "S5_t6", "S5_t8"]],
  ["kite", ["S3_t63", "S4_t65"]],
  ["prism", ["S3_t6", "S6_t22", "S6_t25", "S6_t29"]],
  ["voltra", ["S2_t66"]],
  ["serein", ["S1_t191", "S4a_t219"]],
  ["tidewater", ["S1_t8", "S1_t9", "S1_t13", "S1_t14", "S2_t37", "S2_t39", "S3_t8", "S3_t9", "S3_t17", "S4_t12", "S4_t13", "S4_t16", "S4_t18", "S4_t26"]],
  ["t-minus-30", ["broadcast_t21", "broadcast_t24", "broadcast_t65", "broadcast_t31", "broadcast_t16"]]
]) {
  const bundle = JSON.parse(fs.readFileSync(path.join(examples, `${slug}.timeline.json`), "utf8"));
  for (const id of ids) {
    const clip = bundle.document.clips.find((c) => c.id === id);
    if (!clip?.textStyle) throw new Error(`missing text fixture ${slug}/${id}`);
    const style = { ...clip.textStyle };
    const countedText = { S2_t6: "4,218,306", S2_t20: "14.2 min", S2_t30: "1,178 t", S2_t40: "85,550", S5_t21: "46%", S1_t191: "1,205" };
    if (slug === "cadence" || slug === "serein") style.text = countedText[id] ?? style.text;
    if (id === "broadcast_t21") style.maxWidthFrac = 186 / bundle.width;
    if (id === "broadcast_t24") style.maxWidthFrac = 128 / bundle.width;
    add(`example-${slug}-${id}`, "text", style, [], 500, bundle.width, bundle.height);
  }
}

// Keep the actual animation windows. Static styles miss word sampling bugs.
for (const [slug, id, frame] of [["cadence", "S2_t6", 135], ["cadence", "S2_t44", 135],
  ["prism", "S3_t6", 233], ["tidewater", "S2_t39", 161]]) {
  const bundle = JSON.parse(fs.readFileSync(path.join(examples, `${slug}.timeline.json`), "utf8"));
  const original = bundle.document.clips.find((clip) => clip.id === id);
  add(`regression-${slug}-${id}`, "text", original.textStyle, original.animations,
    frame * 1000 / bundle.fps - original.startMs, bundle.width, bundle.height);
  Object.assign(cases.at(-1), { durationMs: original.durationMs, steppedTime: original.steppedTime });
}

const prism = JSON.parse(fs.readFileSync(path.join(examples, "prism.timeline.json"), "utf8"));
add("regression-prism-S3_s9", "shape", prism.document.clips.find((clip) => clip.id === "S3_s9").shapeStyle,
  [], 500, prism.width, prism.height);

for (const fixture of cases) {
  const { width, height } = fixture;
  const canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  const clip = { id: fixture.name, trackId: "v", mediaType: fixture.kind === "caption" ? "audio" : fixture.kind,
    startMs: 0, durationMs: fixture.durationMs ?? 3000, animations: fixture.animations, steppedTime: fixture.steppedTime,
    ...(fixture.kind === "text" ? { textStyle: fixture.style } : fixture.kind === "shape" ? { shapeStyle: fixture.style } : { caption: { ...fixture.style, words: fixture.style.words.map((word, index) => ({ word: word.text, startMs: fixture.name === "caption" ? [0, 200, 800][index] : index * 1000, endMs: fixture.name === "caption" ? [200, 800, 1400][index] : (index + 1) * 1000 })) } }) };
  const compiled = compileClipAnimations(clip.animations, clip.durationMs, { width, height }, { staggerCount: clip.textStyle ? countTextStaggerUnits(clip.textStyle, { width, height, measureText: measureTextWith(ctx) }, clip.animations.find((a) => a.stagger)?.stagger.unit ?? "character") : 0, staggerUnit: clip.animations.find((a) => a.stagger)?.stagger.unit ?? "character" });
  const styles = resolveAnimatedStyleTracks(clip, compiled, fixture.timeMs);
  if (fixture.kind === "text") {
    const textStyle = { ...styles.textStyle, text: resolveAnimatedTextContent(clip, compiled, fixture.timeMs) };
    const measure = measureTextWith(ctx), font = textFontSpec(textStyle);
    fixture.layout = layoutTextBlock((text) => measure(text, font), textStyle, width, height);
    if (compiled.some((a) => a.stagger)) drawStaggeredText(ctx, textStyle, width, height, { compiled, localMs: fixture.timeMs, sourceMs: fixture.timeMs }, createAnimationSample());
    else drawText(ctx, textStyle, width, height);
  } else if (fixture.kind === "shape") drawShape(ctx, styles.shapeStyle, width, height);
  else drawCaption(ctx, fixture.style, width, height);
  fixture.clip = clip;
  if (fixture.name === "regression-cadence-S2_t6" || fixture.name === "regression-prism-S3_t6") {
    const pixels = ctx.getImageData(0, 0, width, height).data;
    let left = width, right = 0, top = height, bottom = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3]) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    fixture.region = [Math.max(0, left - 20), Math.max(0, top - 20),
      Math.min(width, right + 21) - Math.max(0, left - 20), Math.min(height, bottom + 21) - Math.max(0, top - 20)];
  }
  fs.writeFileSync(path.join(out, `${fixture.name}.png`), canvas.toBuffer("image/png"));
}
fs.writeFileSync(path.join(out, "cases.json"), JSON.stringify({ width, height, cases }, null, 2));
console.log(`${cases.length} TypeScript raster references: ${out}`);
