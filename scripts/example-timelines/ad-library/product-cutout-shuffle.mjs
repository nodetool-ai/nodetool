// Ad library R02, Product cutout shuffle: an 8-second vertical flavour ad for
// a fictional sparkling water. One can holds a fixed anchor while the stage
// colour, the fruit around it and the label change.
//
// `node scripts/example-timelines/ad-library.mjs build product-cutout-shuffle`
// writes marketing/recipe-assets/ad-library/product-cutout-shuffle.timeline.json.
//
// The brand and its flavours are fictional, and the fruit is drawn from
// circles, the recipe's fallback for missing ingredient cutouts. Every time
// value is seconds from the start of the ad, the beat times in
// marketing/src/data/adLibrary.json. Positions are px from the frame centre
// on a 1080×1920 frame.
//
// Motion language: one landing curve with a small overshoot (LAND) for every
// pop, hard cuts on every swap, 180 ms counter-motion on the fruit, a 100 ms
// stagger for the range.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const INK = "#1c1420", PAPER = "#fff8ef";
const FLAVOURS = [
  { name: "Blood orange", line: "Bright and bittersweet", stage: "#ff9a70", can: "#e2462d", fruit: "#ff9f1c", flesh: "#ffd27a", kind: "citrus" },
  { name: "Yuzu lime", line: "Sharp, green and fresh", stage: "#cde77a", can: "#4f8f2a", fruit: "#b8d943", flesh: "#f1f7a8", kind: "citrus" },
  { name: "Wild berry", line: "Dark, juicy and tart", stage: "#d4b1ee", can: "#6a2c8e", fruit: "#4b1d6b", flesh: "#9b59c4", kind: "berry" }
];
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const LAND = "cubic-bezier(0.3,1.3,0.6,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: PAPER, ink2: PAPER, text: INK, dim: INK, accent: FLAVOURS[0].can },
  fonts: { display: "Inter", body: "Inter" }
});

