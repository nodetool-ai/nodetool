// Ad library R10, Integration puzzle that snaps together: a 10-second
// vertical ad for a fictional integration platform. Eight tool tiles snap
// around one brand tile into a single object; the assembly is the metaphor,
// not proof of any real integration.
//
// `node scripts/example-timelines/ad-library.mjs build integration-puzzle-that-snaps-together`
// writes marketing/recipe-assets/ad-library/integration-puzzle-that-snaps-together.timeline.json.
//
// The platform is fictional and the tiles are generic tool types, not real
// products or logos. This is the native 2D version, so the resolve uses
// scale only. Every time value is seconds from the start of the ad, the beat
// times in marketing/src/data/adLibrary.json. Positions are px from the frame
// centre on a 1080×1920 frame.
//
// Motion language: tiles snap 100 ms apart in 350 ms with at most 5%
// overshoot (SNAP_BACK), one pulse on the finished object, type that fades.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const STAGE = "#101226", STAGE2 = "#1d1f45", TEXT = "#f5f6ff", DIM = "#a3a7cf", LIME = "#c6f432", INK = "#14152b";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const SNAP_BACK = "cubic-bezier(0.3,1.22,0.6,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: STAGE, ink2: STAGE2, text: TEXT, dim: DIM, accent: LIME },
  fonts: { display: "Inter", body: "Inter" }
});

const OBJ_Y = -20, CELL = 262, TILE = 246;
// Clockwise from the top-left; the brand tile holds the centre.
const TOOLS = [
  { label: "Mail", glyph: "mail", tint: "#c7d7ff", c: -1, r: -1 },
  { label: "Calendar", glyph: "calendar", tint: "#ffd9a8", c: 0, r: -1 },
  { label: "Chat", glyph: "chat", tint: "#d9c7ff", c: 1, r: -1 },
  { label: "Files", glyph: "files", tint: "#bfeee0", c: 1, r: 0 },
  { label: "Payments", glyph: "card", tint: "#ffc7d6", c: 1, r: 1 },
  { label: "Forms", glyph: "forms", tint: "#fff1a8", c: 0, r: 1 },
  { label: "CRM", glyph: "person", tint: "#c2ecff", c: -1, r: 1 },
  { label: "Docs", glyph: "doc", tint: "#e0e3ec", c: -1, r: 0 }
];

/** A tool glyph in ink, centred on the group origin, `u` px across. */
function glyph(s, kind, parent, y, u) {
  const line = { parent, stroke: INK, sw: 7 };
  const at = (dx, dy) => ({ x: dx, y: y + dy });
  if (kind === "mail") {
    s.rect(u, u * 0.7, null, { ...line, ...at(0, 0), name: "g-mail", r: 8 });
    s.path([["M", -u / 2 + 6, y - u * 0.3], ["L", 0, y + u * 0.05], ["L", u / 2 - 6, y - u * 0.3]], { ...line, name: "g-mail-flap" });
  } else if (kind === "calendar") {
    s.rect(u, u * 0.84, null, { ...line, ...at(0, 4), name: "g-cal", r: 8 });
    s.rect(u, 16, INK, { parent, ...at(0, -u * 0.3), name: "g-cal-band", r: 4 });
    s.rect(20, 20, INK, { parent, ...at(u * 0.2, u * 0.16), name: "g-cal-day", r: 4 });
  } else if (kind === "chat") {
    s.rect(u, u * 0.66, null, { ...line, ...at(0, -6), name: "g-chat", r: 22 });
    s.path([["M", -u * 0.2, y + u * 0.27], ["L", -u * 0.3, y + u * 0.46], ["L", -u * 0.02, y + u * 0.27]], { ...line, name: "g-chat-tail" });
  } else if (kind === "files") {
    s.path([["M", -u / 2, y - u * 0.3], ["L", -u * 0.1, y - u * 0.3], ["L", 0, y - u * 0.2], ["L", u / 2, y - u * 0.2], ["L", u / 2, y + u * 0.36], ["L", -u / 2, y + u * 0.36], ["Z"]], { ...line, name: "g-folder" });
  } else if (kind === "card") {
    s.rect(u, u * 0.66, null, { ...line, ...at(0, 0), name: "g-card", r: 10 });
    s.rect(u, 14, INK, { parent, ...at(0, -u * 0.12), name: "g-card-stripe" });
  } else if (kind === "forms") {
    [-0.24, 0.12].forEach((dy, k) => {
      s.rect(26, 26, null, { ...line, ...at(-u * 0.36, dy * u), name: `g-form-box-${k}`, r: 5, sw: 6 });
      s.rect(u * 0.56, 10, INK, { parent, ...at(u * 0.16, dy * u), name: `g-form-line-${k}`, r: 5 });
    });
  } else if (kind === "person") {
    s.ellipse(u * 0.38, null, { ...line, ...at(0, -u * 0.18), name: "g-head" });
    s.path([["M", -u * 0.38, y + u * 0.4], ["Q", -u * 0.38, y + u * 0.06, 0, y + u * 0.06], ["Q", u * 0.38, y + u * 0.06, u * 0.38, y + u * 0.4]], { ...line, name: "g-body" });
  } else {
    [-0.28, -0.04, 0.2].forEach((dy, k) => s.rect(u * (k === 2 ? 0.6 : 0.9), 10, INK, { parent, ...at(k === 2 ? -u * 0.15 : 0, dy * u), name: `g-doc-${k}`, r: 5 }));
  }
}

