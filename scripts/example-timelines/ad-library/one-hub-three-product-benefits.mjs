// Ad library R03, One hub, three product benefits: a 15-second vertical
// explainer for a fictional client-operations tool. The hub holds the top of
// the frame; one benefit card at a time connects to it and takes the focus.
//
// `node scripts/example-timelines/ad-library.mjs build one-hub-three-product-benefits`
// writes marketing/recipe-assets/ad-library/one-hub-three-product-benefits.timeline.json.
//
// The brand, its clients and its numbers are fictional. Every time value is
// seconds from the start of the ad, the beat times in
// marketing/src/data/adLibrary.json. Positions are px from the frame centre
// on a 1080×1920 frame.
//
// Motion language: one entrance curve (SNAP), one exit curve (inExpo), 300 ms
// connector draws, 250 ms card entrances, an 80 ms word stagger, no
// overshoot except the hub's single settle.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const BG = "#eef1f7", BG2 = "#dfe4f0", CARD = "#ffffff", INK = "#141a2b", DIM = "#5b6378", LINE = "#c9cfdd";
const INDIGO = "#4f5bff";
const FEATURES = [
  { title: "Requests", detail: "12 new this week", tone: "#0f9f8f", glyph: "mail", caption: "Requests land in one inbox" },
  { title: "Bookings", detail: "Next call Tue 10:00", tone: "#d98a00", glyph: "calendar", caption: "Clients book their own calls" },
  { title: "Invoices", detail: "$4,820 sent, 3 paid", tone: "#d6407f", glyph: "invoice", caption: "Invoices go out when work ships" }
];
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const SETTLE = "cubic-bezier(0.3,1.25,0.6,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: BG, ink2: BG2, text: INK, dim: DIM, accent: INDIGO },
  fonts: { display: "Inter", body: "Inter" }
});

const HUB = { x: 0, y: -620, d: 200 };
const BUS_X = -455;
const CARD_X = 40, CARD_W = 860, CARD_H = 230;
const CARD_Y = [-320, -60, 200];

/** A white glyph for an app tile or a card icon, drawn around the group origin at size `u`. */
function glyph(s, kind, parent, u) {
  const o = { parent, stroke: "#ffffff", sw: Math.max(4, u * 0.07) };
  if (kind === "mail") {
    s.rect(u * 0.62, u * 0.44, null, { ...o, name: "glyph-mail", r: u * 0.05 });
    s.path([["M", -u * 0.29, -u * 0.18], ["L", 0, u * 0.04], ["L", u * 0.29, -u * 0.18]], { ...o, name: "glyph-mail-flap" });
  } else if (kind === "calendar") {
    s.rect(u * 0.6, u * 0.52, null, { ...o, name: "glyph-calendar", r: u * 0.05, y: u * 0.04 });
    s.rect(u * 0.6, u * 0.1, "#ffffff", { parent, name: "glyph-calendar-band", y: -u * 0.17 });
    s.ellipse(u * 0.1, "#ffffff", { parent, name: "glyph-calendar-day", x: u * 0.12, y: u * 0.1 });
  } else if (kind === "invoice") {
    s.rect(u * 0.46, u * 0.6, null, { ...o, name: "glyph-invoice", r: u * 0.04 });
    [-0.12, 0.02, 0.16].forEach((dy, k) => s.rect(u * (k === 2 ? 0.16 : 0.26), u * 0.05, "#ffffff", { parent, name: `glyph-invoice-line-${k}`, y: dy * u, x: k === 2 ? u * 0.05 : 0 }));
  } else if (kind === "chat") {
    s.rect(u * 0.62, u * 0.44, null, { ...o, name: "glyph-chat", r: u * 0.14, y: -u * 0.04 });
    s.path([["M", -u * 0.14, u * 0.18], ["L", -u * 0.2, u * 0.3], ["L", -u * 0.02, u * 0.18]], { ...o, name: "glyph-chat-tail" });
  } else {
    [-0.14, 0, 0.14].forEach((dy, k) => s.rect(u * 0.52, u * 0.05, "#ffffff", { parent, name: `glyph-doc-line-${k}`, y: dy * u }));
  }
}

/** A rounded app tile with a glyph, centred on its group. */
function tile(s, kind, tone, o) {
  const { x = 0, y = 0, size = 120, parent, name = `tile-${kind}`, at, dur } = o;
  const g = s.group({ name, parent, x, y, at, dur });
  s.rect(size, size, tone, { name: `${name}-plate`, parent: g.id, r: size * 0.24, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 10, blur: 24, color: "rgba(20,26,43,0.16)" }] });
  glyph(s, kind, g.id, size);
  return g;
}

