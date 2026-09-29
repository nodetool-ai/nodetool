// Voltra: a 23-second launch ad for a fictional electric motorcycle, built on
// fifteen generated stills and as many timeline features as one ad can carry.
//
// `node scripts/example-timelines/build.mjs voltra` writes the shipped bundle
// packages/base-nodes/nodetool/examples/timelines/voltra.timeline.json.
// `node scripts/example-timelines/voltra-stills.mjs [name…]` regenerates the
// stills (see voltra-stills.mjs for every prompt and seed, stills.mjs for the model).
// `node scripts/render-example-timeline.mjs voltra` renders its video and poster.
//
// Every time value below is seconds, local to the scene that authored it —
// `video()`'s `v.series()` is the only place a scene's position in the whole
// video is decided (see the sandbox-timeline SKILL.md). `f(frames)` converts a
// frame count from the original 30fps, 120 BPM cut (one beat = 15 frames) to
// seconds, so the beat math below still reads the way the reference was cut.
// Positions are px from the frame centre, or from the parent when reparented.
//
// Coverage. One frame per row, each checked in the encoded MP4. The music is
// mixed into the video from the document's MIDI tracks.
//
// | Feature | Clip | Frame |
// |---|---|---|
// | Slow push-in | `street` (S1) | 40 |
// | Punch-in on the beat | `motor`, `dash`, `tyre`, `rider` (S2) | 106 |
// | Parallax plates at three speeds | `bokeh`, `rain`, `road` (S3) | 250 |
// | 3D tilt, `rotationX`/`rotationY` + `perspective` | `hero-rig` (S5) | 532 |
// | `crop` reframing | `panel-*` (S2), `card-photo-*` (S4) | 180 |
// | Split screen of details | `board` (S2) | 180 |
// | `borderRadius` spec card | `card-photo-0` (S4) | 410 |
// | `rect` mask, feathered | `road` (S3) | 250 |
// | `ellipse` mask, feathered | `headlight` (S1), `hero-glow` (S5) | 60 |
// | `path` mask | `tyre` (S2) | 125 |
// | Inverted mask | `rooftop-blur` (S6) | 660 |
// | Animated wipe mask (headlight reveal) | `headlight` (S1) | 48 |
// | Alpha track matte: photo inside "R1" | `r1-fill` ← `r1-type` (S4) | 372 |
// | Luma matte from a gradient | `side` ← `side-fade` (S4) | 410 |
// | `lut` + `curves` teal-and-orange grade, repeated as a scene-scoped `s.adjust()` on S1–S3 | `night-grade` adjustment | 60 |
// | Duotone lift, per clip `color` effect (was a track effect) | `card-photo-*` (S4) | 410 |
// | `levels` | `rooftop`, `rooftop-blur` (S6) | 660 |
// | `vignette`, `grain`, `sharpen` | `finish` adjustment | 560 |
// | Adjustment grading S1–S3 | `night-grade` | 250 |
// | Adjustment scoped inside a group | `halftone` in S4 | 410 |
// | `glow` on headlight and neon | `headlight`, `silent` (S1), `hero-glow` (S5) | 75 |
// | `directionalBlur` | `tyre` (S2), `road` (S3) | 125 |
// | `lensDistortion` | `tunnel` (S3) | 320 |
// | `dropShadow` | `panel-*` (S2), `card-photo-*` (S4) | 410 |
// | Stylize `rgbSplit` | montage stills (S2), `violent` (S3) | 106 |
// | Stylize `displacement` and `zoomBlur` | `tunnel` (S3) | 320 |
// | Stylize `halftone` | `halftone` adjustment (S4) | 410 |
// | Stylize `lightRays` | `hero` (S5) | 560 |
// | `screen` blend: rain, headlight, smoke, duotone lift | `rain-s1`, `headlight`, `smoke`, `duo-*` | 60 |
// | `multiply` blend: crush the sky under the title | `sky-crush` (S1) | 75 |
// | `overlay` blend: neon streaks on the road | `road` (S3) | 250 |
// | `glitch` transition between scenes | S1 → S2 | 92 |
// | `slide` transition on a single image | `tyre` (S2) | 120 |
// | `push` transition on a single image | `rider` (S2) | 136 |
// | `zoom` transition on a single image | `tunnel` (S3) | 287 |
// | `wipe` transition between scenes | S3 → S4 | 363 |
// | `crossfade` transition | `side` (S4) | 387 |
// | `push` and `zoomBlur` between card groups | `card-1`, `card-2` (S4) | 480 |
// | `dipToColor` transition | S4 → S5 | 529 |
// | `lightLeak` transition | S5 → S6 | 604 |
// | Music with a tempo (120 BPM MIDI tracks, cuts on the beat) | `drums`, `bass`, montage stills (S2) | 105 |
// | Staggered title, by line and by word | `title`, `tagline` (S5) | 545 |
// | Typewriter with caret | `label-*` (S4) | 397 |
// | Count-up numbers, zero-padded | `number-*` (S4), `countdown` (S6) | 410 |
// | Caption field on a transparent clip (no bare "video" clip helper) | `ride-caption` (S3) | 240 |
// | Text background scrim | `cta` (S6) | 680 |
// | Bundled fonts only (Bebas Neue, Inter, JetBrains Mono) | every text clip | 410 |
// | Gauge arc drawn with `trimEnd` from 0 | `arc-*` (S4) | 400 |
// | Dashed stroke | `track-*` (S4), `date-rule` (S6) | 410 |
// | Markers popping in from scale 0 | `tick-*` (S4) | 397 |
// | `camera2d` move across a wide board | `board` (S2) | 180 |
//
// Remaining gap against the old API (reported, not worked around in index.js):
// - `colorCorrection` is a *track* effect only; the duotone grade that used to
//   live on `card-photo-*`'s track is now the per-clip `color` effect
//   (`ClipColorEffect` has the identical fields), which is a clean swap, not
//   really a loss — but it does mean a grade can no longer be scoped to one
//   scene's dedicated track, only to the clips inside it, because scenes now
//   share banked tracks across the whole piece.
// - No bare "video"/caption-only clip helper — `ride-caption`'s words ride on
//   a fully transparent `rect`, since `caption` is a pass-through field on
//   any clip type.
// (`textStyle.fill`/`.shadow`/`.background`/`.lineHeight`, `count()`'s
// `padTo`, a typewriter/caret primitive, `v.midi`/`v.beats`, and
// scene-scoped `s.adjust()` all landed in the API since the first pass of
// this port and are used below.)
import { video, hash, rad } from "@nodetool-ai/sandbox-timeline";

