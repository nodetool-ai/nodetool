import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const directory = fileURLToPath(new URL("./fixtures/", import.meta.url));
const media = "../../../../fixtures/media/";
// Freeze an existing test video frame so decoder frame selection cannot mask
// spatial-effect conformance. Match the exporter's frame-sized decode.
// The generated PNG is also checked in.
if (!fs.existsSync(`${directory}/source-pattern.png`)) {
  execFileSync("ffmpeg", ["-v", "error", "-i", `${directory}/${media}numbered-a-1080p30.mp4`,
    "-vf", "scale=1280:720", "-frames:v", "1", "-update", "1", `${directory}/source-pattern.png`, "-y"]);
}
const cube = "TITLE swap-red-blue\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n0 0 1\n0 1 0\n0 1 1\n1 0 0\n1 0 1\n1 1 0\n1 1 1\n";
fs.writeFileSync(`${directory}/swap-red-blue.cube`, cube);
const curve = [[0, 0], [0.25, 0.18], [0.5, 0.68], [0.75, 0.9], [1, 1]].map(([x, y]) => ({ x, y }));
const points = (middle) => [{ x: 0, y: 0 }, { x: 0.5, y: middle }, { x: 1, y: 1 }];
const settings = {
  color: [{ brightness: 0.14, contrast: 1.4, saturation: 0.6, hue: 45, temperature: 0.25, tint: -0.2, shadows: 0.3, highlights: -0.2 },
    { brightness: -0.12, contrast: 0.7, saturation: 1.8, hue: -60, temperature: -0.5, tint: 0.2, shadows: -0.3, highlights: 0.4 }],
  blur: [{ radius: 12 }, { radius: 60 }],
  pixelate: [{ cellSize: 64 }, { cellSize: 128 }],
  posterize: [{ levels: 2 }, { levels: 5 }],
  directionalBlur: [{ radius: 48, angle: 35 }, { radius: 64, angle: 125 }],
  lensDistortion: [{ amount: 0.8 }, { amount: -0.7 }],
  lut: [{ cube, intensity: 0.65 }, { cube, intensity: 1 }],
  glow: [{ radius: 32, intensity: 1.2 }, { radius: 56, intensity: 2 }],
  dropShadow: [{ offsetX: 70, offsetY: 45, blur: 24, color: "#102060", opacity: 0.9 },
    { offsetX: -65, offsetY: -35, blur: 40, color: "#600040", opacity: 0.8 }],
  vignette: [{ amount: 0.85, radius: 0.95, softness: 0.65 }, { amount: 0.7, radius: 1.2, softness: 0.9 }],
  sharpen: [{ amount: 1.5, radius: 3, threshold: 0 }, { amount: 2, radius: 8, threshold: 0.015 }],
  chromaKey: [{ color: "#c02040", tolerance: 0.15, softness: 0.1, spill: 0.7 },
    { color: "#b02540", tolerance: 0.02, softness: 0.2, spill: 0.5 }],
  curves: [{ master: curve, r: points(0.7), g: points(0.35), b: points(0.6) },
    { master: points(0.35), r: points(0.35), g: points(0.7), b: points(0.8) }],
  levels: [{ inBlack: 0.08, inWhite: 0.9, gamma: 1.7, outBlack: 0.12, outWhite: 0.85 },
    { inBlack: 0.03, inWhite: 0.8, gamma: 0.6, outBlack: 0.02, outWhite: 0.95 }],
  liftGammaGain: [{ lift: [0.05, -0.02, 0.08], gamma: [1.3, 0.8, 1.8], gain: [0.8, 1.2, 1.1] },
    { lift: [-0.1, 0.08, 0.03], gamma: [0.8, 1.7, 0.7], gain: [1.2, 0.7, 1.3] }],
  grain: [{ amount: 1, size: 2, colorAmount: 0, roughness: 0.2, softness: 0.15, seed: 17, animate: false },
    { amount: 1, size: 4, colorAmount: 0.8, roughness: 0.9, softness: 0.7, seed: -7, animate: false }]
};
const effect = (type, params, id = type) => ({ id, type, enabled: true, ...params });
function clip(id, trackId, startMs = 0, source = "rgb-solid-720p.mp4") {
  return { id, trackId, name: id, startMs, durationMs: 1000, mediaType: source.endsWith(".png") ? "image" : "video", sourceType: "imported", status: "generated",
    locked: false, versions: [], inPointMs: 0, width: 1280,
    height: 720, mediaPath: source === "source-pattern.png" ? source : media + source };
}
function group(id, trackId, effects, parentId) {
  return { id, trackId, name: id, startMs: 0, durationMs: 1000, mediaType: "group", sourceType: "imported", status: "draft",
    locked: false, versions: [], effects, ...(parentId ? { parentId } : {}) };
}
function save(name, clips, frames, criterion) {
  const durationMs = Math.max(...clips.map(clip => clip.startMs + clip.durationMs));
  const doc = { id: `seq-${name}`, projectId: "native-prototype", name, fps: 30, width: 1280, height: 720, durationMs,
    tracks: Array.from({ length: 5 }, (_, index) => ({ id: `t${index}`, name: `t${index}`, type: "video", index, visible: true, locked: false })),
    clips, markers: [], createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z",
    goldenFrames: frames.map(frame => ({ frame, criterion: `${name.startsWith("effects-") ? "J2" : "J1"} ${criterion}, PSNR >= 40 dB` })) };
  fs.writeFileSync(`${directory}/${name}.json`, `${JSON.stringify(doc, null, 2)}\n`);
}
for (const [type, variants] of Object.entries(settings)) {
  const textured = ["blur", "pixelate", "directionalBlur", "lensDistortion", "sharpen"].includes(type);
  const clips = variants.flatMap((params, index) => {
    const source = clip(`${type}-${index}`, "t0", index * 1000, textured ? "source-pattern.png" : "rgb-solid-720p.mp4");
    source.effects = [effect(type, params, `${type}-${index}`)];
    if (["glow", "dropShadow"].includes(type)) {
      source.mediaType = "shape";
      delete source.mediaPath;
      source.shapeStyle = { kind: "rect", x: 0.18, y: 0.18, width: 0.64, height: 0.64, fill: "#d8d8d8" };
      return [source, clip(`background-${index}`, "t4", index * 1000, "pip-a-720p.mp4")];
    }
    return type === "chromaKey" ? [source, clip(`background-${index}`, "t4", index * 1000, "pip-a-720p.mp4")] : [source];
  });
  save(`clip-${type}`, clips, [0, 30], `${type} two parameter settings`);
}
const cropped = clip("crop", "t0", 0, "source-pattern.png");
cropped.crop = { left: 0.25, right: 0.25, top: 0.125, bottom: 0.125 };
cropped.effects = [effect("blur", { radius: 36 }), effect("vignette", { amount: 0.9, radius: 1, softness: 0.8 })];
save("clip-crop-chain", [cropped], [0, 15], "crop before blur and vignette with clamped crop edges");
const ordered = clip("ordered", "t0", 0, "source-pattern.png");
ordered.effects = [effect("color", { brightness: 0.06 }, "early-color"), effect("pixelate", { cellSize: 36 }),
  effect("blur", { radius: 6 }, "early-blur"), effect("curves", settings.curves[0]), effect("posterize", { levels: 6 }),
  effect("vignette", settings.vignette[0]), effect("color", { saturation: 0.6, hue: 35 }, "late-color"),
  effect("blur", { radius: 8 }, "late-blur"), { ...effect("lensDistortion", { amount: 1 }), enabled: false }];
save("clip-ordered-chain", [ordered], [0, 15], "document order then aggregated color and blur, disabled effects excluded");
for (const nested of [false, true]) {
  const name = nested ? "effects-nested-group" : "effects-group";
  const outer = group("outer", "t0", [effect("color", settings.color[0]), effect("blur", { radius: 28 })]);
  outer.opacity = 0.65;
  const a = clip("child-a", "t2"); a.parentId = nested ? "inner" : "outer"; a.opacity = 0.6;
  const b = clip("child-b", "t3", 0, "pip-a-720p.mp4"); b.parentId = a.parentId; b.opacity = 0.55;
  b.transform = { position: { x: 0.04, y: -0.03 }, scale: { x: 0.85, y: 0.85 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } };
  const inner = group("inner", "t1", [effect("curves", settings.curves[0]), effect("vignette", settings.vignette[0])], "outer");
  inner.opacity = 0.75;
  save(name, [outer, ...(nested ? [inner] : []), a, b, clip("background", "t4", 0, "pip-a-720p.mp4")], [0, 15], "D35 group surface effects and premultiplied alpha");
}