/** One tool tile, centred on its group. */
function toolTile(s, t, parent) {
  const g = s.group({ name: `tile-${t.label.toLowerCase()}`, parent, x: t.c * CELL, y: OBJ_Y + t.r * CELL });
  s.rect(TILE, TILE, t.tint, { name: `tile-${t.label}-plate`, parent: g.id, r: 44, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 18, blur: 36, color: "rgba(0,0,0,0.35)" }] });
  glyph(s, t.glyph, g.id, -28, 78);
  s.text(t.label, { name: `tile-${t.label}-label`, parent: g.id, y: 68, mw: 0.2, size: 38, weight: 700, color: INK, tracking: -0.02 });
  return g;
}

const puzzle = v.scene("Puzzle", 10, (s) => {
  s.backdrop({ colors: [STAGE, STAGE2], opacity: 0.8, seed: 41 });
  s.glow({ name: "object-light", size: 1400, alpha: 0.2, color: LIME, y: OBJ_Y });

  const object = s.group({ name: "object" });
  // B3 resolve: one pulse, scale only.
  object.animate({ scale: [[0, 1], [0.45, 1.045, "out"], [1, 1, "inOut"]] }, { at: 4.15, dur: 0.6, role: "emphasis" });

  // The links light up once the object is whole, centre outwards.
  TOOLS.forEach((t, i) => {
    const link = s.path([["M", 0, OBJ_Y], ["L", t.c * CELL, OBJ_Y + t.r * CELL]], { name: `link-${i}`, parent: object.id, stroke: LIME, sw: 8, at: 3.9, effects: [{ type: "glow", radius: 16, intensity: 0.8 }] });
    link.draw({ at: i * 0.03, dur: 0.3, ease: SNAP });
  });

  // B1 hook: the tiles start pushed apart and pull against each other.
  TOOLS.forEach((t, i) => {
    const g = toolTile(s, t, object.id);
    // Pushed apart within the frame: less upward travel, so the top row clears the headline.
    const dx = t.c * (90 + (i % 3) * 25), dy = t.r * (t.r < 0 ? 60 : 130 + (i % 2) * 30) + (t.r === 0 ? (i % 2 ? 40 : -40) : 0);
    const rot = (i % 2 ? 1 : -1) * (8 + (i % 3) * 3);
    const sway = (i % 2 ? 1 : -1) * 10;
    // Held apart with a small opposing sway, then snapped home 100 ms apart in 350 ms.
    const start = 1.5 + i * 0.1, end = start + 0.35;
    const T = (sec) => sec / end;
    g.animate({
      offsetX: [[0, dx], [T(0.75), dx + sway], [T(start), dx - sway * 0.5, "inOut"], [1, 0, SNAP_BACK]],
      offsetY: [[0, dy], [T(0.75), dy - sway], [T(start), dy + sway * 0.5, "inOut"], [1, 0, SNAP_BACK]],
      rotation: [[0, rot], [T(start), rot * 0.8, "inOut"], [1, 0, SNAP_BACK]]
    }, { at: 0, dur: end, role: "in" });
  });

  // The brand tile: the fixed piece everything snaps to.
  const brand = s.group({ name: "brand-tile", parent: object.id, y: OBJ_Y });
  s.rect(TILE, TILE, LIME, { name: "brand-plate", parent: brand.id, r: 44, effects: [{ type: "glow", radius: 30, intensity: 0.5 }] });
  s.ellipse(92, null, { name: "brand-ring-a", parent: brand.id, x: -24, y: -22, stroke: INK, sw: 14 });
  s.ellipse(92, null, { name: "brand-ring-b", parent: brand.id, x: 24, y: -22, stroke: INK, sw: 14 });
  s.text("knot", { name: "brand-word", parent: brand.id, y: 68, mw: 0.2, size: 44, weight: 800, color: INK, tracking: -0.04 });

  // The copy: one headline per beat at the top, the detail under the object.
  [["Your tools don't talk to each other", 0, 1.5], ["Eight tools, one connected workspace", 1.5, 2.5], ["Change it once. Updated everywhere.", 4.0, 6.0]].forEach(([str, at, dur], i) => {
    const t = s.text(str, { name: `headline-${i}`, y: -580, mw: 0.86, size: 82, weight: 800, color: i === 2 ? LIME : TEXT, tracking: -0.035, at, dur, style: { lineHeight: 1.06 } });
    t.enter({ from: { offsetY: 30, opacity: 0.25 }, at: 0, dur: 0.25, ease: SNAP, by: "word", staggerMs: 40 });
  });
  const detail = s.text("Two-way sync. No copy and paste.", { name: "detail", y: 448, mw: 0.86, size: 52, weight: 600, color: DIM, at: 6.5 });
  detail.enter({ from: { opacity: 0 }, at: 0, dur: 0.18, ease: "linear" });

  // B5 CTA: the object and one next step, held.
  s.seq(8, 2, (q) => {
    const button = q.pill("Connect your stack", { name: "cta", y: 552, size: 54, weight: 800, color: INK, fillColor: LIME, stroke: "rgba(0,0,0,0)", padX: 74, padY: 30 });
    button.enter({ from: { offsetY: 24, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  });

  s.finish({ vignette: 0.22, softness: 0.7, grain: 0.04, seed: 9 });
});

v.series([puzzle]);

const saved = await v.save(nodetool.timelines, {
  name: "Integration puzzle — Knot",
  showcase: true
});
await output("timeline", {
  name: "Integration puzzle — Knot",
  description: "A 10-second vertical ad: eight tool tiles held apart snap around one brand tile into a single object, light up their links, pulse once, and hold under a CTA.",
  videoUri: "/ad-library/videos/integration-puzzle-that-snaps-together.mp4",
  posterUri: "/ad-library/videos/integration-puzzle-that-snaps-together.webp",
  ...saved
});
