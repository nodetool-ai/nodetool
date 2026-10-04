// Ad library R09, Headline plus inset motion module: a 10-second vertical
// app ad for a fictional habit tracker. The wrapper (stage, headline,
// window) stays fixed; only the module inside the window changes.
//
// `node scripts/example-timelines/ad-library.mjs build headline-plus-inset-motion-module`
// writes marketing/recipe-assets/ad-library/headline-plus-inset-motion-module.timeline.json.
//
// The app and its numbers are fictional; the module is a native scene drawn
// from shapes, the recipe's alternative to imported media. Every time value
// is seconds from the start of the ad, the beat times in
// marketing/src/data/adLibrary.json. Positions are px from the frame centre
// on a 1080×1920 frame.
//
// Motion language: one entrance curve (SNAP), one pop for checks (POP), a
// hard cut inside the window between modules, and nothing moving in the
// wrapper after its 250 ms entrance.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const STAGE = "#fff1bf", STAGE2 = "#ffe48a", INK = "#1e1b16", CORAL = "#ff6b3d";
const WIN = "#123c3a", WIN2 = "#0b2928", PALE = "#e8f3ef", MUTED = "#8fb3ab";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const POP = "cubic-bezier(0.3,1.5,0.6,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: STAGE, ink2: STAGE2, text: INK, dim: INK, accent: CORAL },
  fonts: { display: "Inter", body: "Inter" }
});

// The window: fixed for the whole ad.
const WX = 0, WY = 110, WW = 880, WH = 680;

/** A tick drawn in white over a circle, centred at (x, y). */
function check(s, name, x, y, d, at) {
  const dot = s.ellipse(d, CORAL, { name: `${name}-fill`, x, y, at });
  dot.enter({ from: { scale: 0 }, at: 0, dur: 0.24, ease: POP });
  const mark = s.path([["M", x - d * 0.22, y], ["L", x - d * 0.05, y + d * 0.17], ["L", x + d * 0.25, y - d * 0.17]], { name: `${name}-tick`, stroke: "#ffffff", sw: d * 0.11, at: at + 0.06 });
  mark.draw({ at: 0, dur: 0.2, ease: SNAP });
}