/** A benefit card: icon tile, title, one detail line and a status mark. */
function card(s, f, i, parent) {
  const g = s.group({ name: `card-${i}`, parent, x: CARD_X, y: CARD_Y[i], at: 2 + i * 3 });
  s.rect(CARD_W, CARD_H, CARD, { name: `card-${i}-plate`, parent: g.id, r: 32, stroke: LINE, sw: 2, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 18, blur: 44, color: "rgba(20,26,43,0.12)" }] });
  s.rect(8, CARD_H - 64, f.tone, { name: `card-${i}-accent`, parent: g.id, x: -CARD_W / 2 + 24, r: 4 });
  tile(s, f.glyph, f.tone, { name: `card-${i}-icon`, parent: g.id, x: -CARD_W / 2 + 124, size: 124 });
  s.text(f.title, { name: `card-${i}-title`, parent: g.id, anchor: "left", x: -CARD_W / 2 + 222, y: -32, mw: 0.5, size: 60, weight: 700, color: INK, tracking: -0.02 });
  s.text(f.detail, { name: `card-${i}-detail`, parent: g.id, anchor: "left", x: -CARD_W / 2 + 222, y: 42, mw: 0.55, size: 46, weight: 500, color: DIM });
  const check = s.ellipse(64, f.tone, { name: `card-${i}-status`, parent: g.id, x: CARD_W / 2 - 80 });
  s.path([["M", CARD_W / 2 - 96, 0], ["L", CARD_W / 2 - 84, 12], ["L", CARD_W / 2 - 62, -12]], { name: `card-${i}-tick`, parent: g.id, stroke: "#ffffff", sw: 7 });
  check.enter({ from: { scale: 0 }, at: 0.5, dur: 0.25, ease: SETTLE });
  return g;
}

/** The branch from the hub along the bus into card `i`'s left edge. */
function connectorPoints(i) {
  const y = CARD_Y[i];
  return [["M", HUB.x - HUB.d / 2, HUB.y], ["L", BUS_X + 30, HUB.y], ["Q", BUS_X, HUB.y, BUS_X, HUB.y + 30], ["L", BUS_X, y - 30], ["Q", BUS_X, y, BUS_X + 30, y], ["L", CARD_X - CARD_W / 2, y]];
}

/** A caption in the slot under the system, rising in word by word. */
function caption(s, str, at, dur, o = {}) {
  const t = s.text(str, { name: o.name ?? "caption", y: o.y ?? 460, mw: 0.84, size: o.size ?? 68, weight: 700, color: INK, tracking: -0.025, at, dur, style: { lineHeight: 1.1 } });
  t.enter({ from: { offsetY: 30, opacity: 0 }, at: 0, dur: 0.3, ease: SNAP, by: "word", staggerMs: 80 });
  return t;
}

