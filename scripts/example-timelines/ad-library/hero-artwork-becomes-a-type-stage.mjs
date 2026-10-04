// Ad library R11, Hero artwork becomes a type stage: a 12-second vertical ad
// for a fictional mountain film festival. A cut-paper landscape opens the
// ad; its foreground clears away and the sky and sun stay on as the stage
// for the type.
//
// `node scripts/example-timelines/ad-library.mjs build hero-artwork-becomes-a-type-stage`
// writes marketing/recipe-assets/ad-library/hero-artwork-becomes-a-type-stage.timeline.json.
//
// The festival, its dates and its prices are fictional. The artwork is drawn
// from path shapes. Every time value is seconds from the start of the ad, the
// beat times in marketing/src/data/adLibrary.json. Positions are px from the
// frame centre on a 1080×1920 frame.
//
// Motion language: layers drift at different speeds (never all together),
// the foreground clears in one 400 ms move (inExpo, staggered 60 ms), the
// headline rises by word 90 ms apart in 300 ms, then only the background
// drifts. The sun is the motif that carries through.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const NIGHT = "#1b1d4a", DUSK = "#5d4a9c", GLOW = "#ffb38a", SUN = "#ff7a59", CREAM = "#fff3e4";
const FAR = "#9a86cf", MID = "#5c4a9f", NEAR = "#3a2f72", FORE = "#1c1842";
const SERIF = "serif", SANS = "sans";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: NIGHT, ink2: DUSK, text: CREAM, dim: GLOW, accent: SUN },
  fonts: { serif: "Playfair Display", sans: "Inter" }
});

// A shape is drawn inside a frame-sized surface before it is placed, so a
// layer that drifts sideways is drawn 1/K the size and placed at scale K:
// its edges then stay off screen through the whole drift.
const K = 1.2;

/** A ridge line across the frame, closed to the bottom edge, as path points for a layer placed at scale K. */
function ridge(points) {
  const [first, ...rest] = points;
  const pts = [["M", -620, 960], ["L", -620, first[1]], ...[first, ...rest].map(([x, y]) => ["L", x, y]), ["L", 620, rest[rest.length - 1][1]], ["L", 620, 960], ["Z"]];
  return pts.map(([cmd, ...xy]) => [cmd, ...xy.map((n) => n / K)]);
}
const vertical = (top, bottom) => ({ type: "linear", angle: 90, stops: [{ offset: 0, color: top }, { offset: 1, color: bottom }] });

/** A pine: three stacked triangles on a short trunk, base at (x, y). */
function pine(s, name, parent, x, y, h, color) {
  const w = h * 0.42;
  const pts = [];
  for (let k = 0; k < 3; k++) {
    const top = y - h + k * h * 0.26, base = y - h * 0.38 + k * h * 0.2, half = w * (0.55 + k * 0.25);
    pts.push(["M", x, top], ["L", x + half, base], ["L", x - half, base], ["Z"]);
  }
  pts.push(["M", x - w * 0.08, y - h * 0.1], ["L", x + w * 0.08, y - h * 0.1], ["L", x + w * 0.08, y], ["L", x - w * 0.08, y], ["Z"]);
  return s.path(pts, { name, parent, fill: color });
}

