// Ad library R12, Fixed glyph, changing world: a 12-second vertical brand ad
// for a fictional insurer. One shield glyph holds the same place and
// silhouette while four worlds cut in around it.
//
// `node scripts/example-timelines/ad-library.mjs build fixed-glyph-changing-world`
// writes marketing/recipe-assets/ad-library/fixed-glyph-changing-world.timeline.json.
//
// The insurer and its promise are fictional; every world is drawn from
// shapes. Every time value is seconds from the start of the ad, the beat
// times in marketing/src/data/adLibrary.json. Positions are px from the frame
// centre on a 1080×1920 frame.
//
// Motion language: hard cuts every 1.5 s, objects that move tangentially or
// scale gently, 300 ms exits (inExpo) when the worlds clear, and a glyph that
// never moves after its 250 ms settle.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const NAVY = "#14213d", WHITE = "#ffffff", PAPER = "#f6f3ec";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const SETTLE = "cubic-bezier(0.3,1.3,0.6,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: PAPER, ink2: PAPER, text: NAVY, dim: NAVY, accent: NAVY },
  fonts: { display: "Inter", body: "Inter" }
});

// The anchor: fixed for the whole ad.
const AX = 0, AY = -50, AW = 500, AH = 590;
const shieldPoints = () => {
  const l = AX - AW / 2, r = AX + AW / 2, t = AY - AH / 2, b = AY + AH / 2;
  return [["M", l + 40, t], ["L", r - 40, t], ["Q", r, t, r, t + 40], ["L", r, AY + 40], ["Q", r - 20, b - 90, AX, b], ["Q", l + 20, b - 90, l, AY + 40], ["L", l, t + 40], ["Q", l, t, l + 40, t], ["Z"]];
};

const WORLDS = [
  { name: "trips", label: "Your trips.", bg: "#bfe2ff", at: 1.5 },
  { name: "home", label: "Your home.", bg: "#ffd8b5", at: 3.0 },
  { name: "bike", label: "Your bike.", bg: "#c4efd9", at: 4.5 },
  { name: "dog", label: "Your dog.", bg: "#e1d2ff", at: 6.0 }
];

/** Clouds and a plane crossing behind the shield. */
function trips(q, p) {
  [[-330, -470, 300], [300, -300, 240], [-360, 360, 260], [340, 480, 320], [40, 640, 380], [-60, -690, 220]].forEach(([x, y, w], k) => {
    const c = q.rect(w, w * 0.32, WHITE, { parent: p, name: `cloud-${k}`, x, y, r: w * 0.16, opacity: 0.95 });
    c.animate({ offsetX: [0, k % 2 ? -60 : 60, "linear"] }, { at: 0, dur: 1.5, role: "emphasis" });
  });
  q.ellipse(150, "#ffd25a", { parent: p, name: "sun", x: 360, y: -620 });
  const plane = q.path([["M", -60, 0], ["L", 40, -6], ["L", 70, 0], ["L", 40, 6], ["Z"], ["M", 0, -4], ["L", -20, -46], ["L", -4, -46], ["L", 24, -4], ["Z"], ["M", 0, 4], ["L", -20, 46], ["L", -4, 46], ["L", 24, 4], ["Z"]], { parent: p, name: "plane", fill: NAVY, s: 2.4, x: -420, y: 300, rotation: -18 });
  plane.animate({ offsetX: [0, 840, "linear"], offsetY: [0, -420, "linear"] }, { at: 0, dur: 1.5, role: "emphasis" });
}

