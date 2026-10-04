// Ad library R06, Editorial image panels: a 12-second vertical ad for the
// fictional Prism Runner shoe, built from three of the Prism example's stills
// on a fixed grid. Motion reveals one panel at a time; the type holds still.
//
// `node scripts/example-timelines/ad-library.mjs build editorial-image-panels`
// writes marketing/recipe-assets/ad-library/editorial-image-panels.timeline.json.
//
// The stills ship with NodeTool under package://nodetool-base/timelines/prism
// (scripts/example-timelines/prism-stills.mjs made them) against chroma
// green, so each is keyed onto a tinted panel. A panel is a crop of its still
// sized to its grid cell. The first panel narrows into its column and later
// widens again with a `mask.d` track on the picture and a path morph on its
// plate, on one window and one curve so their edges stay together. The brand
// and its claims are fictional. Every time value is seconds from the start
// of the ad, the beat times in marketing/src/data/adLibrary.json. Positions
// are px from the frame centre on a 1080×1920 frame.
//
// Motion language: one in-place curve (EASE_IO) for every grid move, wipes of
// 250–350 ms from the left, type that never animates after it lands.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const STONE = "#ece7df", STONE2 = "#e2dbd0", INK = "#17151b", DIM = "#6c6672", VIOLET = "#5a46b8";
const KEY = { type: "chromaKey", color: "#0ac300", tolerance: 0.3, softness: 0.16, spill: 0.9 };
const SERIF = "serif", SANS = "sans";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const EASE_IO = "cubic-bezier(0.65,0,0.35,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: STONE, ink2: STONE2, text: INK, dim: DIM, accent: VIOLET },
  fonts: { serif: "Playfair Display", sans: "Inter" }
});

const uri = (name) => `package://nodetool-base/timelines/prism/${name}.jpg`;

// The grid: one tall column on the left, two cells on the right, 20 px gutters.
const GRID = { l: -450, r: 450, t: -320, b: 420 };
const GUT = 20;
const MID = (GRID.l + GRID.r) / 2;
const CELLS = {
  full: { l: GRID.l, r: GRID.r, t: GRID.t, b: GRID.b },
  left: { l: GRID.l, r: MID - GUT / 2, t: GRID.t, b: GRID.b },
  rightTop: { l: MID + GUT / 2, r: GRID.r, t: GRID.t, b: (GRID.t + GRID.b) / 2 - GUT / 2 },
  rightBottom: { l: MID + GUT / 2, r: GRID.r, t: (GRID.t + GRID.b) / 2 + GUT / 2, b: GRID.b }
};
const box = (c) => ({ x: (c.l + c.r) / 2, y: (c.t + c.b) / 2, w: c.r - c.l, h: c.b - c.t });

/**
 * A 16:9 still cropped to `cell`'s aspect around (cx, cy), the subject's
 * place in the source, at `zoom`, then scaled so the crop fills the cell.
 */
function cropped(s, name, cell, cx, cy, zoom, o = {}) {
  const { x, y, w, h } = box(cell);
  const aspect = w / h;
  let ch = 1 / zoom, cw = (aspect * ch * 9) / 16;
  if (cw > 1) { ch /= cw; cw = 1; }
  const left = Math.min(Math.max(cx - cw / 2, 0), 1 - cw), top = Math.min(Math.max(cy - ch / 2, 0), 1 - ch);
  const fitW = aspect < W / H ? H * aspect : W;
  return s.image(uri(name), {
    name, x, y, s: w / fitW, effects: [KEY],
    crop: { left, right: 1 - left - cw, top, bottom: 1 - top - ch }, ...o
  });
}

/** A rectangle as frame-normalized path data, for the plate that follows the first panel. */
function frameD(c) {
  const X = (px) => ((W / 2 + px) / W).toFixed(4), Y = (py) => ((H / 2 + py) / H).toFixed(4);
  return `M${X(c.l)} ${Y(c.t)} L${X(c.r)} ${Y(c.t)} L${X(c.r)} ${Y(c.b)} L${X(c.l)} ${Y(c.b)} Z`;
}
/** The same rectangle as a mask path in the layer space of a picture filling `outer`. */
function maskPath(c, outer) {
  const w = outer.r - outer.l, h = outer.b - outer.t;
  const X = (px) => ((px - outer.l) / w).toFixed(4), Y = (py) => ((py - outer.t) / h).toFixed(4);
  return `M${X(c.l)} ${Y(c.t)} L${X(c.r)} ${Y(c.t)} L${X(c.r)} ${Y(c.b)} L${X(c.l)} ${Y(c.b)} Z`;
}

/** A static panel: a tinted plate and its keyed picture, wiped on together from the left. */
function panel(s, name, cell, tint, crop, at, wipeDur) {
  const { x, y, w, h } = box(cell);
  const g = s.group({ name: `${name}-panel`, at });
  s.rect(w, h, tint, { name: `${name}-plate`, parent: g.id, x, y });
  cropped(s, name, cell, crop.cx, crop.cy, crop.zoom, { parent: g.id });
  s.rect(w, h, null, { name: `${name}-rule`, parent: g.id, x, y, stroke: "rgba(23,21,27,0.25)", sw: 2 });
  g.animate({ wipeProgress: [0, 1] }, { at: 0, dur: wipeDur, ease: SNAP, mask: { direction: "left", softness: 0 } });
  return g;
}

/** A line of supporting copy under the grid; it cuts in on its beat. */
function note(s, str, at, dur) {
  const t = s.text(str, { name: "note", anchor: "left", x: GRID.l, y: 505, mw: 0.78, font: SERIF, italic: true, size: 56, weight: 500, color: INK, at, dur });
  t.enter({ from: { opacity: 0 }, at: 0, dur: 0.18, ease: "linear" });
  return t;
}