const festival = v.scene("Festival", 12, (s) => {
  // The secondary field: sky and sun. It stays for the whole ad.
  s.rect(W, H, { type: "linear", angle: 90, stops: [{ offset: 0, color: NIGHT }, { offset: 0.45, color: DUSK }, { offset: 0.72, color: GLOW }, { offset: 1, color: GLOW }] }, { name: "sky" });
  const stars = s.ellipse(5, CREAM, { name: "stars", x: -470, y: -880, opacity: 0.55, repeater: { count: 48, columns: 8, positionStep: { x: 134, y: 23 }, rowStep: { x: 67, y: 74 }, timeStepMs: 0 } });
  stars.loop({ opacity: [[0, 0.55], [0.5, 0.3, "inOut"], [1, 0.55, "inOut"]] }, 4);
  const sun = s.group({ name: "sun", x: 230, y: -290 });
  s.glow({ name: "sun-glow", parent: sun.id, size: 900, alpha: 0.45, color: SUN });
  s.ellipse(300, { type: "linear", angle: 90, stops: [{ offset: 0, color: "#ffd2a8" }, { offset: 1, color: SUN }] }, { name: "sun-disc", parent: sun.id });
  // The sun rises a little through the hook, then sinks to the horizon as the stage clears.
  sun.animate({ offsetY: [[0, 40], [0.2, 0, "inOut"], [0.21, 0], [0.31, 600, "inOut"], [1, 600]], offsetX: [[0, 0], [0.21, 0], [0.31, -230, "inOut"], [1, -230]] }, { at: 0, dur: 12, role: "emphasis" });
  sun.loop({ scale: [[0, 1], [0.5, 1.025, "inOut"], [1, 1, "inOut"]] }, 3);

  // Far ridge: drifts slowest; at the transform it settles low as the horizon.
  const far = s.path(ridge([[-540, -60], [-360, -210], [-210, -90], [-40, -260], [140, -120], [330, -230], [540, -80]]), { name: "ridge-far", s: K, fill: vertical("#b19ee0", "#6f5cab") });
  far.animate({ offsetX: [0, -40, "linear"] }, { at: 0, dur: 12, role: "emphasis" });
  far.animate({ offsetY: [[0, 0], [0.21, 0], [0.33, 640, "inOut"], [1, 640]] }, { at: 0, dur: 12, role: "emphasis" });

  // The hero foreground: three layers at three speeds, cleared away in one move at 2.5 s.
  const fore = s.group({ name: "foreground", dur: 3.1 });
  const mid = s.path(ridge([[-540, 60], [-380, -40], [-220, 50], [-60, -70], [120, 40], [300, -30], [540, 70]]), { name: "ridge-mid", parent: fore.id, s: K, fill: vertical(MID, "#463a86") });
  const near = s.path(ridge([[-540, 230], [-300, 150], [-60, 240], [200, 140], [540, 220]]), { name: "ridge-near", parent: fore.id, s: K, fill: NEAR });
  const trail = s.path([["M", 500, 250], ["Q", 120, 300, 40, 400], ["Q", -40, 520, -320, 620], ["Q", -460, 680, -530, 760]], { name: "trail", parent: fore.id, stroke: GLOW, sw: 12, opacity: 0.85 });
  const ground = s.path(ridge([[-540, 420], [-200, 360], [160, 430], [540, 370]]), { name: "ground", parent: fore.id, s: K, fill: FORE });
  const pines = s.group({ name: "pines", parent: fore.id });
  [[-420, 470, 300], [-320, 500, 220], [-240, 450, 170], [250, 430, 260], [350, 470, 340], [440, 440, 200]].forEach(([x, y, h], k) => pine(s, `pine-${k}`, pines.id, x, y, h, "#120f2e"));
  mid.animate({ offsetX: [0, -50, "linear"] }, { at: 0, dur: 3.1, role: "emphasis" });
  near.animate({ offsetX: [0, -90, "linear"] }, { at: 0, dur: 3.1, role: "emphasis" });
  trail.draw({ at: 0.2, dur: 1.6, ease: "inOut" });
  pines.animate({ offsetX: [0, -150, "linear"] }, { at: 0, dur: 3.1, role: "emphasis" });
  [pines, ground, trail, near, mid].forEach((layer, k) => layer.exit({ to: { offsetY: 1100 }, at: 2.5 + k * 0.06, dur: 0.4, ease: "inExpo" }));

  // B1 hook line, on the dark ground under the art.
  const hook = s.text("Five nights of mountain films", { name: "hook", y: 640, mw: 0.86, font: SANS, size: 56, weight: 600, color: CREAM, dur: 2.5 });
  hook.enter({ from: { offsetY: 24, opacity: 0 }, at: 0.3, dur: 0.3, ease: SNAP });
  hook.exit({ to: { opacity: 0 }, at: 2.3, dur: 0.2, ease: "linear" });

  // B3 message: one headline on the quiet stage, 90 ms per word, 300 ms each.
  s.seq(4.5, 7.5, (q) => {
    const kicker = q.text("TRAILHEAD FILM FESTIVAL", { name: "kicker", font: SANS, size: 36, weight: 700, color: GLOW, tracking: 0.22 });
    const l1 = q.text("Films made where", { name: "headline-1", font: SERIF, size: 118, weight: 600, color: CREAM, tracking: -0.02, style: { lineHeight: 1.04 } });
    const l2 = q.text("the trail ends.", { name: "headline-2", font: SERIF, size: 118, weight: 600, italic: true, color: CREAM, tracking: -0.02, style: { lineHeight: 1.04 } });
    q.stack([kicker, l1, l2], { name: "message", at: { x: 0, y: -250 }, align: "center", gap: 16 });
    kicker.enter({ from: { opacity: 0 }, at: 0, dur: 0.3, ease: "linear" });
    l1.enter({ from: { offsetY: 50, opacity: 0 }, at: 0.1, dur: 0.3, ease: SNAP, by: "word", staggerMs: 90 });
    l2.enter({ from: { offsetY: 50, opacity: 0 }, at: 0.37, dur: 0.3, ease: SNAP, by: "word", staggerMs: 90 });
  });

  // B4 offer: a 180 ms fade under the headline; only the background drifts.
  const offer = s.text("Festival passes from €35  ·  12–16 Nov", { name: "offer", y: 30, mw: 0.9, font: SANS, size: 50, weight: 600, color: CREAM, at: 7.5 });
  offer.enter({ from: { opacity: 0 }, at: 0, dur: 0.18, ease: "linear" });

  // B5 CTA.
  s.seq(9.5, 2.5, (q) => {
    const button = q.pill("Get your pass", { name: "cta", y: 545, size: 56, weight: 700, color: NIGHT, fillColor: CREAM, stroke: "rgba(0,0,0,0)", font: SANS, padX: 76, padY: 30 });
    button.enter({ from: { offsetY: 30, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  });

  s.finish({ vignette: 0.18, softness: 0.75, grain: 0.06, seed: 14 });
});

v.series([festival]);

const saved = await v.save(nodetool.timelines, {
  name: "Hero art to type stage — Trailhead Film Festival",
  showcase: true
});
await output("timeline", {
  name: "Hero art to type stage — Trailhead Film Festival",
  description: "A 12-second vertical festival ad: a layered cut-paper landscape drifts, its foreground clears away, and the sky and sun stay on as a quiet stage for the headline, offer and CTA.",
  videoUri: "/ad-library/videos/hero-artwork-becomes-a-type-stage.mp4",
  posterUri: "/ad-library/videos/hero-artwork-becomes-a-type-stage.webp",
  ...saved
});