const W = 1920, H = 1080, FPS = 30, BPM = 120;
const f = (frames) => frames / FPS;

const INK = "#05070a", TEXT = "#f4f7fb", DIM = "#9aa7b4";
const TEAL = "#2de2e6", ORANGE = "#ff8a3d", PINK = "#ff3d81";
const HEAT = { type: "linear", angle: 0, stops: [{ offset: 0, color: ORANGE }, { offset: 1, color: PINK }] };
const DISPLAY = "display", MONO = "mono";
const EASE_IO = "cubic-bezier(0.65,0,0.35,1)", SNAP = "cubic-bezier(0.16,1,0.3,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: INK, text: TEXT, dim: DIM, accent: TEAL },
  fonts: { display: "Bebas Neue", mono: "JetBrains Mono", body: "Inter" }
});

const stillImage = (s, name, o = {}) => s.image(`package://nodetool-base/timelines/voltra/${name}.jpg`, { name, ...o });

/**
 * Rain that falls: the plate jumps to a new offset every two frames, the way
 * a flicker of streaks reads in live action. A scrolling tile showed its
 * seam, because the generated plate is denser at the top.
 */
function rainShimmer(clip, seed, reach = 140) {
  const frames = Math.round((clip.durationMs / 1000) * FPS);
  const steps = Math.max(2, Math.floor(frames / 2));
  const waypoints = (axis) => Array.from({ length: steps + 1 }, (_, k) => [
    k / steps,
    Math.round((hash(seed * 97 + k * 3 + (axis === "offsetX" ? 1 : 2)) - 0.5) * 2 * reach),
    k ? "hold" : undefined
  ]);
  return clip.animate({ offsetX: waypoints("offsetX"), offsetY: waypoints("offsetY") }, { at: 0, dur: clip.durationMs / 1000 });
}

/** Text or a shape that slams in: large to rest size, out of a blur. */
function slam(clip, atSec, from = 1.4) {
  clip.enter({ from: { scale: from }, at: atSec, dur: f(8), ease: SNAP });
  clip.enter({ from: { blur: 24 }, at: atSec, dur: f(8), ease: "out" });
  clip.enter({ from: { opacity: 0 }, at: atSec, dur: f(3), ease: "linear" });
  return clip;
}

// ---------------------------------------------------------------------------
// The grade

/**
 * A 9³ teal-and-orange `.cube`: shadows lean teal, highlights lean orange,
 * a gentle S-curve on luma. Generated so the table is readable in review.
 */
function tealOrangeCube(size = 9) {
  const lines = ["TITLE \"Voltra night\"", `LUT_3D_SIZE ${size}`];
  const clamp = (val) => Math.min(1, Math.max(0, val));
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const [R, G, B] = [r, g, b].map((val) => val / (size - 1));
        const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        const lo = (1 - l) ** 2, hi = l ** 2;
        const s = (val) => val + 0.12 * (val - 0.5) * (1 - Math.abs(2 * val - 1));
        const out = [s(R + hi * 0.07 - lo * 0.05), s(G + lo * 0.015), s(B + lo * 0.07 - hi * 0.06)].map((val) => clamp(val).toFixed(4));
        lines.push(out.join(" "));
      }
    }
  }
  return lines.join("\n");
}

/** The teal-and-orange grade, scoped to whichever scene calls it (S1–S3). */
function nightGrade(s) {
  s.adjust([
    { id: "lut", type: "lut", enabled: true, cube: tealOrangeCube(), intensity: 0.85 },
    { id: "crv", type: "curves", enabled: true, master: [{ x: 0, y: 0 }, { x: 0.25, y: 0.19 }, { x: 0.75, y: 0.83 }, { x: 1, y: 1 }], b: [{ x: 0, y: 0.04 }, { x: 1, y: 0.96 }] }
  ], { name: "night-grade" });
}

// ---------------------------------------------------------------------------
// S1 Cold open (95 frames): the dark street, then a headlight flickers on.