const hub = v.scene("Hub", 15, (s) => {
  s.backdrop({ colors: [BG, BG2], opacity: 0.7, seed: 11 });
  // A faint dot grid: the workspace the hub sits in.
  s.ellipse(6, LINE, { name: "grid-dots", x: -480, y: -880, repeater: { count: 120, columns: 10, positionStep: { x: 106, y: 0 }, rowStep: { x: 0, y: 160 }, timeStepMs: 0 }, opacity: 0.8 });

  const system = s.group({ name: "system" });

  // B1 hook: five separate tools jitter around the hub, then fly into it at 2.0 s.
  const tools = [["mail", "#0f9f8f", -330, -250], ["calendar", "#d98a00", 300, -300], ["chat", "#6b5bd6", -250, 40], ["doc", "#3b82f6", 320, 20], ["invoice", "#d6407f", 30, -120]];
  tools.forEach(([kind, tone, x, y], k) => {
    const t = tile(s, kind, tone, { name: `tool-${kind}`, parent: system.id, x, y, size: 132, dur: 2.3 });
    t.enter({ from: { scale: 0.5 }, at: k * 0.05, dur: 0.3, ease: SETTLE });
    const wobble = s.noise(20 + k);
    t.expr((tt) => ({ offsetX: (wobble(tt * 1.6) - 0.5) * 30, offsetY: (wobble(tt * 1.6 + 40) - 0.5) * 30, rotation: (wobble(tt * 1.2 + 80) - 0.5) * 10 }), { at: 0, dur: 2.0, role: "emphasis" });
    t.exit({ to: { offsetX: HUB.x - x, offsetY: HUB.y - y, scale: 0.2, opacity: 0 }, at: 2.0, dur: 0.3, ease: "inExpo" });
  });

  // The connectors draw in 300 ms when their card arrives.
  CARD_Y.forEach((_, i) => {
    const c = s.path(connectorPoints(i), { name: `connector-${i}`, parent: system.id, stroke: INDIGO, sw: 8, at: 2 + i * 3 });
    c.draw({ at: 0, dur: 0.3, ease: "inOut" });
    const dot = s.ellipse(22, INDIGO, { name: `connector-${i}-node`, parent: system.id, x: CARD_X - CARD_W / 2, y: CARD_Y[i], at: 2.25 + i * 3 });
    dot.enter({ from: { scale: 0 }, at: 0, dur: 0.2, ease: SETTLE });
  });

  // The hub: settles once in 300 ms, absorbs the tools with a pulse, then holds.
  const hubG = s.group({ name: "hub", parent: system.id, x: HUB.x, y: HUB.y });
  s.glow({ name: "hub-glow", parent: hubG.id, size: 520, alpha: 0.35, color: INDIGO });
  s.ellipse(HUB.d, { type: "linear", angle: 135, stops: [{ offset: 0, color: "#7a84ff" }, { offset: 1, color: "#3a43d8" }] }, { name: "hub-disc", parent: hubG.id, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 16, blur: 40, color: "rgba(79,91,255,0.35)" }] });
  const pts = [[0, -38], [-36, 26], [36, 26]];
  pts.forEach(([a, b], k) => {
    const [c, d] = pts[(k + 1) % 3];
    s.path([["M", a, b], ["L", c, d]], { name: `hub-link-${k}`, parent: hubG.id, stroke: "rgba(255,255,255,0.75)", sw: 6 });
  });
  pts.forEach(([a, b], k) => s.ellipse(30, "#ffffff", { name: `hub-node-${k}`, parent: hubG.id, x: a, y: b }));
  hubG.enter({ from: { scale: 0.8 }, at: 0, dur: 0.3, ease: SETTLE });
  hubG.animate({ scale: [[0, 1], [0.4, 1.12, "out"], [1, 1, "inOut"]] }, { at: 2.15, dur: 0.5, role: "emphasis" });
  const ring = s.ellipse(HUB.d, null, { name: "hub-ring", parent: system.id, x: HUB.x, y: HUB.y, stroke: INDIGO, sw: 4, at: 2.15, dur: 0.8 });
  ring.animate({ scale: [1, 1.9, "out"], opacity: [0.8, 0, "out"] }, { at: 0, dur: 0.8, role: "emphasis" });

  // Faint slots for the cards still to come, so the system reads as unfinished.
  CARD_Y.forEach((y, i) => {
    if (i === 0) return;
    const slot = s.rect(CARD_W, CARD_H, "rgba(255,255,255,0.35)", { name: `slot-${i}`, parent: system.id, x: CARD_X, y, r: 32, stroke: LINE, sw: 3, at: 2.1, dur: i * 3 + 0.1 });
    slot.enter({ from: { opacity: 0 }, at: 0, dur: 0.3, ease: "linear" });
  });

  // B2–B4: one card at a time. Each slides 0.08 heights up and settles; the
  // one before it dims to 0.45. The finished system scales back 8%.
  FEATURES.forEach((f, i) => {
    const g = card(s, f, i, system.id);
    g.enter({ from: { offsetY: 0.08 * H, opacity: 0 }, at: 0.15, dur: 0.25, ease: SNAP });
    if (i < 2) {
      // Dim when the next card arrives, hold, and come back when the system is complete at 9.5 s.
      const len = 9.9 - (5 + i * 3);
      const a = 0.25 / len, b = (len - 0.4) / len;
      g.animate({
        opacity: [[0, 1], [a, 0.45, "out"], [b, 0.45], [1, 1, "inOut"]],
        scale: [[0, 1], [a, 0.97, "out"], [b, 0.97], [1, 1, "inOut"]]
      }, { at: 3, dur: len, role: "emphasis" });
    }
  });
  system.animate({ scale: [1, 0.92, "inOut"], offsetY: [0, -30, "inOut"] }, { at: 9.5, dur: 0.6, role: "out" });

  // The copy slot: the problem, then one caption per benefit.
  caption(s, "Five apps for one client request?", 0, 2, { name: "problem", size: 76 });
  FEATURES.forEach((f, i) => caption(s, f.caption, 2 + i * 3, i === 2 ? 3.5 : 3, { name: `caption-${i}` }));

  // B5 outcome and CTA: a 180 ms fade, then nothing moves.
  s.seq(11.5, 3.5, (q) => {
    const outcome = q.text("Every client, one hub.", { name: "outcome", y: 425, mw: 0.84, size: 76, weight: 800, color: INK, tracking: -0.03 });
    outcome.enter({ from: { opacity: 0 }, at: 0, dur: 0.18, ease: "linear" });
    const button = q.pill("Try Relay free", { name: "cta", y: 548, size: 52, weight: 700, color: "#ffffff", fillColor: INDIGO, stroke: "rgba(0,0,0,0)", padX: 70, padY: 28 });
    button.enter({ from: { opacity: 0, offsetY: 20 }, at: 0.1, dur: 0.25, ease: SNAP });
  });

  s.finish({ vignette: 0.12, softness: 0.8, grain: 0.02, seed: 4 });
});

v.series([hub]);

const saved = await v.save(nodetool.timelines, {
  name: "One hub, three benefits — Relay",
  showcase: true
});
await output("timeline", {
  name: "One hub, three benefits — Relay",
  description: "A 15-second vertical explainer: scattered tools collapse into one hub, three benefit cards connect to it one at a time, then the system holds under a CTA.",
  videoUri: "/ad-library/videos/one-hub-three-product-benefits.mp4",
  posterUri: "/ad-library/videos/one-hub-three-product-benefits.webp",
  ...saved
});