const ad = v.scene("Module", 10, (s) => {
  s.backdrop({ colors: [STAGE, STAGE2], opacity: 0.5, seed: 17 });

  // The wrapper: headline, underline and window. Only the B4 payoff replaces the headline text.
  const l1 = s.text("Five minutes", { name: "hook-emphasis", size: 104, weight: 800, color: INK, tracking: -0.04, dur: 6.5, style: { lineHeight: 1.04 } });
  const line = s.rect(10, 10, CORAL, { name: "underline", absolute: true, inset: { left: 0, right: 0, bottom: 2, top: 104 }, dur: 6.5 });
  const emphasis = s.stack([line, l1], { name: "emphasis", padding: { bottom: 16 }, dur: 6.5 });
  const l1b = s.text("a day", { name: "hook-rest", size: 104, weight: 800, color: INK, tracking: -0.04, dur: 6.5, style: { lineHeight: 1.04 } });
  const row1 = s.row([emphasis, l1b], { name: "hook-line-1", gap: 26, align: "start", dur: 6.5 });
  const l2 = s.text("builds a habit.", { name: "hook-line-2", size: 104, weight: 800, color: INK, tracking: -0.04, dur: 6.5, style: { lineHeight: 1.04 } });
  const hook = s.stack([row1, l2], { name: "hook", at: { x: -440, y: -700 }, anchor: "top-left", align: "start", gap: 4, dur: 6.5 });
  hook.enter({ from: { offsetY: 40, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  // A 180 ms replacement: the hook fades out, then the payoff fades in, with no overlap.
  hook.exit({ to: { opacity: 0 }, at: 6.32, dur: 0.18, ease: "linear" });
  line.animate({ wipeProgress: [0, 1] }, { at: 0.35, dur: 0.35, ease: SNAP, mask: { direction: "left", softness: 0 } });

  // B4 payoff: a 180 ms replacement in the same place.
  s.seq(6.5, 3.5, (q) => {
    const p1 = q.text("Day 21.", { name: "payoff-1", size: 104, weight: 800, color: CORAL, tracking: -0.04, style: { lineHeight: 1.04 } });
    const p2 = q.text("Still going.", { name: "payoff-2", size: 104, weight: 800, color: INK, tracking: -0.04, style: { lineHeight: 1.04 } });
    q.stack([p1, p2], { name: "payoff", at: { x: -440, y: -700 }, anchor: "top-left", align: "start", gap: 4 })
      .enter({ from: { opacity: 0 }, at: 0, dur: 0.18, ease: "linear" });
  });

  s.rect(WW, WH, { type: "linear", angle: 90, stops: [{ offset: 0, color: WIN }, { offset: 1, color: WIN2 }] }, { name: "window", x: WX, y: WY, r: 44, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 30, blur: 60, color: "rgba(30,27,22,0.28)" }] });
  s.glow({ name: "window-light", size: 900, alpha: 0.18, color: "#5eead4", x: WX + 200, y: WY - 160 });

  // Module A (1.5–4.5 s, and already present in the hook): three habits tick off.
  s.seq(0, 4.5, (q) => {
    q.text("Today", { name: "a-title", anchor: "left", x: WX - WW / 2 + 60, y: WY - 250, mw: 0.4, size: 52, weight: 800, color: PALE, tracking: -0.02 });
    q.ellipse(118, null, { name: "a-ring-track", x: WX + WW / 2 - 110, y: WY - 246, stroke: "rgba(232,243,239,0.18)", sw: 14 });
    const prog = q.ellipse(118, null, { name: "a-ring", x: WX + WW / 2 - 110, y: WY - 246, stroke: CORAL, sw: 14, rotation: -90 });
    // One third of the ring per tick, landing with each check.
    const T = (sec) => sec / 4.5;
    prog.animate({ trimEnd: [[0, 0], [T(1.9), 0], [T(2.14), 0.333, "out"], [T(2.5), 0.333], [T(2.74), 0.667, "out"], [T(3.1), 0.667], [T(3.34), 1, "out"], [1, 1]] }, { at: 0, dur: 4.5, role: "emphasis" });
    const count = q.text("0/3", { name: "a-count", x: WX + WW / 2 - 110, y: WY - 246, mw: 0.1, size: 34, weight: 800, color: PALE });
    count.count({ from: 0, to: 3, at: 1.9, dur: 1.44, suffix: "/3", ease: "linear" });
    ["Read ten pages", "Walk to work", "No phone at dinner"].forEach((habit, k) => {
      const y = WY - 70 + k * 140;
      q.ellipse(66, null, { name: `a-box-${k}`, x: WX - WW / 2 + 92, y, stroke: "rgba(232,243,239,0.45)", sw: 5 });
      const label = q.text(habit, { name: `a-habit-${k}`, anchor: "left", x: WX - WW / 2 + 150, y, mw: 0.6, size: 48, weight: 600, color: PALE });
      check(q, `a-check-${k}`, WX - WW / 2 + 92, y, 66, 1.9 + k * 0.6);
      label.tween("text.color", [[0, PALE], [1, MUTED]], { at: 1.95 + k * 0.6, dur: 0.24 });
    });
  });

  // Module B (4.5–10 s): a hard cut inside the window to the month, filling to a 21-day streak.
  s.seq(4.5, 5.5, (q) => {
    q.text("June", { name: "b-title", anchor: "left", x: WX - WW / 2 + 60, y: WY - 250, mw: 0.4, size: 52, weight: 800, color: PALE, tracking: -0.02 });
    const day = q.text("Day 0", { name: "b-day", anchor: "right", x: WX + WW / 2 - 60, y: WY - 250, mw: 0.4, size: 52, weight: 800, color: CORAL });
    day.count({ from: 0, to: 21, at: 0.1, dur: 1.5, prefix: "Day ", ease: "linear" });
    const COLS = 7, GAP = 98, D = 64;
    const gx = WX - ((COLS - 1) * GAP) / 2, gy = WY - 110;
    q.ellipse(D, null, { name: "b-days", x: gx, y: gy, stroke: "rgba(232,243,239,0.22)", sw: 4, repeater: { count: 30, columns: COLS, positionStep: { x: GAP, y: 0 }, rowStep: { x: 0, y: GAP - 8 }, timeStepMs: 0 } });
    for (let k = 0; k < 21; k++) {
      const c = q.ellipse(D, k === 20 ? CORAL : "#2fbf9f", { name: `b-done-${k}`, x: gx + (k % COLS) * GAP, y: gy + Math.floor(k / COLS) * (GAP - 8), at: 0.1 + k * 0.07 });
      c.enter({ from: { scale: 0 }, at: 0, dur: 0.2, ease: POP });
    }
  });

  // Captions under the window, one per module, then the CTA strip.
  [["Tick off three small habits", 1.5, 3.0], ["Watch the streak grow, day by day", 4.5, 2.0]].forEach(([str, at, dur], i) => {
    const t = s.text(str, { name: `caption-${i}`, y: 530, mw: 0.86, size: 54, weight: 700, color: INK, tracking: -0.02, at, dur });
    t.enter({ from: { offsetY: 20, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  });
  s.seq(8, 2, (q) => {
    const button = q.pill("Get Streakly free", { name: "cta", y: 545, size: 56, weight: 800, color: "#ffffff", fillColor: INK, stroke: "rgba(0,0,0,0)", padX: 76, padY: 30 });
    button.enter({ from: { offsetY: 30, opacity: 0 }, at: 0, dur: 0.2, ease: SNAP });
  });

  s.finish({ vignette: 0.08, softness: 0.85, grain: 0.03, seed: 10 });
});

v.series([ad]);

const saved = await v.save(nodetool.timelines, {
  name: "Headline and inset module — Streakly",
  showcase: true
});
await output("timeline", {
  name: "Headline and inset module — Streakly",
  description: "A 10-second vertical app ad: a fixed headline and window while the module inside cuts from a checklist to a filling streak, then a payoff line and a CTA strip.",
  videoUri: "/ad-library/videos/headline-plus-inset-motion-module.mp4",
  posterUri: "/ad-library/videos/headline-plus-inset-motion-module.webp",
  ...saved
});