const s1 = v.scene("S1", f(95), (s) => {
  const street = stillImage(s, "street", { s: 1.06, dur: f(95) });
  street.animate({ scale: [[0, 1], [1, 1.1, "linear"]] }, { at: 0, dur: f(95) });
  street.animate({ brightness: [[0, -0.55], [0.35, 0, "out"], [1, 0, "linear"]] }, { at: 0, dur: f(95) });
  // The sky over the street is the brightest area the title sits on. A
  // multiplied gradient crushes it to black without greying the neon.
  s.rect(W, H, { type: "linear", angle: 90, stops: [{ offset: 0, color: "#1a2530" }, { offset: 0.55, color: "#ffffff" }, { offset: 1, color: "#ffffff" }] }, { name: "sky-crush", blendMode: "multiply" });

  // The headlight bar, screened over the street so only its light lands. The
  // feathered ellipse keeps the dark bodywork out; the wipe reveals the bar
  // left to right while the opacity flickers like a cold LED warming up.
  const light = stillImage(s, "headlight", {
    name: "headlight", at: f(42), y: -40, s: 0.9, blendMode: "screen",
    mask: { kind: "ellipse", x: 0.02, y: 0.22, width: 0.96, height: 0.42, featherPx: 90 },
    effects: [{ id: "hg", type: "glow", enabled: true, radius: 48, intensity: 1.3, color: "#bff7ff" }]
  });
  light.animate({ wipeProgress: [0, 1, "out"] }, { at: f(3), dur: f(10) });
  light.animations.at(-1).custom.mask = { direction: "left", softness: 0.12 };
  const flicker = [[0, 0], [0.12, 1, "hold"], [0.2, 0.15, "hold"], [0.3, 1, "hold"], [0.42, 0.35, "hold"], [0.5, 1, "hold"], [1, 1, "linear"]];
  light.animate({ opacity: flicker }, { at: f(3), dur: f(20) });

  rainShimmer(stillImage(s, "plate-rain", { name: "rain-s1", blendMode: "screen", opacity: 0.4, s: 1.3, dur: f(95) }), 1);

  const silent = s.text("SILENT.", {
    name: "silent", font: DISPLAY, size: 240, weight: 400, color: TEAL, y: 300, tracking: 0.08, at: f(62),
    effects: [{ id: "ng", type: "glow", enabled: true, radius: 30, intensity: 1.1, color: TEAL }]
  });
  silent.enter({ from: { offsetY: 30 }, at: 0, dur: f(10), ease: SNAP, by: "character", staggerMs: 35 });
  silent.enter({ from: { opacity: 0 }, at: 0, dur: f(10), ease: "out", by: "character", staggerMs: 35 });
  nightGrade(s);
});

// ---------------------------------------------------------------------------
// S2 Details (119 frames): four macros cut on the beat, then a board of all
// five that the camera pans across.

const MONTAGE = [
  { still: "motor", word: "TORQUE.", label: "02 / AXIAL-FLUX MOTOR" },
  { still: "dash", word: "DATA.", label: "03 / 5\" TFT DASH" },
  { still: "tyre", word: "GRIP.", label: "04 / 17\" STREET SLICKS" },
  { still: "rider", word: "YOU.", label: "05 / THE RIDER" }
];
const montageIds = [];

const s2 = v.scene("S2", f(119), (s) => {
  s.rect(W, H, INK, { name: "ink" });

  // One beat per macro, laid on the tempo grid — 15 frames at 120 BPM/30fps.
  MONTAGE.forEach(({ still, word, label }, i) => {
    const from = i * 15;
    // Dash and tyre run three and four frames past their beat, under the
    // slide and the push that bring the next still in.
    const to = i === MONTAGE.length - 1 ? 59 : from + 14 + [0, 3, 4, 0][i];
    const clip = stillImage(s, still, {
      name: still, id: `m-${still}`, at: f(from), dur: f(to - from),
      effects: [
        { id: `rs${i}`, type: "stylize", enabled: true, mode: "rgbSplit", amount: 0, angle: 0 },
        ...(still === "tyre" ? [{ id: "db", type: "directionalBlur", enabled: true, radius: 14, angle: 0 }] : [])
      ],
      ...(still === "tyre" && { mask: { kind: "path", d: "M0.10 0 L1 0 L0.90 1 L0 1 Z" } }),
      ...(still === "tyre" && { transitionIn: { type: "slide", durationMs: 100, direction: "right", easing: SNAP } }),
      ...(still === "rider" && { transitionIn: { type: "push", durationMs: 130, direction: "up", easing: SNAP } })
    });
    montageIds.push(clip.id);
    // A punch-in on the beat, then a slow settle; the RGB split rides the hit.
    clip.animate({ scale: [1.28, 1.08, SNAP] }, { at: 0, dur: f(5) });
    clip.animate({ scale: [1, 1.035, "linear"] }, { at: f(5), dur: f(to - from - 5) });
    clip.tween(`effect.rs${i}.amount`, [[0, 18], [1, 0, "out"]], { at: 0, dur: f(6) });

    const wordTo = Math.min(to, from + 14);
    const word_ = s.text(word, { name: `word-${still}`, font: DISPLAY, size: 200, weight: 400, color: TEXT, anchor: "left", mw: 0.5, at: f(from), dur: f(wordTo - from), tracking: 0.02 });
    slam(word_, 0, 1.25);
    const label_ = s.text(label, { name: `label-${still}`, font: MONO, size: 30, weight: 500, color: TEAL, anchor: "left", mw: 0.4, at: f(from), dur: f(wordTo - from), tracking: 2 / 30 });
    s.stack([label_, word_], { align: "start", anchor: "left", at: { x: -858, y: 270 }, gap: 24 });
  });

  // The board: five portrait crops side by side, far wider than the frame.
  // The camera pans across it; the bokeh sits far back, so it drifts slower.
  const bokeh = stillImage(s, "plate-bokeh", { name: "board-bokeh", at: f(60), opacity: 0.25, s: 2.7, tx: { depthPx: -1400 }, effects: [{ id: "bb", type: "blur", enabled: true, radius: 14 }] });
  bokeh.enter({ from: { opacity: 0 }, at: 0, dur: f(8), ease: "linear" });
  const board = s.group({ name: "board", at: f(60) });
  ["headlight", "motor", "dash", "tyre", "rider"].forEach((still, i) => {
    const x = (i - 2) * 520;
    const panel = stillImage(s, still, {
      name: `panel-${still}`, parent: board.id, x, y: 10, s: 0.6,
      crop: { left: still === "rider" ? 0.22 : 0.3, right: still === "rider" ? 0.38 : 0.3, top: 0, bottom: 0 },
      borderRadius: 40,
      effects: [{ id: `ps${i}`, type: "dropShadow", enabled: true, offsetX: 0, offsetY: 30, blur: 60, color: "rgba(0,0,0,0.7)" }]
    });
    panel.enter({ from: { offsetY: 60 }, at: f(i * 3), dur: f(12), ease: SNAP });
    panel.enter({ from: { opacity: 0 }, at: f(i * 3), dur: f(12), ease: "out" });
    const tag = s.text(`0${i + 1}`, { name: `panel-tag-${still}`, parent: board.id, font: MONO, size: 30, weight: 500, color: TEAL, x: x - 210, y: -290, anchor: "left", mw: 0.05 });
    tag.enter({ from: { opacity: 0 }, at: f(4 + i * 3), dur: f(10), ease: "out" });
  });
  const strap = s.text("EVERY PART MADE FOR THE NIGHT", { name: "board-strap", parent: board.id, size: 34, weight: 600, color: TEXT, y: 390, tracking: 0.3 });
  strap.enter({ from: { opacity: 0 }, at: f(16), dur: f(14), ease: "out" });
  strap.enter({ from: { offsetY: 20 }, at: f(16), dur: f(14), ease: SNAP });
  nightGrade(s);
});