/** A row of houses with lit windows, settling up gently. */
function home(q, p) {
  [[-330, 420, 260, "#e98a5a"], [330, 400, 300, "#c96b4a"], [-360, -400, 200, "#f2a36f"], [370, -380, 220, "#d97b53"]].forEach(([x, y, w, tone], k) => {
    const g = q.group({ parent: p, name: `house-${k}`, x, y });
    q.path([["M", -w / 2, 0], ["L", 0, -w * 0.5], ["L", w / 2, 0], ["Z"]], { parent: p, name: `house-${k}-roof`, parent: g.id, fill: NAVY });
    q.rect(w * 0.8, w * 0.62, tone, { parent: p, name: `house-${k}-wall`, parent: g.id, y: w * 0.31 });
    q.rect(w * 0.18, w * 0.18, "#fff2b0", { parent: p, name: `house-${k}-window`, parent: g.id, x: -w * 0.18, y: w * 0.24 });
    q.rect(w * 0.16, w * 0.3, NAVY, { parent: p, name: `house-${k}-door`, parent: g.id, x: w * 0.18, y: w * 0.47 });
    g.animate({ scale: [0.96, 1, "out"] }, { at: 0, dur: 1.5, role: "emphasis" });
  });
  q.rect(26, 120, "#7a4a2e", { parent: p, name: "tree-trunk", x: 10, y: 640 });
  q.ellipse(190, "#5f9e5a", { parent: p, name: "tree-crown", x: 10, y: 540 });
}

/** Two wheels turning on either side, road marks running past. */
function bike(q, p) {
  [[-330, 420], [330, 420]].forEach(([x, y], k) => {
    const g = q.group({ parent: p, name: `wheel-${k}`, x, y });
    q.ellipse(300, null, { parent: p, name: `wheel-${k}-tyre`, parent: g.id, stroke: NAVY, sw: 22 });
    for (let i = 0; i < 6; i++) q.rect(270, 6, NAVY, { parent: p, name: `wheel-${k}-spoke-${i}`, parent: g.id, rotation: i * 30, opacity: 0.7 });
    q.ellipse(46, NAVY, { parent: p, name: `wheel-${k}-hub`, parent: g.id });
    g.loop({ rotation: [0, 360] }, 1.5);
  });
  const road = q.rect(140, 18, NAVY, { parent: p, name: "road", x: -620, y: 640, r: 9, opacity: 0.35, repeater: { count: 9, positionStep: { x: 200, y: 0 }, timeStepMs: 0 } });
  road.animate({ offsetX: [0, -200, "linear"] }, { at: 0, dur: 1.5, role: "emphasis" });
  [[-380, -420, 150], [380, -460, 120], [-200, -560, 90], [250, -620, 110]].forEach(([x, y, d], k) => q.ellipse(d, "#7fd3a8", { parent: p, name: `bush-${k}`, x, y }));
}

/** Paw prints walking past the shield and a ball. */
function dog(q, p) {
  const steps = [[-420, 520], [-300, 440], [-360, 300], [300, -380], [410, -470], [340, -600]];
  steps.forEach(([x, y], k) => {
    const g = q.group({ parent: p, name: `paw-${k}`, x, y, s: 1.3, rotation: k < 3 ? -20 : 25, at: k * 0.12 });
    q.ellipse(70, "#6c4fb3", { parent: p, name: `paw-${k}-pad`, parent: g.id, y: 18 });
    [[-36, -24], [-12, -46], [14, -46], [38, -24]].forEach(([tx, ty], j) => q.ellipse(28, "#6c4fb3", { parent: p, name: `paw-${k}-toe-${j}`, parent: g.id, x: tx, y: ty }));
    g.enter({ from: { scale: 0, opacity: 0 }, at: 0, dur: 0.2, ease: SETTLE });
  });
  const ball = q.ellipse(150, "#ff8a5c", { parent: p, name: "ball", x: 360, y: 420 });
  const bone = q.group({ parent: p, name: "bone", x: -330, y: -470, rotation: -24 });
  q.rect(200, 44, PAPER, { parent: bone.id, name: "bone-shaft", r: 22 });
  [[-100, -24], [-100, 24], [100, -24], [100, 24]].forEach(([bx, by], j) => q.ellipse(64, PAPER, { parent: bone.id, name: `bone-end-${j}`, x: bx, y: by }));
  bone.animate({ rotation: [-24, -8, "out"] }, { at: 0, dur: 1.5, role: "emphasis" });
  ball.animate({ offsetX: [0, -60, "out"], rotation: [0, -120, "out"] }, { at: 0, dur: 1.5, role: "emphasis" });
}

const BUILD = { trips, home, bike, dog };

