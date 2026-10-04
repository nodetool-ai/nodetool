// Ad library R01, Kinetic offer wall: a 10-second vertical offer ad for a
// fictional coffee roaster. The offer holds the top of the frame for the
// whole ad while packs swap under it.
//
// `node scripts/example-timelines/ad-library.mjs build kinetic-offer-wall`
// writes marketing/recipe-assets/ad-library/kinetic-offer-wall.timeline.json.
//
// The brand, the offer and its terms are fictional. Every time value is
// seconds from the start of the ad, the beat times in
// marketing/src/data/adLibrary.json. Positions are px from the frame centre
// on a 1080×1920 frame.
//
// Motion language: one entrance curve (SNAP), one landing with at most 6%
// overshoot (LAND) for pack swaps, a 75 ms word stagger, hard cuts only.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const CREAM = "#f4ecdc", CREAM2 = "#eadcc0", WALL = "#e8d9bc";
const INK = "#1d1712", DIM = "#6b5d4f", RED = "#d23f26", CARD = "#fffaf0";
const ROASTS = [
  { name: "KIVU", origin: "Rwanda", color: "#2e5a45" },
  { name: "ALTO", origin: "Peru", color: "#b9512f" },
  { name: "NOCHE", origin: "Colombia", color: "#26365a" }
];
const DISPLAY = "display", BODY = "body";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const LAND = "cubic-bezier(0.3,1.22,0.6,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: CREAM, ink2: CREAM2, text: INK, dim: DIM, accent: RED },
  fonts: { display: "Bebas Neue", body: "Inter" }
});