// ---------------------------------------------------------------------------
// S3 The ride (154 frames): parallax plates over the ride shot, then the tunnel.

const s3 = v.scene("S3", f(154), (s) => {
  const ride = stillImage(s, "ride", { name: "ride", dur: f(80) });
  ride.animate({ scale: [[0, 1.04], [1, 1.12, "linear"]] }, { at: 0, dur: f(80) });
  // Tunnel: the camera pushes in on a bulging lens, the air shimmering.
  const tunnel = stillImage(s, "tunnel", {
    name: "tunnel", at: f(73),
    transitionIn: { type: "zoom", durationMs: 200, easing: "easeIn" },
    effects: [
      { id: "ld", type: "lensDistortion", enabled: true, amount: 0.28 },
      { id: "dp", type: "stylize", enabled: true, mode: "displacement", amount: 0.3, scale: 6, animate: true, seed: 5 },
      { id: "zb", type: "stylize", enabled: true, mode: "zoomBlur", amount: 1.5 }
    ]
  });
  tunnel.animate({ scale: [[0, 1], [1, 1.45, "in"]] }, { at: 0, dur: f(154 - 73) });

  // Three plates, three speeds: bokeh far and slow, rain mid, road near and fast.
  const bokeh = stillImage(s, "plate-bokeh", { name: "bokeh", blendMode: "screen", opacity: 0.28, s: 1.2, dur: f(75), repeater: { count: 2, positionStep: { x: W * 1.2, y: 0 }, timeStepMs: 0 } });
  bokeh.loop({ offsetX: [[0, 0], [1, -W * 1.2, "linear"]] }, f(120));
  rainShimmer(stillImage(s, "plate-rain", { name: "rain", blendMode: "screen", opacity: 0.5, s: 1.5, tx: { rotation: rad(-10) }, dur: f(154) }), 2, 180);
  const road = stillImage(s, "plate-road", {
    name: "road", blendMode: "overlay", opacity: 0.6, dur: f(75),
    repeater: { count: 2, positionStep: { x: W, y: 0 }, timeStepMs: 0 },
    mask: { kind: "rect", x: 0, y: 0.8, width: 1, height: 0.2, featherPx: 60 },
    effects: [{ id: "rdb", type: "directionalBlur", enabled: true, radius: 40, angle: 0 }],
    motionBlur: { samplesPerFrame: 8, shutterAngle: 300 }
  });
  road.loop({ offsetX: [[0, 0], [1, -W, "linear"]] }, f(12));

  // What the rider hears: nothing. A caption, word-timed to the beat, on a
  // transparent clip — there's no bare caption-only clip helper.
  const words = [["No", 15], ["noise.", 22], ["No", 37], ["fumes.", 44], ["Just", 60], ["pull.", 67]];
  s.rect(W, H, null, {
    name: "ride-caption", at: f(15), dur: f(86 - 15), opacity: 0,
    caption: {
      words: words.map(([word, fr], i) => ({ word, startMs: Math.round((f(fr) - f(15)) * 1000), endMs: Math.round((f(i < words.length - 1 ? words[i + 1][1] : 86) - f(15)) * 1000) })),
      style: { fontSizeFrac: 0.05, color: "rgba(244,247,251,0.55)", activeColor: TEXT, bottomMarginFrac: 0.1, background: { color: "rgba(5,7,10,0.55)", paddingPx: 18, radiusPx: 12 } }
    }
  });

  const violent = s.text("VIOLENT.", {
    name: "violent", font: DISPLAY, size: 280, weight: 400, color: TEXT, at: f(120), tracking: 0.06, style: { fill: HEAT },
    effects: [{ id: "vs", type: "stylize", enabled: true, mode: "rgbSplit", amount: 0, angle: 0 }]
  });
  slam(violent, 0, 1.6);
  violent.tween("effect.vs.amount", [[0, 24], [1, 0, "out"]], { at: 0, dur: f(10) });
  nightGrade(s);
});

