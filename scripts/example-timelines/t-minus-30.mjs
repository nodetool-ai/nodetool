// T minus 30: a fictional launch broadcast assembled from three original
// moving camera feeds, a local score, and timeline-native graphics.
//
// `python3 scripts/example-timelines/t-minus-30-media.py` regenerates source
// media on macOS using Pillow, ffmpeg, and the system Alex voice.
// `node scripts/example-timelines/build.mjs t-minus-30` writes the document.
// `node scripts/render-example-timeline.mjs t-minus-30 --poster-frame 805`
// renders the deliverable.
//
// Frames are at 30 fps. Source time is in absolute milliseconds for remapped
// video. The score runs independently through the fault freeze.
//
// This piece is footage-first: three video feeds and about fifty text
// overlays, all placed at fixed absolute positions rather than laid out by
// container — the frame is a broadcast HUD, not kinetic type, so there is
// nothing here for `stack`/`row`/`beside` to do.
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
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1280, H = 720, FPS = 30, FRAMES = 900;
const f = (frames) => frames / FPS; // a frame count from the original cut, as seconds
const msFor = (frames) => Math.round((frames / FPS) * 1000);
const span = (from, to) => ({ at: f(from), dur: f(to - from + 1) }); // inclusive frame range, as at/dur

const CYAN = "#7de5ea", WHITE = "#eef7f5", MUTED = "#9ab7bd";
const AMBER = "#ffbc79", RED = "#ff6c72", DARK = "#08151d";
const MONO = "JetBrains Mono";
const uri = (name) => `package://nodetool-base/timelines/t-minus-30/${name}`;

const v = video({ width: W, height: H, fps: FPS, fonts: { body: MONO } });

/** Every caption in this HUD carries the same dark keyline stroke, for legibility over moving footage. */
function text(s, str, o = {}) {
  return s.text(str, { ...o, style: { stroke: { color: "#06131b", widthPx: 2 }, ...o.style } });
}

/** A cut of camera footage: muted, source-timed, and placed like the other elements. */
function feed(s, name, from, to, sourceFrame, options = {}) {
  return s.video(uri(`${name}.mp4`), {
    name: `${name} camera`, ...span(from, to),
    x: options.x ?? 0, y: options.y ?? 0, s: options.scale ?? 1,
    borderRadius: options.radius ?? 0,
    in: f(sourceFrame), mute: true, remap: options.remap
  });
}