/** `hex` lightened (amt > 0) or darkened (amt < 0) toward white or black. */
function tone(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * One coffee bag, drawn from shapes and centred on its group: a shaded body,
 * a crimped top, a degassing valve and a label. Returns the group.
 */
function bag(s, roast, o) {
  const { x = 0, y = 0, scale = 1, at, dur, name = `bag-${roast.name.toLowerCase()}` } = o;
  const g = s.group({ name, x, y, s: scale, at, dur });
  const c = roast.color;
  const at0 = 0;
  const body = { type: "linear", angle: 0, stops: [
    { offset: 0, color: tone(c, -0.35) }, { offset: 0.16, color: c }, { offset: 0.42, color: tone(c, 0.16) },
    { offset: 0.7, color: c }, { offset: 1, color: tone(c, -0.4) }
  ] };
  s.rect(360, 480, body, { name: `${name}-body`, parent: g.id, r: 26, at: at0 });
  s.rect(360, 64, tone(c, -0.22), { name: `${name}-crimp`, parent: g.id, y: -208, r: 14, at: at0 });
  s.rect(320, 4, tone(c, 0.25), { name: `${name}-seal`, parent: g.id, y: -172, opacity: 0.7, at: at0 });
  s.ellipse(34, tone(c, -0.3), { name: `${name}-valve`, parent: g.id, x: 120, y: -128, stroke: tone(c, 0.2), sw: 3, at: at0 });
  s.rect(250, 230, CARD, { name: `${name}-label`, parent: g.id, y: 46, r: 16, at: at0 });
  s.rect(250, 14, c, { name: `${name}-label-band`, parent: g.id, y: 140, at: at0 });
  s.text(roast.name, { name: `${name}-name`, parent: g.id, y: 20, font: DISPLAY, size: 118, weight: 400, color: c, tracking: 0.02, mw: 0.22, at: at0 });
  s.text(roast.origin.toUpperCase(), { name: `${name}-origin`, parent: g.id, y: 96, font: BODY, size: 30, weight: 600, color: DIM, tracking: 0.16, mw: 0.22, at: at0 });
  return g;
}

/** A pack that lands at the shared anchor: 0.12 frame widths in 240 ms, a little overshoot. */
function landFromRight(g) {
  g.enter({ from: { offsetX: 0.12 * W }, at: 0, dur: 0.24, ease: LAND });
  return g;
}

const BAG_Y = 140, BAG_S = 1.15;
const CARD_Y = 110;

const offer = v.scene("Offer", 10, (s) => {
  s.backdrop({ colors: [CREAM, CREAM2], opacity: 0.6, seed: 5 });

  // The wall: the offer repeated in a brick grid, in a tone close to the
  // paper. Alternate rows drift in opposite directions. It is texture, so it
  // never competes with the readable offer, and it slides off when the
  // benefit arrives.
  const wall = s.group({ name: "wall", dur: 6.5 });
  const rows = [0, 1].map((k) => s.text("25% OFF", {
    name: `wall-rows-${k}`, parent: wall.id, x: -1200 + k * 300, y: -900 + k * 210, font: DISPLAY, size: 180, weight: 400,
    color: WALL, mw: 0.6, repeater: { count: 25, columns: 5, positionStep: { x: 600, y: 0 }, rowStep: { x: 0, y: 420 }, timeStepMs: 0 }
  }));
  rows[0].animate({ offsetX: [0, -0.08 * W, "linear"] }, { at: 0, dur: 4.0 });
  rows[1].animate({ offsetX: [0, 0.08 * W, "linear"] }, { at: 0, dur: 4.0 });
  rows[0].exit({ to: { offsetX: -2800 }, at: 4.0, dur: 0.48, ease: "inExpo" });
  rows[1].exit({ to: { offsetX: 2800 }, at: 4.0, dur: 0.48, ease: "inExpo" });

  // The contact shadow stays put: every pack shares this baseline.
  const shadow = s.rect(380, 56, "rgba(29,23,18,0.32)", { name: "contact-shadow", kind: "ellipse", y: BAG_Y + 290, dur: 6.5, effects: [{ type: "blur", radius: 18 }] });
  shadow.animate({ scaleX: [1, 1.1] }, { at: 4.0, dur: 2.5, ease: "inOut" });

  // B1 hook: one pack is already on screen.
  bag(s, ROASTS[0], { y: BAG_Y, scale: BAG_S, at: 0, dur: 1.5 });

  // B2 range: a new pack every 700 ms, each cut in at the same anchor.
  landFromRight(bag(s, ROASTS[1], { y: BAG_Y, scale: BAG_S, at: 1.5, dur: 0.7 }));
  landFromRight(bag(s, ROASTS[2], { y: BAG_Y, scale: BAG_S, at: 2.2, dur: 0.7 }));
  const hero = landFromRight(bag(s, ROASTS[0], { name: "bag-hero", y: BAG_Y, scale: BAG_S, at: 2.9, dur: 3.6 }));
  // B3 benefit: the hero grows 8% while the wall recedes.
  hero.animate({ scale: [1, 1.08] }, { at: 1.1, dur: 2.5, ease: "inOut" });

  // The offer: the hero of every frame. Word by word, 75 ms apart, 260 ms per word.
  const line1 = s.text("25% OFF", { name: "offer-amount", font: DISPLAY, size: 360, weight: 400, color: RED, tracking: -0.01, style: { lineHeight: 0.92 } });
  const line2 = s.text("EVERY BAG", { name: "offer-scope", font: DISPLAY, size: 190, weight: 400, color: INK, tracking: 0.03, style: { lineHeight: 0.92 } });
  line1.enter({ from: { offsetY: 80, opacity: 0 }, at: 0, dur: 0.26, ease: SNAP, by: "word", staggerMs: 75 });
  line2.enter({ from: { offsetY: 80, opacity: 0 }, at: 0.15, dur: 0.26, ease: SNAP, by: "word", staggerMs: 75 });
  s.stack([line1, line2], { name: "offer", at: { x: 0, y: -720 }, anchor: "top", align: "center", gap: 0 });

  // One message slot under the pack: the range label, then the benefit.
  const range = s.text("Three single-origin roasts", { name: "range-label", y: 520, font: BODY, size: 56, weight: 600, color: INK, tracking: -0.01, at: 1.5, dur: 2.5 });
  range.enter({ from: { offsetY: 24, opacity: 0 }, at: 0, dur: 0.24, ease: SNAP });
  const benefit = s.pill("Roasted Monday, at your door Thursday", { name: "benefit", y: 520, size: 44, weight: 600, color: CARD, fillColor: INK, stroke: "rgba(0,0,0,0)", font: BODY, at: 4.0, dur: 2.5 });
  benefit.enter({ from: { scale: 0.7, opacity: 0 }, at: 0, dur: 0.24, ease: LAND });

  // B4 proof of offer: the hero shrinks into a card holding the brand, the
  // whole range and the terms. Only the terms fade; then everything holds.
  s.seq(6.5, 3.5, (q) => {
    const card = q.rect(900, 620, CARD, { name: "terms-card", y: CARD_Y, r: 40, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 24, blur: 60, color: "rgba(29,23,18,0.18)" }] });
    card.enter({ from: { opacity: 0, scale: 0.96 }, at: 0, dur: 0.12, ease: SNAP });
    const mark = q.text("NORTHBANK ROASTERS", { name: "wordmark", y: CARD_Y - 250, font: BODY, size: 48, weight: 700, color: INK, tracking: 0.12 });
    mark.enter({ from: { opacity: 0 }, at: 0.06, dur: 0.18, ease: "linear" });
    [ROASTS[1], ROASTS[0], ROASTS[2]].forEach((roast, i) => {
      const g = bag(q, roast, { name: `card-bag-${i}`, x: (i - 1) * 260, y: CARD_Y - 30, scale: 0.6 });
      // The middle pack is the hero shrinking into place; the two beside it slide out from behind it.
      if (i === 1) g.enter({ from: { scale: (1.08 * BAG_S) / 0.6, offsetY: BAG_Y - CARD_Y + 30 }, at: 0, dur: 0.24, ease: SNAP });
      else g.enter({ from: { offsetX: -(i - 1) * 260, opacity: 0 }, at: 0.06, dur: 0.24, ease: SNAP });
    });
    const terms1 = q.text("All whole-bean bags. Code ROAST25.", { name: "terms-1", y: CARD_Y + 205, font: BODY, size: 46, weight: 600, color: INK, mw: 0.8 });
    const terms2 = q.text("Ends Sunday at 23:59.", { name: "terms-2", y: CARD_Y + 265, font: BODY, size: 46, weight: 500, color: DIM, mw: 0.8 });
    terms1.enter({ from: { opacity: 0 }, at: 0.18, dur: 0.18, ease: "linear" });
    terms2.enter({ from: { opacity: 0 }, at: 0.24, dur: 0.18, ease: "linear" });
  });

  // B5 CTA: the button settles within 200 ms, then the frame holds.
  s.seq(8.5, 1.5, (q) => {
    const button = q.pill("Shop the roasts", { name: "cta", y: CARD_Y + 430, size: 54, weight: 700, color: CARD, fillColor: RED, stroke: "rgba(0,0,0,0)", font: BODY, padX: 72, padY: 30 });
    button.enter({ from: { offsetY: 40, scale: 0.9, opacity: 0 }, at: 0, dur: 0.2, ease: SNAP });
  });

  s.finish({ vignette: 0.14, softness: 0.8, grain: 0.03, seed: 7 });
});

v.series([offer]);

const saved = await v.save(nodetool.timelines, {
  name: "Kinetic offer wall — Northbank Roasters",
  showcase: true
});
await output("timeline", {
  name: "Kinetic offer wall — Northbank Roasters",
  description: "A 10-second vertical offer ad: the offer holds the top of the frame while coffee packs swap under it, then settles into a terms card and a CTA.",
  videoUri: "/ad-library/videos/kinetic-offer-wall.mp4",
  posterUri: "/ad-library/videos/kinetic-offer-wall.webp",
  ...saved
});