// ---------------------------------------------------------------------------
// S4 The specs (174 frames): "R1" filled with the motor, then three spec cards.

const SPECS = [
  { still: "tyre", crop: { left: 0.3, right: 0.34, top: 0, bottom: 0 }, label: "0–100 KM/H", from: 0, to: 2.9, decimals: 1, unit: "SECONDS", fraction: 0.9 },
  { still: "motor", crop: { left: 0.32, right: 0.32, top: 0, bottom: 0 }, label: "RANGE", from: 0, to: 480, decimals: 0, unit: "KM · CITY", fraction: 0.8 },
  { still: "ride", crop: { left: 0.42, right: 0.22, top: 0, bottom: 0 }, label: "TOP SPEED", from: 0, to: 240, decimals: 0, unit: "KM/H", fraction: 0.96 }
];
// Was a track effect (`trackEffects`); `ClipColorEffect` (type "color") has
// the identical fields, so the grade moves onto each photo's own effects.
const DUOTONE = { brightness: 0.08, contrast: 1.6, saturation: 0, hue: 0, temperature: 1, tint: 0.15, shadows: -0.25, highlights: 0.15 };

function specCard(s, spec, i, localFrom, localTo) {
  const dur = f(localTo - localFrom);
  const card = s.group({
    name: `card-${i}`, at: f(localFrom), dur,
    ...(i === 1 && { transitionIn: { type: "push", durationMs: 160, direction: "up", easing: SNAP } }),
    ...(i === 2 && { transitionIn: { type: "zoomBlur", durationMs: 160, blur: 1, easing: "easeIn" } })
  });
  // Left: the detail, cropped to a portrait card, graded orange-on-black,
  // then lifted to teal in the shadows by a screened plate.
  const photo = stillImage(s, spec.still, {
    name: `card-photo-${i}`, parent: card.id, x: -470, y: 10, s: 0.6, crop: spec.crop, borderRadius: 48,
    effects: [
      { id: `cc${i}`, type: "color", enabled: true, ...DUOTONE },
      { id: `cs${i}`, type: "dropShadow", enabled: true, offsetX: 0, offsetY: 36, blur: 70, color: "rgba(0,0,0,0.75)" }
    ]
  });
  const cw = Math.round(W * (1 - spec.crop.left - spec.crop.right) * 0.6);
  s.rect(cw, 648, "#032a33", { name: `duo-${i}`, parent: card.id, x: -470, y: 10, r: 29, blendMode: "screen" });
  s.text(`0${i + 1}`, { name: `card-index-${i}`, parent: card.id, font: MONO, size: 30, weight: 500, color: TEAL, anchor: "left", mw: 0.05, x: -470 - cw / 2 + 28, y: -290 });
  photo.enter({ from: { scale: 0.9 }, at: 0, dur: f(12), ease: SNAP });

  // Right: a gauge. The dashed track is 270°; the arc draws on to the spec's
  // fraction of it from exactly 0, and the ticks pop in from scale 0.
  const gx = 430, gy = 30, R = 250, start = 135;
  s.ellipse(2 * R, null, { name: `track-${i}`, parent: card.id, x: gx, y: gy, stroke: "rgba(154,167,180,0.45)", sw: 6, tx: { rotation: rad(start) }, shape: { trimEnd: 0.75, dash: [6 / W, 14 / W] } });
  const arc = s.ellipse(2 * R, null, {
    name: `arc-${i}`, parent: card.id, x: gx, y: gy, stroke: ORANGE, sw: 14, tx: { rotation: rad(start) }, shape: { lineCap: "round" },
    effects: [{ id: `ag${i}`, type: "glow", enabled: true, radius: 18, intensity: 0.9, color: ORANGE }]
  });
  const span = localTo - localFrom, drawTo = 0.75 * spec.fraction;
  // Stretched over the whole card: an "in" that ends away from rest would
  // hold the full ring until its window opened.
  arc.animate({ trimEnd: [[0, 0], [4 / span, 0, "linear"], [26 / span, drawTo, EASE_IO], [1, drawTo, "linear"]] }, { at: 0, dur });
  for (let k = 0; k <= 6; k++) {
    const a = rad(start + (270 * k) / 6);
    const tick = s.ellipse(12, k / 6 <= spec.fraction ? TEXT : DIM, { name: `tick-${i}-${k}`, parent: card.id, x: gx + (R + 34) * Math.cos(a), y: gy + (R + 34) * Math.sin(a) });
    tick.enter({ from: { scale: 0 }, at: f(4 + k * 2), dur: f(10), ease: "spring(260,14,1)" });
  }

  const label = s.text(spec.label, { name: `label-${i}`, parent: card.id, font: MONO, size: 40, weight: 500, color: TEAL, x: gx, y: -300, mw: 0.3, tracking: 3 / 40 });
  label.typewriter({ at: f(2), dur: f(12), caret: { color: TEAL, widthPx: 4, blinkPeriodMs: 500 } });
  const fmt = spec.decimals ? spec.to.toFixed(spec.decimals) : String(spec.to);
  const number = s.text(fmt, { name: `number-${i}`, parent: card.id, font: DISPLAY, size: 230, weight: 400, color: TEXT, x: gx, y: gy - 10, mw: 0.3 });
  number.count({ from: spec.from, to: spec.to, at: f(4), dur: f(22), decimals: spec.decimals, ease: EASE_IO });
  const unit = s.text(spec.unit, { name: `unit-${i}`, parent: card.id, size: 34, weight: 600, color: DIM, x: gx, y: gy + 120, mw: 0.3, tracking: 0.25 });
  unit.enter({ from: { opacity: 0 }, at: f(10), dur: f(10), ease: "out" });
}