const scene = v.scene("broadcast", f(FRAMES), (s) => {
  // The program cuts among independent camera files. The pad source keeps
  // moving while the scene changes; only the fault clip has a time remap.
  feed(s, "control", 0, 209, 0);
  feed(s, "pad", 210, 419, 180);
  feed(s, "engine", 420, 539, 30);
  feed(s, "pad", 540, 659, 540, {
    remap: [
      { t: 0, sourceAt: f(540) },
      { t: 0.25, sourceAt: f(561) },
      { t: 0.73, sourceAt: f(561) },
      { t: 1, sourceAt: f(615), ease: "easeIn" }
    ]
  });
  feed(s, "pad", 660, 779, 615);
  feed(s, "pad", 780, 899, 735);

  // One small live camera continues through the cuts and remains active while
  // the program feed freezes. A dark frame makes the inset legible over smoke.
  s.rect(362, 210, DARK, { name: "inset frame", ...span(210, 779), x: 418, y: -189, stroke: "#5da5ae", sw: 3, r: 8 });
  feed(s, "control", 210, 449, 0, { x: 418, y: -189, scale: 0.27, radius: 6 });
  feed(s, "pad", 450, 539, 450, { x: 418, y: -189, scale: 0.27, radius: 6 });
  feed(s, "control", 540, 659, 120, { x: 418, y: -189, scale: 0.27, radius: 6 });
  feed(s, "engine", 660, 779, 90, { x: 418, y: -189, scale: 0.27, radius: 6 });

  // Broadcast frame. The lower caption strip has no text baked into the camera
  // files, so it remains sharp and editable across every program cut.
  s.rect(W, 88, "rgba(3,13,20,0.86)", { name: "top matte", y: -316 });
  s.rect(W, 126, "rgba(3,13,20,0.86)", { name: "lower matte", y: 297 });
  s.rect(4, 520, CYAN, { name: "left rule", x: -608, y: 5 });
  s.rect(1120, 2, "rgba(125,229,234,0.35)", { name: "lower rule", y: 231 });
  // The flight identity and the live bug read as one row, opposite ends of
  // the same line.
  const programIdentity = text(s, "NORTHSTAR / FLIGHT 01", {
    size: 25, weight: 600, color: WHITE, name: "program identity", tracking: 3 / 25
  });
  const liveBug = text(s, "LIVE  •  PAD 03", {
    size: 22, weight: 600, color: CYAN, name: "live bug", tracking: 2 / 22
  });
  s.row([programIdentity, liveBug], { justify: "between", align: "center", width: 1150, at: { x: 0, y: -315 } });
  text(s, "CAM 02 / AUX", {
    size: 19, weight: 500, color: CYAN, name: "inset label", ...span(210, 779), x: 286, y: -268,
    anchor: "left", mw: 0.2, tracking: 2 / 19
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
    // The camera label and the status chip share a row, opposite ends of the
    // same line; the caption below stays free (its own left-flowing line).
    const cameraLbl = text(s, camera, { size: 18, weight: 600, color: CYAN, name: `camera ${from}`, tracking: 2 / 18 });
    const statusLbl = text(s, status, { size: 19, weight: 600, color: from === 540 ? RED : AMBER, name: `status ${from}`, tracking: 1 / 19 });
    s.row([cameraLbl, statusLbl], { justify: "between", align: "center", width: 1143, start: f(from), dur: f(to - from + 1), at: { x: 0, y: 260 } });
    text(s, line, { size: 30, weight: 500, color: WHITE, name: `caption ${from}`, ...span(from, to), x: -570, y: 304,
      anchor: "left", mw: 0.69 });
  }

  // The large count is assembled as frame-aligned clips. It stays readable
  // during the freeze, then advances to zero on the ignition cut.
  for (let second = 0; second < 30; second++) {
    const count = second < 12 ? null : second < 18 ? 22 - second : second <= 20 ? null : second <= 25 ? 25 - second : null;
    const active = second >= 18 && second <= 20 ? "HOLD" : second >= 26 ? "ASCENT" :
      count === null ? "PRE-LAUNCH" : `T − ${String(count).padStart(2, "0")}`;
    const from = second * FPS, to = from + FPS - 1;
    text(s, active, { size: 49, weight: 600, color: second >= 18 && second <= 20 ? RED : WHITE,
      name: `count ${second}`, ...span(from, to), x: -560, y: -209, anchor: "left", mw: 0.36 });
  }

  const fault = s.rect(W, H - 214, "rgba(120,18,23,0.15)", { name: "fault red wash", ...span(561, 614), y: -17 });
  fault.animate({ opacity: [0, 1, "linear"] }, { at: 0, dur: f(5) });
  const recovery = s.rect(W, H - 214, "rgba(255,188,121,0.22)", { name: "ignition flash", ...span(660, 670), y: -17 });
  recovery.animate({ opacity: [1, 0, "linear"] }, { at: 0, dur: f(10) });
});

v.series([scene]);

v.audio(uri("score.wav"), { id: "score", name: "original score and countdown", trackId: "t_score", volume: -2, fadeIn: 0.35, fadeOut: 0.4 });

v.document({
  markers: [
    { id: "fault", timeMs: msFor(561), label: "Fault / freeze" },
    { id: "resume", timeMs: msFor(660), label: "Ignition" },
    { id: "ascent", timeMs: msFor(780), label: "Ascent" }
  ]
});

const saved = await v.save(nodetool.timelines, { name: "T minus 30 — Northstar launch" });
await output("timeline", {
  name: "T minus 30 — Northstar launch",
  description: "A 30-second fictional launch broadcast with three moving cameras, a live inset, a fault freeze, a recovery speed ramp, editable telemetry, and an audible countdown.",
  videoUri: uri("broadcast.mp4"), posterUri: uri("poster.jpg"),
  ...saved
});
