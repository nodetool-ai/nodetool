// T minus 30: a fictional launch broadcast assembled from three original
// moving camera feeds, a local score, and timeline-native graphics.
//
// `python3 scripts/example-timelines/t-minus-30-media.py` regenerates source
// media on macOS using Pillow, ffmpeg, and the system Alex voice.
// `node scripts/example-timelines/t-minus-30.mjs` writes the document.
// `node scripts/render-example-timeline.mjs t-minus-30 --poster-frame 805`
// renders the deliverable.
//
// Frames are at 30 fps. Source time is in absolute milliseconds for remapped
// video. The score runs independently through the fault freeze.
//
// | Coverage | Review frame |
// |---|---:|
// | Moving control-room program | 90 |
// | Pad program with live control inset | 285 |
// | Engine camera and pad inset | 465 |
// | Fault freeze boundary | 571, 615 |
// | Recovery speed ramp and ignition | 655, 705 |
// | Clean launch and live telemetry | 825 |
// | Audible countdown, alarm, and launch rumble | 375, 570, 765 |
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilder, cv } from "./lib.mjs";

const W = 1280, H = 720, FPS = 30, FRAMES = 900;
const CYAN = "#7de5ea", WHITE = "#eef7f5", MUTED = "#9ab7bd";
const AMBER = "#ffbc79", RED = "#ff6c72", DARK = "#08151d";
const uri = (name) => `package://nodetool-base/timelines/t-minus-30/${name}`;
const {
  ms, scenes, scene, add, box, text: sourceText, on, sceneTracks
} = createBuilder({ W, H, FPS, font: "JetBrains Mono" });

function text(value, size, weight, color, options) {
  return sourceText(value, size, weight, color, {
    ...options,
    style: { stroke: { color: "#06131b", widthPx: 2 }, ...options.style }
  });
}

scene("broadcast", 0, FRAMES - 1);

function feed(name, from, to, sourceFrame, options = {}) {
  const clip = add("video", {
    name: `${name} camera`, from, to, slot: options.slot ?? "program",
    currentAssetId: uri(`${name}.mp4`),
    x: options.x ?? 0, y: options.y ?? 0, s: options.scale ?? 1,
    borderRadius: options.radius ?? 0
  });
  clip.inPointMs = ms(sourceFrame);
  clip.volumeDb = -90;
  if (options.timeRemap) clip.timeRemap = { keyframes: options.timeRemap };
  return clip;
}

// The program cuts among independent camera files. The pad source keeps
// moving while the scene changes; only the fault clip has a time remap.
feed("control", 0, 209, 0);
feed("pad", 210, 419, 180);
feed("engine", 420, 539, 30);
feed("pad", 540, 659, 540, {
  timeRemap: [
    { t: 0, sourceMs: ms(540) },
    { t: 0.25, sourceMs: ms(561) },
    { t: 0.73, sourceMs: ms(561) },
    { t: 1, sourceMs: ms(615), easing: "easeIn" }
  ]
});
feed("pad", 660, 779, 615);
feed("pad", 780, 899, 735);

// One small live camera continues through the cuts and remains active while
// the program feed freezes. A dark frame makes the inset legible over smoke.
box(362, 210, DARK, { name: "inset frame", from: 210, to: 779, x: 418, y: -189,
  stroke: "#5da5ae", sw: 3, r: 8 });
feed("control", 210, 449, 0, { slot: "inset", x: 418, y: -189, scale: 0.27, radius: 6 });
feed("pad", 450, 539, 450, { slot: "inset", x: 418, y: -189, scale: 0.27, radius: 6 });
feed("control", 540, 659, 120, { slot: "inset", x: 418, y: -189, scale: 0.27, radius: 6 });
feed("engine", 660, 779, 90, { slot: "inset", x: 418, y: -189, scale: 0.27, radius: 6 });

// Broadcast frame. The lower caption strip has no text baked into the camera
// files, so it remains sharp and editable across every program cut.
box(W, 88, "rgba(3,13,20,0.86)", { name: "top matte", y: -316 });
box(W, 126, "rgba(3,13,20,0.86)", { name: "lower matte", y: 297 });
box(4, 520, CYAN, { name: "left rule", x: -608, y: 5 });
box(1120, 2, "rgba(125,229,234,0.35)", { name: "lower rule", y: 231 });
text("NORTHSTAR / FLIGHT 01", 25, 600, WHITE, {
  name: "program identity", anchor: "left", mw: 0.45, x: -574, y: -315,
  style: { letterSpacingPx: 3 }
});
text("LIVE  •  PAD 03", 22, 600, CYAN, {
  name: "live bug", anchor: "right", mw: 0.28, x: 576, y: -315,
  style: { letterSpacingPx: 2 }
});
text("CAM 02 / AUX", 19, 500, CYAN, {
  name: "inset label", from: 210, to: 779, x: 286, y: -268,
  anchor: "left", mw: 0.2, style: { letterSpacingPx: 2 }
});