const s4 = v.scene("S4", f(174), (s) => {
  s.rect(W, H, INK, { name: "ink" });

  // "R1": the huge type is an alpha matte, and the motor's copper fills it.
  const r1 = s.text("R1", { name: "r1-type", font: DISPLAY, size: 1000, weight: 400, color: "#ffffff", dur: f(30), y: 40, tracking: -0.02 });
  r1.enter({ from: { scale: 1.25 }, at: 0, dur: f(10), ease: SNAP });
  const fill = stillImage(s, "motor", { name: "r1-fill", dur: f(30), s: 1.3, matte: { sourceClipId: r1.id, mode: "alpha" } });
  fill.animate({ offsetX: [[0, -80], [1, 80, "linear"]] }, { at: 0, dur: f(30) });
  const kicker = s.text("VOLTRA R1  /  SPEC SHEET", { name: "r1-kicker", font: MONO, size: 30, weight: 500, color: TEAL, dur: f(30), y: -430, tracking: 4 / 30 });
  kicker.enter({ from: { opacity: 0 }, at: f(4), dur: f(10), ease: "out" });

  // Behind the cards: the side profile, faded out toward the type by a luma
  // matte cut from a gradient, and screened through a halftone adjustment
  // that treats this scene's surface only.
  const fade = s.rect(W, H, { type: "linear", angle: 0, stops: [{ offset: 0, color: "#ffffff" }, { offset: 0.45, color: "#8a8a8a" }, { offset: 0.8, color: "#000000" }] }, { name: "side-fade", at: f(25) });
  const side = stillImage(s, "side", { name: "side", at: f(25), transitionIn: { type: "crossfade", durationMs: 160, easing: "easeInOut" }, opacity: 0.55, x: -200, s: 1.05, matte: { sourceClipId: fade.id, mode: "luma" } });
  side.animate({ offsetX: [[0, 60], [1, -60, "linear"]] }, { at: 0, dur: f(174 - 25) });
  s.adjust([{ id: "ht", type: "stylize", enabled: true, mode: "halftone", amount: 1, scale: 7 }], { name: "halftone", at: f(25), opacity: 0.22 });

  specCard(s, SPECS[0], 0, 30, 78);
  specCard(s, SPECS[1], 1, 73, 123);
  specCard(s, SPECS[2], 2, 118, 174);
});

// ---------------------------------------------------------------------------
// S5 The reveal (80 frames): the hero tilts flat under light rays, then the
// lock-up.

const s5 = v.scene("S5", f(80), (s) => {
  s.rect(W, H, INK, { name: "ink" });
  const rig = s.group({ name: "hero-rig", tx: { perspective: 1800 } });
  rig.enter({ from: { rotationY: -26 }, at: 0, dur: f(32), ease: SNAP });
  rig.enter({ from: { rotationX: 9 }, at: 0, dur: f(32), ease: SNAP });
  rig.enter({ from: { scale: 0.86 }, at: 0, dur: f(32), ease: SNAP });
  rig.animate({ scale: [1, 1.035, "linear"] }, { at: f(32), dur: f(48) });
  const hero = stillImage(s, "hero", {
    name: "hero", parent: rig.id,
    effects: [
      { id: "lgg", type: "liftGammaGain", enabled: true, lift: [0, 0.015, 0.035], gamma: [1, 1, 1.03], gain: [1.06, 1, 0.94] },
      { id: "lr", type: "stylize", enabled: true, mode: "lightRays", amount: 0, scale: 1.6, angle: 0, color: "#9ff6ff" }
    ]
  });
  hero.tween("effect.lr.amount", [[0, 0], [0.3, 0.4, "out"], [1, 0.28, "linear"]], { at: 0, dur: f(80) });
  hero.tween("effect.lr.angle", [[0, 0], [1, 22, "linear"]], { at: 0, dur: f(80) });
  // The headlight bar, isolated by a feathered ellipse and bloomed.
  stillImage(s, "hero", {
    name: "hero-glow", parent: rig.id, blendMode: "screen",
    mask: { kind: "ellipse", x: 0.625, y: 0.2, width: 0.16, height: 0.17, featherPx: 40 },
    effects: [{ id: "hgl", type: "glow", enabled: true, radius: 60, intensity: 1.6, color: "#c8fbff" }]
  });
  const smoke = stillImage(s, "plate-smoke", { name: "smoke", blendMode: "screen", opacity: 0.22, y: 260, s: 1.2 });
  smoke.animate({ offsetX: [[0, -120], [1, 120, "linear"]] }, { at: 0, dur: f(80) });

  // "SILENT. / VIOLENT." — a tight two-line lockup.
  const title = s.text("SILENT.\nVIOLENT.", { name: "title", font: DISPLAY, size: 150, weight: 400, color: TEXT, anchor: "left", mw: 0.4, x: -870, y: 200, at: f(16), tracking: 0.03, style: { lineHeight: 0.92 } });
  title.enter({ from: { offsetY: 50 }, at: 0, dur: f(12), ease: SNAP, by: "line", staggerMs: 160 });
  title.enter({ from: { opacity: 0 }, at: 0, dur: f(12), ease: "out", by: "line", staggerMs: 160 });
  const tagline = s.text("THE ELECTRIC STREET MACHINE", {
    name: "tagline", color: TEAL, anchor: "left", mw: 0.4, x: -866, y: 356, at: f(27), tracking: 0.28, size: 32, weight: 600,
    style: { shadow: { color: "rgba(0,0,0,0.85)", blurPx: 14, offsetX: 0, offsetY: 2 } }
  });
  tagline.enter({ from: { offsetY: 16 }, at: 0, dur: f(10), ease: SNAP, by: "word", staggerMs: 70 });
  tagline.enter({ from: { opacity: 0 }, at: 0, dur: f(10), ease: "out", by: "word", staggerMs: 70 });

  // Lock-up, top left: a bolt drawn on, the wordmark, and "R1" in a badge.
  const bolt = s.path([["M", -836, -436], ["L", -862, -384], ["L", -838, -384], ["L", -856, -336], ["L", -812, -398], ["L", -836, -398], ["L", -818, -436], ["Z"]], {
    name: "bolt", stroke: TEAL, sw: 5, fill: "rgba(45,226,230,0)",
    effects: [{ id: "bg", type: "glow", enabled: true, radius: 16, intensity: 1, color: TEAL }]
  });
  bolt.draw({ at: f(10), dur: f(14), ease: EASE_IO });
  const wordmark = s.text("VOLTRA", { name: "wordmark", font: DISPLAY, size: 110, weight: 400, color: TEXT, anchor: "left", mw: 0.2, x: -790, y: -386, tracking: 0.12 });
  wordmark.enter({ from: { opacity: 0 }, at: f(14), dur: f(12), ease: "out" });
  wordmark.enter({ from: { offsetX: -20 }, at: f(14), dur: f(12), ease: SNAP });
  const badge = s.group({ name: "r1-badge", x: -452, y: -388 });
  s.rect(96, 70, null, { name: "badge-frame", parent: badge.id, stroke: TEAL, sw: 3, r: 10 });
  s.text("R1", { name: "badge-r1", parent: badge.id, font: DISPLAY, size: 56, weight: 400, color: TEAL, mw: 0.06, y: 2 });
  badge.enter({ from: { scale: 0 }, at: f(20), dur: f(12), ease: "spring(220,15,1)" });
});

