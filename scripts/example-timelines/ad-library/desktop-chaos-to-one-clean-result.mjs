// Ad library R08, Desktop chaos to one clean result: a 12-second vertical ad
// for a fictional research-brief tool. A pile of windows collapses into one
// clean card; the change is in visual density, not in a new scene.
//
// `node scripts/example-timelines/ad-library.mjs build desktop-chaos-to-one-clean-result`
// writes marketing/recipe-assets/ad-library/desktop-chaos-to-one-clean-result.timeline.json.
//
// The tool, the client and the brief are fictional; the windows are drawn
// from shapes. Every time value is seconds from the start of the ad, the beat
// times in marketing/src/data/adLibrary.json. Positions are px from the frame
// centre on a 1080×1920 frame.
//
// Motion language: windows arrive every 100 ms (SNAP), the collapse is one
// 500 ms outExpo move to a single anchor, the result wipes in once and then
// moves less than 2%. The orange accent belongs to the result alone.
import { video, hash } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const STAGE = "#ecebe7", STAGE2 = "#dedcd6", INK = "#1a1a1f", DIM = "#6b6a72", RULE = "#d9d7d2", CARD = "#ffffff";
const ORANGE = "#ff5a36", RED = "#e5484d";
const TONES = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#64748b"];
const SNAP = "cubic-bezier(0.16,1,0.3,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: STAGE, ink2: STAGE2, text: INK, dim: DIM, accent: ORANGE },
  fonts: { display: "Inter", body: "Inter" }
});

const ANCHOR = { x: 0, y: 40 };

/** A desktop window drawn from shapes: a title bar, a title, and grey content. */
function windowEl(s, k, o) {
  const { x, y, w, h, title, tone, rot, at, badge } = o;
  const g = s.group({ name: `window-${k}`, x, y, rotation: rot, at, dur: 4.7 - at });
  s.rect(w, h, CARD, { name: `window-${k}-plate`, parent: g.id, r: 18, stroke: RULE, sw: 2, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 14, blur: 34, color: "rgba(26,26,31,0.18)" }] });
  s.rect(w, 64, tone, { name: `window-${k}-bar`, parent: g.id, y: -h / 2 + 32, r: 18 });
  s.rect(w, 20, tone, { name: `window-${k}-bar-base`, parent: g.id, y: -h / 2 + 54 });
  [0, 1, 2].forEach((d) => s.ellipse(16, "rgba(255,255,255,0.75)", { name: `window-${k}-dot-${d}`, parent: g.id, x: -w / 2 + 30 + d * 26, y: -h / 2 + 32 }));
  s.text(title, { name: `window-${k}-title`, parent: g.id, anchor: "left", x: -w / 2 + 108, y: -h / 2 + 33, mw: (w - 130) / W, size: 34, weight: 700, color: "#ffffff" });
  const lines = Math.max(2, Math.floor((h - 110) / 46));
  for (let l = 0; l < lines; l++) {
    const lw = (w - 60) * (0.45 + 0.5 * hash(k * 17 + l));
    s.rect(lw, 18, "#e7e5e0", { name: `window-${k}-line-${l}`, parent: g.id, x: -w / 2 + 30 + lw / 2, y: -h / 2 + 104 + l * 46, r: 9 });
  }
  if (badge) {
    const b = s.ellipse(54, RED, { name: `window-${k}-badge`, parent: g.id, x: w / 2 - 6, y: -h / 2 + 4 });
    s.text(String(badge), { name: `window-${k}-badge-count`, parent: g.id, x: w / 2 - 6, y: -h / 2 + 4, mw: 0.05, size: 30, weight: 800, color: "#ffffff" });
    // A restrained 1–2 px shake on the accent only.
    const jitter = s.noise(40 + k);
    b.expr((t) => ({ offsetX: (jitter(t * 9) - 0.5) * 4, offsetY: (jitter(t * 9 + 50) - 0.5) * 4 }), { at: 0, dur: 4.2 - at, role: "emphasis" });
  }
  return g;
}

const TITLES = ["Inbox (14)", "Notes.txt", "Budget.xlsx", "Brief_v3.pdf", "Team chat", "Call notes", "Halden site", "Brief_v4.pdf", "Moodboard", "Invoices", "Contract.pdf", "Search"];