const phases = [
  [0, 209, "CONTROL ROOM", "All stations, final check.", "SYSTEMS NOMINAL"],
  [210, 419, "PAD CAMERA", "Flight systems confirmed. Final camera checks.", "GO FOR LAUNCH"],
  [420, 539, "ENGINE CAMERA", "Eight. Seven. Six. Five.", "CHAMBER PRESSURE  98%"],
  [540, 614, "PAD CAMERA", "Hold. We have a sensor fault.", "HOLD / SENSOR 04"],
  [615, 659, "PAD CAMERA", "Fault cleared. Resume count.", "RECHECK COMPLETE"],
  [660, 779, "PAD CAMERA", "Four. Three. Two. One. Ignition.", "IGNITION SEQUENCE"],
  [780, 899, "ASCENT CAMERA", "Liftoff. Northstar is flying.", "ASCENT NOMINAL"]
];
for (const [from, to, camera, line, status] of phases) {
  text(camera, 18, 600, CYAN, { name: `camera ${from}`, from, to, slot: "camera-label", x: -570, y: 260,
    anchor: "left", mw: 0.22, style: { letterSpacingPx: 2 } });
  text(line, 30, 500, WHITE, { name: `caption ${from}`, from, to, slot: "caption", x: -570, y: 304,
    anchor: "left", mw: 0.69 });
  text(status, 19, 600, from === 540 ? RED : AMBER,
    { name: `status ${from}`, from, to, slot: "status", x: 573, y: 260, anchor: "right",
      mw: 0.27, style: { letterSpacingPx: 1 } });
}

// The large count is assembled as frame-aligned clips. It stays readable
// during the freeze, then advances to zero on the ignition cut.
for (let second = 0; second < 30; second++) {
  const count = second < 12 ? null : second < 18 ? 22 - second : second <= 20 ? null : second <= 25 ? 25 - second : null;
  const active = second >= 18 && second <= 20 ? "HOLD" : second >= 26 ? "ASCENT" :
    count === null ? "PRE-LAUNCH" : `T − ${String(count).padStart(2, "0")}`;
  const from = second * FPS, to = from + FPS - 1;
  text(active, 49, 600, second >= 18 && second <= 20 ? RED : WHITE,
    { name: `count ${second}`, from, to, slot: "clock", x: -560, y: -209,
      anchor: "left", mw: 0.36 });
}

const fault = box(W, H - 214, "rgba(120,18,23,0.15)",
  { name: "fault red wash", from: 561, to: 614, y: -17 });
on(fault, 561, 5, [cv("opacity", 0, 1, "linear")]);
const recovery = box(W, H - 214, "rgba(255,188,121,0.22)",
  { name: "ignition flash", from: 660, to: 670, y: -17 });
on(recovery, 660, 10, [cv("opacity", 1, 0, "linear")]);

const tracks = [{ id: "t_scenes", name: "broadcast", type: "video", index: 0,
  visible: true, locked: false }];
const layers = sceneTracks(1);
tracks.push(...layers.tracks);
tracks.push({ id: "t_score", name: "countdown / room / ignition", type: "audio",
  index: tracks.length, visible: true, locked: false });
const clips = [...layers.clips, ...scenes.map((item) => item.group), {
  id: "score", name: "original score and countdown", trackId: "t_score", startMs: 0,
  durationMs: ms(FRAMES), mediaType: "audio", sourceType: "imported",
  status: "generated", locked: false, versions: [], currentAssetId: uri("score.wav"),
  volumeDb: -2, fadeInMs: 350, fadeOutMs: 400
}];

const bundle = {
  name: "T minus 30 — Northstar launch",
  description: "A 30-second fictional launch broadcast with three moving cameras, a live inset, a fault freeze, a recovery speed ramp, editable telemetry, and an audible countdown.",
  fps: FPS, width: W, height: H, durationMs: ms(FRAMES),
  videoUri: uri("broadcast.mp4"), posterUri: uri("poster.jpg"),
  document: { tracks, clips, markers: [
    { id: "fault", timeMs: ms(561), label: "Fault / freeze" },
    { id: "resume", timeMs: ms(660), label: "Ignition" },
    { id: "ascent", timeMs: ms(780), label: "Ascent" }
  ] }
};
const out = join(dirname(fileURLToPath(import.meta.url)), "../../packages/base-nodes/nodetool/examples/timelines/t-minus-30.timeline.json");
writeFileSync(out, `${JSON.stringify(bundle)}\n`);
console.log(`${clips.length} clips, ${tracks.length} tracks -> ${out}`);