// ---------------------------------------------------------------------------
// S6 The drop (91 frames): a countdown to the date, then "Reserve now".

const s6 = v.scene("S6", f(91), (s) => {
  const roof = stillImage(s, "rooftop", { name: "rooftop", effects: [{ id: "lv", type: "levels", enabled: true, inBlack: 0.04, inWhite: 1, gamma: 0.85, outBlack: 0, outWhite: 0.72 }] });
  roof.animate({ scale: [[0, 1.12], [1, 1.02, "out"]] }, { at: 0, dur: f(91) });
  // Tilt-shift: a blurred copy everywhere except the band the type sits in.
  const roofBlur = stillImage(s, "rooftop", {
    name: "rooftop-blur",
    effects: [{ id: "rb", type: "blur", enabled: true, radius: 22 }, { id: "lv2", type: "levels", enabled: true, inBlack: 0.04, inWhite: 1, gamma: 0.85, outBlack: 0, outWhite: 0.6 }],
    mask: { kind: "rect", x: 0, y: 0.28, width: 1, height: 0.44, featherPx: 90, invert: true }
  });
  roofBlur.animate({ scale: [[0, 1.12], [1, 1.02, "out"]] }, { at: 0, dur: f(91) });
  s.rect(W, H, "rgba(5,7,10,0.35)", { name: "dim" });

  const drops = s.text("DROPS IN", { name: "drops-in", font: MONO, size: 34, weight: 500, color: TEAL, dur: f(40), y: -210, tracking: 8 / 34 });
  drops.enter({ from: { opacity: 0 }, at: f(4), dur: f(8), ease: "out" });
  const countdown = s.text("00 DAYS", { name: "countdown", font: DISPLAY, size: 300, weight: 400, color: TEXT, dur: f(40), y: -30, tracking: 0.02 });
  countdown.count({ from: 49, to: 0, at: f(4), dur: f(28), suffix: " DAYS", padTo: 2, ease: "in" });
  slam(countdown, f(4), 1.15);

  const date = s.text("11.14", { name: "date", font: DISPLAY, size: 380, weight: 400, color: TEXT, at: f(41), y: -60, tracking: 0.03, style: { fill: HEAT } });
  slam(date, 0, 1.5);
  const rule = s.rect(620, 4, null, { name: "date-rule", at: f(41), kind: "line", y: 120, stroke: DIM, sw: 3, shape: { x: 0.5 - 310 / W, y: 0.5, x2: 0.5 + 310 / W, y2: 0.5, dash: [10 / W, 10 / W] } });
  rule.draw({ at: f(2), dur: f(12), ease: EASE_IO });
  const when = s.text("SATURDAY  ·  LIMITED FIRST RUN", { name: "when", font: MONO, size: 30, weight: 500, color: DIM, at: f(43), y: 160, tracking: 4 / 30 });
  when.enter({ from: { opacity: 0 }, at: f(2), dur: f(10), ease: "out" });
  const cta = s.text("RESERVE NOW", {
    name: "cta", at: f(50), y: 300, color: INK, tracking: 0.18, size: 54, weight: 700,
    style: { background: { color: TEAL, paddingPx: 30, radiusPx: 44 } }
  });
  cta.enter({ from: { offsetY: 40 }, at: 0, dur: f(14), ease: "spring(180,18,1)" });
  cta.enter({ from: { opacity: 0 }, at: 0, dur: f(14), ease: "out" });
});
// This scene's own group fades out at its own end.
s6.group.animations = [{
  id: "s6-fade", role: "out", preset: "custom", delayMs: 0, durationMs: Math.round(f(10) * 1000),
  custom: { curves: [{ property: "opacity", keyframes: [{ t: 0, value: 1 }, { t: 1, value: 0, easing: "easeIn" }] }] }
}];