/** The caption above the shield. */
function caption(s, str, at, dur, o = {}) {
  const t = s.text(str, { name: o.name ?? "caption", y: -560, mw: 0.86, size: o.size ?? 104, weight: 800, color: NAVY, tracking: -0.04, at, dur, style: { lineHeight: 1.04 } });
  if (o.enter !== false) t.enter({ from: { offsetY: 30, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  return t;
}

const world = v.scene("World", 12, (s) => {
  s.fill(PAPER, { name: "paper" });

  // The worlds: each cuts in on its beat and holds 1.5 s; the last clears in 300 ms.
  WORLDS.forEach((w, i) => {
    s.seq(w.at, i === 3 ? 1.8 : 1.5, (q) => {
      const g = q.group({ name: `${w.name}-world`, s: 1.2 });
      q.fill(w.bg, { name: `${w.name}-bg`, parent: g.id });
      BUILD[w.name](q, g.id);
      if (i === 3) {
        g.exit({ to: { opacity: 0 }, at: 1.5, dur: 0.3, ease: "inExpo" });
      }
    });
    caption(s, w.label, w.at, 1.5, { name: `label-${w.name}`, enter: false });
  });

  // The anchor: settles in 250 ms on frame 0 and never moves again.
  s.rect(AW * 0.9, 60, "rgba(20,33,61,0.25)", { name: "anchor-shadow", kind: "ellipse", x: AX, y: AY + AH / 2 + 40, effects: [{ type: "blur", radius: 20 }] });
  const anchor = s.group({ name: "anchor" });
  s.path(shieldPoints(), { name: "shield", parent: anchor.id, fill: NAVY, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 24, blur: 50, color: "rgba(20,33,61,0.3)" }] });
  s.path([["M", AX - 120, AY - 10], ["Q", AX - 60, AY - 70, AX, AY - 10], ["Q", AX + 60, AY + 50, AX + 120, AY - 10]], { name: "shield-wave-1", parent: anchor.id, stroke: WHITE, sw: 26 });
  s.path([["M", AX - 120, AY + 80], ["Q", AX - 60, AY + 20, AX, AY + 80], ["Q", AX + 60, AY + 140, AX + 120, AY + 80]], { name: "shield-wave-2", parent: anchor.id, stroke: WHITE, sw: 26, opacity: 0.55 });
  anchor.enter({ from: { scale: 0.9 }, at: 0, dur: 0.25, ease: SETTLE });

  // B1 premise, B4 promise, B5 lockup.
  caption(s, "Cover that goes where you go", 0, 1.5, { name: "premise", size: 92 });
  caption(s, "One plan for all of it.", 7.5, 4.5, { name: "promise", size: 96 });
  s.seq(9.5, 2.5, (q) => {
    const word = q.text("harbor", { name: "wordmark", y: AY + AH / 2 + 130, size: 84, weight: 800, color: NAVY, tracking: -0.05 });
    word.enter({ from: { opacity: 0, offsetY: 16 }, at: 0, dur: 0.25, ease: SNAP });
    const button = q.pill("Get a quote", { name: "cta", y: 560, size: 54, weight: 800, color: WHITE, fillColor: NAVY, stroke: "rgba(0,0,0,0)", padX: 76, padY: 30 });
    button.enter({ from: { opacity: 0, offsetY: 20 }, at: 0.1, dur: 0.25, ease: SNAP });
  });

  s.finish({ vignette: 0.08, softness: 0.85, grain: 0.03, seed: 15 });
});

v.series([world]);

const saved = await v.save(nodetool.timelines, {
  name: "Fixed glyph, changing world — Harbor",
  showcase: true
});
await output("timeline", {
  name: "Fixed glyph, changing world — Harbor",
  description: "A 12-second vertical brand ad: one shield glyph holds its place while four worlds cut in around it every 1.5 s, then clear for the promise and the lockup.",
  videoUri: "/ad-library/videos/fixed-glyph-changing-world.mp4",
  posterUri: "/ad-library/videos/fixed-glyph-changing-world.webp",
  ...saved
});