/** `hex` lightened (amt > 0) or darkened (amt < 0) toward white or black. */
function tone(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** A fruit drawn from circles: a citrus slice with segments, or a cluster of berries. */
function fruit(s, f, o) {
  const { x = 0, y = 0, d = 220, at, dur, name = "fruit", parent } = o;
  const g = s.group({ name, x, y, parent, at, dur });
  if (f.kind === "citrus") {
    s.ellipse(d, f.fruit, { name: `${name}-rind`, parent: g.id });
    s.ellipse(d * 0.86, f.flesh, { name: `${name}-pith`, parent: g.id });
    for (let k = 0; k < 4; k++) {
      s.rect(d * 0.8, d * 0.035, f.fruit, { name: `${name}-segment-${k}`, parent: g.id, rotation: k * 45, opacity: 0.7 });
    }
    s.ellipse(d * 0.12, tone(f.flesh, 0.4), { name: `${name}-core`, parent: g.id });
  } else {
    [[-0.22, 0.12], [0.2, 0.16], [0, -0.18], [-0.02, 0.38]].forEach(([bx, by], k) => {
      s.ellipse(d * 0.46, k % 2 ? f.fruit : f.flesh, { name: `${name}-berry-${k}`, parent: g.id, x: bx * d, y: by * d - d * 0.1 });
      s.ellipse(d * 0.1, tone(f.flesh, 0.5), { name: `${name}-shine-${k}`, parent: g.id, x: bx * d - d * 0.08, y: by * d - d * 0.18, opacity: 0.7 });
    });
  }
  return g;
}

/** One can, drawn from shapes and centred on its group. */
function can(s, f, o) {
  const { x = 0, y = 0, scale = 1, rotation = 0, at, dur, name = "can" } = o;
  const g = s.group({ name, x, y, s: scale, rotation, at, dur });
  const metal = { type: "linear", angle: 0, stops: [
    { offset: 0, color: "#8c8f96" }, { offset: 0.25, color: "#e9ebef" }, { offset: 0.55, color: "#b6b9c0" }, { offset: 1, color: "#6f727a" }
  ] };
  const body = { type: "linear", angle: 0, stops: [
    { offset: 0, color: tone(f.can, -0.35) }, { offset: 0.14, color: f.can }, { offset: 0.3, color: tone(f.can, 0.28) },
    { offset: 0.42, color: f.can }, { offset: 0.85, color: tone(f.can, -0.1) }, { offset: 1, color: tone(f.can, -0.42) }
  ] };
  s.rect(270, 40, metal, { name: `${name}-lid`, parent: g.id, y: -292, r: 18 });
  s.rect(300, 560, body, { name: `${name}-body`, parent: g.id, r: 30 });
  s.rect(286, 34, metal, { name: `${name}-base`, parent: g.id, y: 282, r: 16 });
  s.text("fizzwell", { name: `${name}-brand`, parent: g.id, y: -170, size: 66, weight: 800, color: PAPER, tracking: -0.04, mw: 0.26 });
  s.ellipse(180, PAPER, { name: `${name}-badge`, parent: g.id, y: 20 });
  fruit(s, f, { name: `${name}-icon`, parent: g.id, y: 20, d: 130 });
  s.text(f.name.toUpperCase(), { name: `${name}-flavour`, parent: g.id, y: 180, size: 30, weight: 800, color: PAPER, tracking: 0.12, mw: 0.26 });
  s.rect(40, 520, "rgba(255,255,255,0.18)", { name: `${name}-sheen`, parent: g.id, x: -70, r: 20 });
  return g;
}

/** The stage colour for a window: a full-bleed fill and a soft light behind the can. */
function stage(s, color, at, dur) {
  s.fill(color, { name: "stage", at, dur });
  s.glow({ name: "stage-light", size: 1500, alpha: 0.5, color: "#ffffff", y: -40, at, dur });
}

/** A label for the slot above the can: one line in ink, one supporting line. */
function label(s, title, line, o) {
  const { at, dur, enter = true } = o;
  const t = s.text(title, { name: "label-title", size: 104, weight: 800, color: INK, tracking: -0.04, at, dur, style: { lineHeight: 1 } });
  const kids = [t];
  if (line) kids.push(s.text(line, { name: "label-line", size: 50, weight: 500, color: INK, at, dur }));
  const box = s.stack(kids, { name: "label", at: { x: 0, y: -700 }, anchor: "top", align: "center", gap: 14, start: at, dur });
  if (enter) box.enter({ from: { offsetY: 30, opacity: 0 }, at: 0, dur: 0.22, ease: SNAP });
  return box;
}

const CAN_Y = -20, CAN_S = 1.35;

const shuffle = v.scene("Shuffle", 8, (s) => {
  // Stage colour per window: it changes on the same frame as the can.
  stage(s, FLAVOURS[0].stage, 0, 3);
  stage(s, FLAVOURS[1].stage, 3, 1);
  stage(s, FLAVOURS[2].stage, 4, 1);
  // The range stands on three bands, one per flavour.
  s.seq(5, 3, (q) => {
    FLAVOURS.forEach((f, i) => {
      q.rect(W / 3 + 2, H, f.stage, { name: `band-${i}`, x: (i - 1) * (W / 3) });
    });
    q.glow({ name: "range-light", size: 1600, alpha: 0.45, color: "#ffffff", y: -40 });
  });

  // Fruit around the can: two accents per flavour, drifting 20–40 px. On a
  // swap they jump against the cut for 180 ms, then settle.
  const accentWindows = [[0, 0, 3], [1, 3, 1], [2, 4, 1]];
  accentWindows.forEach(([fi, at, dur]) => {
    const f = FLAVOURS[fi];
    const a = fruit(s, f, { name: `accent-a-${fi}`, x: -390, y: -270, d: 320, at, dur });
    const b = fruit(s, f, { name: `accent-b-${fi}`, x: 380, y: 330, d: 250, at, dur });
    a.animate({ offsetX: [0, 30, "inOut"], offsetY: [0, -24, "inOut"], rotation: [0, 14, "inOut"] }, { at: 0, dur, ease: "inOut", role: "emphasis" });
    b.animate({ offsetX: [0, -26, "inOut"], offsetY: [0, 20, "inOut"], rotation: [0, -12, "inOut"] }, { at: 0, dur, ease: "inOut", role: "emphasis" });
    if (at > 0) {
      a.enter({ from: { offsetX: 60, offsetY: -40 }, at: 0, dur: 0.18, ease: SNAP });
      b.enter({ from: { offsetX: -60, offsetY: 40 }, at: 0, dur: 0.18, ease: SNAP });
    } else {
      a.enter({ from: { scale: 0.6, opacity: 0 }, at: 1.0, dur: 0.3, ease: LAND });
      b.enter({ from: { scale: 0.6, opacity: 0 }, at: 1.1, dur: 0.3, ease: LAND });
    }
  });

  // The contact shadow never moves: every can lands on this baseline.
  s.rect(380, 56, "rgba(28,20,32,0.28)", { name: "contact-shadow", kind: "ellipse", y: CAN_Y + 300 * CAN_S + 16, dur: 5, effects: [{ type: "blur", radius: 16 }] });

  // B1 hook and B2 variant 1: the hero can pops 0.94 → 1.00 in 220 ms.
  const hero = can(s, FLAVOURS[0], { name: "can-blood-orange", y: CAN_Y, scale: CAN_S, dur: 3 });
  hero.enter({ from: { scale: 0.94 }, at: 0, dur: 0.22, ease: LAND });
  // B3 variants 2 and 3: hard swaps at the same anchor, the label on the same frame.
  can(s, FLAVOURS[1], { name: "can-yuzu-lime", y: CAN_Y, scale: CAN_S, at: 3, dur: 1 });
  can(s, FLAVOURS[2], { name: "can-wild-berry", y: CAN_Y, scale: CAN_S, at: 4, dur: 1 });

  label(s, "Three new flavours.", "Zero sugar, real fruit.", { at: 0, dur: 1 });
  label(s, FLAVOURS[0].name, FLAVOURS[0].line, { at: 1, dur: 2 });
  label(s, FLAVOURS[1].name, FLAVOURS[1].line, { at: 3, dur: 1, enter: false });
  label(s, FLAVOURS[2].name, FLAVOURS[2].line, { at: 4, dur: 1, enter: false });

  // B4 range: the three cans form a shallow fan, 100 ms apart. B5 holds it.
  s.seq(5, 3, (q) => {
    FLAVOURS.forEach((f, i) => {
      q.rect(250, 40, "rgba(28,20,32,0.24)", { name: `range-shadow-${i}`, kind: "ellipse", x: (i - 1) * 320, y: 300 + Math.abs(i - 1) * 24, effects: [{ type: "blur", radius: 14 }] });
      const c = can(q, f, { name: `range-can-${i}`, x: (i - 1) * 320, y: 30 + Math.abs(i - 1) * 24, scale: 0.84, rotation: (i - 1) * 5 });
      c.enter({ from: { offsetY: 160, scale: 0.9 }, at: i * 0.1, dur: 0.3, ease: LAND });
    });
    const title = q.text("Pick a favourite.", { name: "range-title", size: 104, weight: 800, color: INK, tracking: -0.04, style: { lineHeight: 1 } });
    const line = q.text("Or keep all three.", { name: "range-line", size: 50, weight: 500, color: INK });
    q.stack([title, line], { name: "range-label", at: { x: 0, y: -700 }, anchor: "top", align: "center", gap: 14 })
      .enter({ from: { offsetY: 30, opacity: 0 }, at: 0, dur: 0.22, ease: SNAP });
  });

  // B5 CTA: the button lands, the wordmark under it, then everything holds.
  s.seq(6.5, 1.5, (q) => {
    const button = q.pill("Try the trio", { name: "cta", y: 470, size: 56, weight: 800, color: PAPER, fillColor: INK, stroke: "rgba(0,0,0,0)", padX: 74, padY: 30 });
    button.enter({ from: { scale: 0.8, opacity: 0 }, at: 0, dur: 0.22, ease: LAND });
  });

  s.finish({ vignette: 0.1, softness: 0.8, grain: 0.025, seed: 3 });
});

v.series([shuffle]);

const saved = await v.save(nodetool.timelines, {
  name: "Product cutout shuffle — Fizzwell",
  showcase: true
});
await output("timeline", {
  name: "Product cutout shuffle — Fizzwell",
  description: "An 8-second vertical flavour ad: one can holds its anchor while the stage colour, fruit and label swap, then the range fans out under a CTA.",
  videoUri: "/ad-library/videos/product-cutout-shuffle.mp4",
  posterUri: "/ad-library/videos/product-cutout-shuffle.webp",
  ...saved
});