const editorial = v.scene("Editorial", 12, (s) => {
  s.backdrop({ colors: [STONE, STONE2], opacity: 0.5, seed: 21 });

  // The headline is readable on frame 0 and does not move until the promise replaces it.
  s.text("PRISM RUNNER", { name: "kicker", anchor: "left", x: GRID.l, y: -712, mw: 0.5, font: SANS, size: 36, weight: 600, color: VIOLET, tracking: 0.24 });
  const l1 = s.text("Built for the", { name: "headline-1", font: SERIF, size: 128, weight: 500, color: INK, tracking: -0.02, dur: 7.0, style: { lineHeight: 1.02 } });
  const l2 = s.text("long way home.", { name: "headline-2", font: SERIF, size: 128, weight: 500, italic: true, color: INK, tracking: -0.02, dur: 7.0, style: { lineHeight: 1.02 } });
  // The headline fades out before the promise fades in, so the two never overlap.
  const headline = s.stack([l1, l2], { name: "headline", at: { x: GRID.l, y: -680 }, anchor: "top-left", align: "start", gap: 0, dur: 7.0 });
  headline.exit({ to: { opacity: 0 }, at: 6.82, dur: 0.18, ease: "linear" });

  // Panel 1: the shoe on lilac, wiped on in 350 ms at full grid width. In B2
  // it narrows into the left column; in B4 it widens back as the hero.
  const full = CELLS.full, left = CELLS.left;
  const plate = s.rect(W, H, "#d9d1f1", { name: "shoe-plate", kind: "path", shape: { d: frameD(full), stroke: "rgba(23,21,27,0.25)", strokeWidthPx: 2 } });
  const shoe = cropped(s, "shoe", full, 0.5, 0.52, 1.0, { mask: { kind: "path", d: maskPath(full, full) } });
  for (const el of [plate, shoe]) el.animate({ wipeProgress: [0, 1] }, { at: 0, dur: 0.35, ease: SNAP, mask: { direction: "left", softness: 0 } });
  // One window from 2.0 s to 7.45 s per channel: narrow over 450 ms, hold, widen
  // over 450 ms. The picture shifts so the shoe centres in the column while the
  // mask keeps the column's edges, and the plate's outline follows the mask.
  const shift = box(left).x - box(full).x;
  const fullMask = maskPath(full, full);
  const leftMask = maskPath({ l: left.l - shift, r: left.r - shift, t: left.t, b: left.b }, full);
  const SPAN = 5.45, A = 0.45 / SPAN, B = 5.0 / SPAN;
  const track = (from, to) => [[0, from], [A, to, EASE_IO], [B, to], [1, from, EASE_IO]];
  shoe.tween("mask.d", track(fullMask, leftMask), { at: 2.0, dur: SPAN });
  shoe.animate({ offsetX: track(0, shift) }, { at: 2.0, dur: SPAN, role: "emphasis" });
  plate.tween("shape.d", track(frameD(full), frameD(left)), { at: 2.0, dur: SPAN });

  // Panels 2 and 3 complete the grid, one wipe each.
  const p2 = panel(s, "athlete", CELLS.rightTop, "#efe1c9", { cx: 0.54, cy: 0.5, zoom: 1.25 }, 2.15, 0.3);
  const p3 = panel(s, "knit", CELLS.rightBottom, "#cfe2dc", { cx: 0.42, cy: 0.62, zoom: 1.5 }, 4.5, 0.25);
  p2.exit({ to: { offsetX: 120, opacity: 0 }, at: 4.85, dur: 0.3, ease: "inExpo" });
  p3.exit({ to: { offsetX: 120, opacity: 0 }, at: 2.55, dur: 0.3, ease: "inExpo" });

  // Supporting lines, one per beat, then the promise replaces the headline.
  note(s, "Made to move with you.", 2.0, 2.5);
  note(s, "One-piece knit. Not one seam.", 4.5, 2.5);
  s.seq(7.0, 5.0, (q) => {
    const p1 = q.text("Every mile feels", { name: "promise-1", font: SERIF, size: 128, weight: 500, color: INK, tracking: -0.02, style: { lineHeight: 1.02 } });
    const p2l = q.text("like the first.", { name: "promise-2", font: SERIF, size: 128, weight: 500, italic: true, color: INK, tracking: -0.02, style: { lineHeight: 1.02 } });
    q.stack([p1, p2l], { name: "promise", at: { x: GRID.l, y: -680 }, anchor: "top-left", align: "start", gap: 0 })
      .enter({ from: { opacity: 0 }, at: 0, dur: 0.25, ease: "linear" });
  });

  // B5 CTA: the hero panel plus one next step, then a hold.
  s.seq(9.5, 2.5, (q) => {
    const button = q.pill("Find your pair", { name: "cta", x: GRID.l, y: 548, anchor: { x: 0, y: 0.5 }, size: 52, weight: 600, color: STONE, fillColor: INK, stroke: "rgba(0,0,0,0)", font: SANS, padX: 64, padY: 28 });
    button.enter({ from: { opacity: 0, offsetY: 20 }, at: 0, dur: 0.25, ease: SNAP });
  });

  s.finish({ vignette: 0.08, softness: 0.85, grain: 0.035, seed: 12 });
});

v.series([editorial]);

const saved = await v.save(nodetool.timelines, {
  name: "Editorial image panels — Prism Runner",
  showcase: true
});
await output("timeline", {
  name: "Editorial image panels — Prism Runner",
  description: "A 12-second vertical editorial ad: a fixed grid fills one panel at a time under still type, then the hero panel widens for the promise and a CTA.",
  videoUri: "/ad-library/videos/editorial-image-panels.mp4",
  posterUri: "/ad-library/videos/editorial-image-panels.webp",
  ...saved
});