// ---------------------------------------------------------------------------
// Assembly
//
// A glitch and a wipe carry S1→S2 and S3→S4 into each other; S2→S3 is a hard
// cut. A dipToColor and a lightLeak carry S4→S5 and S5→S6.

v.series([
  s1,
  v.transition("glitch", 0.2, { amount: 0.8, easing: "linear" }),
  s2,
  s3,
  v.transition("wipe", 0.2, { direction: "left", softness: 0, easing: SNAP }),
  s4,
  v.transition("dipToColor", 0.3, { color: "#dff9ff", easing: "easeInOut" }),
  s5,
  v.transition("lightLeak", 0.33, { color: ORANGE, scale: 1.2, seed: 4, easing: "easeInOut" }),
  s6
]);

// ---------------------------------------------------------------------------
// The music: DR-1 drums and a BL-1 acid line, played by the editor and mixed
// into the rendered MP4.

function musicNotes() {
  const KICK = 36, CLAP = 39, HAT = 41, OPEN = 42, CRASH = 47, GLITCH = 51;
  const drums = [];
  // Intro: a heartbeat kick and the flicker's glitch hits.
  for (const b of [0, 2, 4, 4.5]) drums.push([b, KICK, 0.25, 110]);
  drums.push([3, GLITCH, 0.25, 90], [3.25, GLITCH, 0.25, 70]);
  // The drop at beat 6 through the specs.
  for (let b = 6; b < 35; b++) {
    drums.push([b, KICK, 0.25, 118]);
    if (b % 2 === 1) drums.push([b, CLAP, 0.25, 104]);
    drums.push([b + 0.5, HAT, 0.125, 76], [b + 0.75, HAT, 0.125, 58]);
    if (b % 4 === 3) drums.push([b + 0.5, OPEN, 0.25, 80]);
  }
  for (const b of [6, 14, 24, 35, 40]) drums.push([b, CRASH, 1, 112]);
  // The reveal is half time; the drop card rebuilds to one last hit.
  for (let b = 35; b < 40; b += 2) drums.push([b, KICK, 0.25, 110], [b + 1, CLAP, 0.25, 96]);
  for (let b = 40; b < 45; b++) drums.push([b, KICK, 0.25, 115], [b + 0.5, HAT, 0.125, 70]);
  drums.push([45, KICK, 0.5, 127], [45, CRASH, 1, 127]);

  const E1 = 28, G1 = 31, A1 = 33, B0 = 23, D2 = 38;
  const riff = [E1, E1, D2, E1, G1, E1, A1, B0];
  const bass = [];
  for (let b = 6; b < 35; b++) {
    for (let h = 0; h < 2; h++) bass.push([b + h * 0.5, riff[(2 * b + h) % riff.length], 0.4, h === 0 ? 120 : 84]);
  }
  for (let b = 40; b < 45; b++) bass.push([b, E1, 0.9, 110]);

  return { drums, bass };
}

const { drums, bass } = musicNotes();
v.midi("t_drums", drums, { instrument: "dr1-tr-void" });
v.midi("t_bass", bass, { instrument: "bl1-acid" });

// The finishing vignette/grain/sharpen over the whole video (the
// teal-and-orange grade itself is `nightGrade()`, scoped inside S1–S3).
v.adjust(
  [
    { id: "sh", type: "sharpen", enabled: true, amount: 0.35, radius: 1.2 },
    { id: "vig", type: "vignette", enabled: true, amount: 0.35, softness: 0.65 },
    { id: "grain", type: "grain", enabled: true, amount: 0.05, size: 1.4, animate: true, seed: 2 }
  ],
  { id: "finish", name: "vignette + grain + sharpen", trackId: "t_finish" }
);

// The pan across the board in S2. Its jumps sit on the two hard cuts either
// side of it, where nothing else is on screen to be moved.
const s2Start = s2.group.startMs, s3Start = s3.group.startMs;
const panStart = s2Start + Math.round(f(60) * 1000);
const panEnd = s2Start + Math.round(f(119) * 1000);
v.document({
  camera2d: {
    position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1800,
    keyframes: [
      { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 },
      { timeMs: panStart - 1, position: { x: 0, y: 0 }, depthPx: 0 },
      { timeMs: panStart, position: { x: -620, y: 0 }, depthPx: 0 },
      { timeMs: panEnd, position: { x: 620, y: 0 }, depthPx: 60 },
      { timeMs: s3Start - 1, position: { x: 620, y: 0 }, depthPx: 60 },
      { timeMs: s3Start, position: { x: 0, y: 0 }, depthPx: 0 }
    ]
  }
});

// A marker per beat, and the montage cuts snapped onto the grid.
const ops = v.beats({ bpm: BPM, snap: montageIds });

const saved = await v.save(nodetool.timelines, {
  name: "Voltra — Silent. Violent.",
  showcase: true,
  ops
});
await output("timeline", {
  name: "Voltra — Silent. Violent.",
  description: "A 23-second electric motorcycle launch ad cut to a 120 BPM beat: fifteen generated stills with parallax plates, masks, mattes, a night grade, spec gauges and a drop countdown.",
  fps: FPS,
  width: W,
  height: H,
  durationMs: Math.round(v.durationMs),
  videoUri: "package://nodetool-base/timelines/voltra/ad.mp4",
  posterUri: "package://nodetool-base/timelines/voltra/poster.jpg",
  ...saved
});