const chaos = v.scene("Chaos", 12, (s) => {
  s.backdrop({ colors: [STAGE, STAGE2], opacity: 0.55, seed: 31 });
  s.ellipse(5, "#cfccc4", { name: "grid-dots", x: -490, y: -896, repeater: { count: 120, columns: 8, positionStep: { x: 140, y: 0 }, rowStep: { x: 0, y: 128 }, timeStepMs: 0 } });

  // B1 hook and B2 pressure: windows arrive every 100 ms, the later ones
  // stepping 16 px down and across as they pile up around the centre.
  const PLACES = [
    [-180, -270, 560, 340], [200, -320, 520, 320], [-240, 60, 540, 380], [220, -40, 560, 360], [-40, -150, 600, 400], [140, 230, 520, 330],
    [-300, -330, 480, 300], [300, 160, 500, 320], [-150, 280, 540, 300], [60, -330, 520, 300], [-270, -110, 500, 340], [250, -230, 500, 320]
  ];
  const wins = TITLES.map((title, k) => {
    const late = k >= 6;
    const at = late ? 1.8 + (k - 6) * 0.1 : k * 0.1;
    const step = late ? (k - 6) * 16 : 0;
    const [px, py, w, h] = PLACES[k];
    const x = px + step, y = py + step;
    const g = windowEl(s, k, { x, y, w, h, title, tone: TONES[k % TONES.length], rot: (hash(k + 1) - 0.5) * 9, at, badge: k % 4 === 0 ? 3 + k : 0 });
    g.enter({ from: { scale: 0.88, offsetY: 40 }, at: 0, dur: 0.24, ease: SNAP });
    return { g, x, y, at };
  });

  // A pointer darting between windows: the pain made visible.
  const pointer = s.path([["M", 0, 0], ["L", 0, 56], ["L", 15, 43], ["L", 26, 66], ["L", 36, 61], ["L", 25, 39], ["L", 44, 38], ["Z"]], {
    name: "pointer", fill: "#ffffff", stroke: INK, sw: 4, dur: 4.3, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 6, blur: 12, color: "rgba(0,0,0,0.3)" }]
  });
  const stops = [[-300, -200], [260, -60], [-120, 220], [300, 260], [-260, 40], [120, -260], [0, 120]];
  pointer.expr((t) => {
    const seg = Math.min(stops.length - 2, Math.floor(t / 0.6));
    const p = Math.min(1, (t - seg * 0.6) / 0.45);
    const e = 1 - Math.pow(1 - p, 3);
    const [ax, ay] = stops[seg], [bx, by] = stops[seg + 1];
    return { offsetX: ax + (bx - ax) * e, offsetY: ay + (by - ay) * e };
  }, { at: 0, dur: 4.2, role: "emphasis" });

  // B3 turn: every window collapses into the one anchor in 500 ms.
  wins.forEach(({ g, x, y, at }, k) => {
    g.exit({ to: { offsetX: ANCHOR.x - x, offsetY: ANCHOR.y - y, scale: 0.15, opacity: 0 }, at: 4.2 - at + k * 0.012, dur: 0.5 - k * 0.012, ease: "outExpo" });
  });
  // The handoff is hidden by one ring and the result's wipe.
  const ring = s.ellipse(240, null, { name: "handoff-ring", x: ANCHOR.x, y: ANCHOR.y, stroke: ORANGE, sw: 10, at: 4.45, dur: 0.6 });
  ring.animate({ scale: [0.4, 4.2, "outExpo"], opacity: [1, 0, "out"] }, { at: 0, dur: 0.6, role: "emphasis" });

  // B4 result: one clean brief, wiped in from the top, filling in line by line.
  const card = s.group({ name: "result", x: ANCHOR.x, y: ANCHOR.y, at: 4.5 });
  card.animate({ wipeProgress: [0, 1] }, { at: 0, dur: 0.35, ease: SNAP, mask: { direction: "down", softness: 0.04 } });
  card.animate({ scale: [1, 1.02, "inOut"] }, { at: 0.4, dur: 7.1, role: "emphasis" });
  const CW = 880, CH = 820;
  s.rect(CW, CH, CARD, { name: "result-plate", parent: card.id, r: 36, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 30, blur: 70, color: "rgba(26,26,31,0.2)" }] });
  s.rect(CW, 10, ORANGE, { name: "result-edge", parent: card.id, y: -CH / 2 + 5, r: 5 });
  s.text("CLIENT BRIEF", { name: "result-kicker", parent: card.id, anchor: "left", x: -CW / 2 + 56, y: -CH / 2 + 80, mw: 0.5, size: 34, weight: 700, color: ORANGE, tracking: 0.16 });
  s.text("Halden spring launch", { name: "result-title", parent: card.id, anchor: "left", x: -CW / 2 + 56, y: -CH / 2 + 150, mw: 0.62, size: 54, weight: 800, color: INK, tracking: -0.025 });
  const rows = [["Goal", "Launch site live by 14 May"], ["Budget", "$42,000, approved"], ["Owner", "Mira Sato"], ["Open", "Final copy from client"]];
  rows.forEach(([k, val], i) => {
    const y = -CH / 2 + 270 + i * 96;
    s.rect(CW - 112, 2, RULE, { name: `result-rule-${i}`, parent: card.id, y: y - 48 });
    const label = s.text(k, { name: `result-key-${i}`, parent: card.id, anchor: "left", x: -CW / 2 + 56, y, mw: 0.2, size: 38, weight: 600, color: DIM });
    const value = s.text(val, { name: `result-value-${i}`, parent: card.id, anchor: "left", x: -CW / 2 + 230, y, mw: 0.56, size: 40, weight: 600, color: INK });
    for (const el of [label, value]) el.enter({ from: { opacity: 0, offsetX: -16 }, at: 0.5 + i * 0.12, dur: 0.3, ease: SNAP });
  });
  const sources = s.pill("6 sources linked", { name: "result-sources", parent: card.id, x: -CW / 2 + 56, y: CH / 2 - 80, anchor: { x: 0, y: 0.5 }, size: 36, weight: 700, color: "#9a3412", fillColor: "#ffedd5", stroke: "rgba(0,0,0,0)", font: "body", dot: ORANGE, at: 1.2 });
  sources.enter({ from: { scale: 0.8, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  const tick = s.ellipse(84, ORANGE, { name: "result-check", parent: card.id, x: CW / 2 - 90, y: -CH / 2 + 110, at: 1.6 });
  s.path([["M", CW / 2 - 110, -CH / 2 + 110], ["L", CW / 2 - 96, -CH / 2 + 124], ["L", CW / 2 - 70, -CH / 2 + 96]], { name: "result-check-mark", parent: card.id, stroke: "#ffffff", sw: 8, at: 1.6 }).draw({ at: 0.1, dur: 0.25 });
  tick.enter({ from: { scale: 0 }, at: 0, dur: 0.25, ease: "cubic-bezier(0.3,1.4,0.6,1)" });

  // The copy slot above the work area, one line per beat.
  const lines = [["Fourteen tabs for one client brief", 0, 1.8], ["Notes, mail, docs. Still missing pieces.", 1.8, 2.4], ["Tidy turns it into one page", 4.2, 2.3], ["One brief, every source linked", 6.5, 3.0], ["Every brief in one place", 9.5, 2.5]];
  lines.forEach(([str, at, dur], i) => {
    const t = s.text(str, { name: `headline-${i}`, y: -620, mw: 0.84, size: 80, weight: 800, color: i >= 2 ? INK : INK, tracking: -0.035, at, dur, style: { lineHeight: 1.06 } });
    t.enter({ from: { offsetY: 30, opacity: 0.3 }, at: 0, dur: 0.25, ease: SNAP, by: "word", staggerMs: 40 });
  });

  // B5 CTA.
  s.seq(9.5, 2.5, (q) => {
    const button = q.pill("Try Tidy free", { name: "cta", y: 560, size: 54, weight: 800, color: "#ffffff", fillColor: ORANGE, stroke: "rgba(0,0,0,0)", font: "body", padX: 74, padY: 30 });
    button.enter({ from: { offsetY: 24, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  });

  s.finish({ vignette: 0.1, softness: 0.8, grain: 0.03, seed: 6 });
});

v.series([chaos]);

const saved = await v.save(nodetool.timelines, {
  name: "Desktop chaos to one result — Tidy",
  showcase: true
});
await output("timeline", {
  name: "Desktop chaos to one result — Tidy",
  description: "A 12-second vertical ad: a dozen piled-up windows collapse into one point and a clean client brief takes the frame, then a CTA.",
  videoUri: "/ad-library/videos/desktop-chaos-to-one-clean-result.mp4",
  posterUri: "/ad-library/videos/desktop-chaos-to-one-clean-result.webp",
  ...saved
});
