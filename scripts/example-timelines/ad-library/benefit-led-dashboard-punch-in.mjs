// Ad library R04, Benefit-led dashboard punch-in: a 12-second vertical demo ad
// for a fictional invoicing app. The camera starts close on one control,
// shows its result in place, then pulls back to show where it lives.
//
// `node scripts/example-timelines/ad-library.mjs build benefit-led-dashboard-punch-in`
// writes marketing/recipe-assets/ad-library/benefit-led-dashboard-punch-in.timeline.json.
//
// The app, its clients and every amount are fictional; the ticker counts to
// the sum of the rows it marks paid. Every time value is seconds from the
// start of the ad, the beat times in marketing/src/data/adLibrary.json.
// Positions are px from the frame centre on a 1080×1920 frame.
//
// Motion language: one entrance curve (SNAP), one in-place move (EASE_IO),
// 200–350 ms windows, no overshoot. The control stays where it is from the
// first frame to the last; only the framing changes.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const STAGE = "#0f172a", STAGE2 = "#1e293b", TEXT = "#f8fafc", MUTED = "#94a3b8";
const PANEL = "#ffffff", SIDE = "#f1f5f9", INK = "#0f172a", DIM = "#64748b", RULE = "#e2e8f0";
const GREEN = "#10b981", RED = "#e5484d", BLUE = "#2f6bff";
const ROWS = [["Kesh Studio", 1200], ["Brightline", 3480], ["Ono Bakery", 640], ["Halden & Co", 5900], ["Mira Lab", 2150]];
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const EASE_IO = "cubic-bezier(0.65,0,0.35,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: STAGE, ink2: STAGE2, text: TEXT, dim: MUTED, accent: GREEN },
  fonts: { display: "Inter", body: "Inter" }
});

const APP_Y = 60, PW = 940, PH = 760, SIDE_W = 230;
const MAIN_L = -PW / 2 + SIDE_W, MAIN_W = PW - SIDE_W, MAIN_CX = MAIN_L + MAIN_W / 2;
const ROW_Y0 = -40, ROW_H = 88;
const BUTTON = { x: MAIN_L + MAIN_W - 168, y: -292, w: 290, h: 78 };
// The punch-in: 12% closer, centred on the invoice table.
const ZOOM = 1.12, ZOOM_X = -MAIN_CX * ZOOM;
const money = (n) => `$${String(n).replace(/\B(?=(\d{3})+$)/g, ",")}`;

/** One headline in the copy slot above the app. */
function headline(s, str, at, dur, o = {}) {
  const t = s.text(str, { name: o.name ?? "headline", y: -590, mw: 0.86, size: o.size ?? 80, weight: 800, color: o.color ?? TEXT, tracking: -0.03, at, dur, style: { lineHeight: 1.08 } });
  if (o.fade) t.enter({ from: { opacity: 0 }, at: 0, dur: 0.18, ease: "linear" });
  else t.enter({ from: { offsetY: 40, opacity: 0.35 }, at: 0, dur: 0.25, ease: SNAP });
  return t;
}

const demo = v.scene("Demo", 12, (s) => {
  s.backdrop({ colors: [STAGE, STAGE2], opacity: 0.8, seed: 9 });
  s.glow({ name: "stage-light", size: 1700, alpha: 0.22, color: BLUE, y: 80 });

  // The app, framed 12% close on the table until the context beat pulls back.
  const app = s.group({ name: "app", y: APP_Y });
  // An "in" curve holds its first value before its window, so the app sits zoomed until 7.2 s.
  app.animate({ scale: [ZOOM, 1, EASE_IO], offsetX: [ZOOM_X, 0, EASE_IO] }, { at: 7.2, dur: 0.5, role: "in" });
  s.rect(PW, PH, PANEL, { name: "panel", parent: app.id, r: 30, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 30, blur: 70, color: "rgba(0,0,0,0.45)" }] });
  s.rect(SIDE_W, PH - 4, SIDE, { name: "sidebar", parent: app.id, x: -PW / 2 + SIDE_W / 2 + 2, r: 28 });
  s.rect(24, PH - 4, SIDE, { name: "sidebar-edge", parent: app.id, x: -PW / 2 + SIDE_W - 10 });
  s.text("Ledgerly", { name: "app-name", parent: app.id, anchor: "left", x: -PW / 2 + 34, y: -PH / 2 + 60, mw: 0.22, size: 42, weight: 800, color: INK, tracking: -0.03 });
  ["Home", "Invoices", "Clients", "Reports"].forEach((label, k) => {
    const y = -PH / 2 + 160 + k * 80;
    if (k === 1) s.rect(SIDE_W - 30, 64, "#e0e7ff", { name: "nav-active", parent: app.id, x: -PW / 2 + SIDE_W / 2, y, r: 16 });
    s.text(label, { name: `nav-${k}`, parent: app.id, anchor: "left", x: -PW / 2 + 34, y, mw: 0.2, size: 38, weight: k === 1 ? 700 : 500, color: k === 1 ? BLUE : DIM });
  });

  // The table header, the reminder button and the collected total.
  s.text("Invoices", { name: "table-title", parent: app.id, anchor: "left", x: MAIN_L + 34, y: BUTTON.y, mw: 0.3, size: 54, weight: 800, color: INK, tracking: -0.02 });
  s.rect(BUTTON.w, BUTTON.h, BLUE, { name: "reminder-button", parent: app.id, x: BUTTON.x, y: BUTTON.y, r: 18 });
  s.text("Send reminders", { name: "reminder-label", parent: app.id, x: BUTTON.x, y: BUTTON.y, mw: 0.27, size: 36, weight: 700, color: "#ffffff" });
  s.rect(MAIN_W - 60, 108, "#f8fafc", { name: "total-plate", parent: app.id, x: MAIN_CX, y: -166, r: 18, stroke: RULE, sw: 2 });
  s.text("Collected this week", { name: "total-label", parent: app.id, anchor: "left", x: MAIN_L + 54, y: -166, mw: 0.34, size: 36, weight: 600, color: DIM });
  const total = s.text("$0", { name: "total", parent: app.id, anchor: "right", x: MAIN_L + MAIN_W - 54, y: -166, mw: 0.3, size: 54, weight: 800, color: INK, tracking: -0.02 });
  total.count({ from: 0, to: ROWS.reduce((sum, [, n]) => sum + n, 0), at: 4.4, dur: 0.7, prefix: "$", groupSeparator: ",", ease: "outExpo" });
  total.tween("text.color", [[0, INK], [0.2, GREEN], [1, GREEN]], { at: 4.4, dur: 0.7 });

  ROWS.forEach(([client, amount], k) => {
    const y = ROW_Y0 + k * ROW_H;
    s.rect(MAIN_W - 60, 2, RULE, { name: `row-${k}-rule`, parent: app.id, x: MAIN_CX, y: y + ROW_H / 2 });
    s.text(client, { name: `row-${k}-client`, parent: app.id, anchor: "left", x: MAIN_L + 34, y, mw: 0.27, size: 40, weight: 600, color: INK });
    s.text(money(amount), { name: `row-${k}-amount`, parent: app.id, anchor: "right", x: MAIN_L + MAIN_W - 200, y, mw: 0.2, size: 40, weight: 500, color: DIM });
    const chipX = MAIN_L + MAIN_W - 100;
    s.rect(160, 58, "#fde8e8", { name: `row-${k}-overdue`, parent: app.id, x: chipX, y, r: 25 });
    s.text("Overdue", { name: `row-${k}-overdue-label`, parent: app.id, x: chipX, y, mw: 0.15, size: 32, weight: 700, color: RED });
    // B3 result: each chip wipes to Paid, 40 ms apart, the whole column in 350 ms.
    const paid = s.group({ name: `row-${k}-paid`, parent: app.id, x: chipX, y, at: 4.3 + k * 0.04 });
    s.rect(160, 58, "#d1fae5", { name: `row-${k}-paid-chip`, parent: paid.id, r: 29 });
    s.text("Paid", { name: `row-${k}-paid-label`, parent: paid.id, mw: 0.15, size: 32, weight: 700, color: "#047857" });
    paid.animate({ wipeProgress: [0, 1] }, { at: 0, dur: 0.19, ease: SNAP, mask: { direction: "left", softness: 0.05 } });
  });

  // B2 action: the highlight's bounds expand over 200 ms; the pointer clicks.
  s.seq(1.8, 2.5, (q) => {
    const ring = q.rect(BUTTON.w + 36, BUTTON.h + 36, null, { name: "highlight", parent: app.id, x: BUTTON.x, y: BUTTON.y, r: 30, stroke: GREEN, sw: 7, effects: [{ type: "glow", radius: 24, intensity: 0.9 }] });
    ring.enter({ from: { scaleX: 0.75, scaleY: 0.6, opacity: 0 }, at: 0, dur: 0.2, ease: SNAP });
    ring.animate({ opacity: [[0, 1], [0.5, 0.55, "inOut"], [1, 1, "inOut"]] }, { at: 0.4, dur: 0.8, role: "emphasis" });
    const pointer = q.path([["M", 0, 0], ["L", 0, 56], ["L", 15, 43], ["L", 26, 66], ["L", 36, 61], ["L", 25, 39], ["L", 44, 38], ["Z"]], {
      name: "pointer", parent: app.id, fill: "#ffffff", stroke: INK, sw: 4, x: BUTTON.x + 40, y: BUTTON.y + 10,
      effects: [{ type: "dropShadow", offsetX: 0, offsetY: 6, blur: 12, color: "rgba(0,0,0,0.3)" }]
    });
    pointer.enter({ from: { offsetX: 220, offsetY: 360, opacity: 0 }, at: 0.2, dur: 0.6, ease: EASE_IO });
    pointer.animate({ scale: [[0, 1], [0.4, 0.82, "out"], [1, 1, "out"]] }, { at: 1.2, dur: 0.24, role: "emphasis" });
  });
  const press = s.rect(BUTTON.w, BUTTON.h, "#ffffff", { name: "button-press", parent: app.id, x: BUTTON.x, y: BUTTON.y, r: 18, at: 3.0, dur: 0.3 });
  press.animate({ opacity: [0.45, 0, "out"] }, { at: 0, dur: 0.3, role: "emphasis" });

  // The copy slot: one line per beat.
  headline(s, "Get paid without chasing anyone", 0, 1.8, { name: "hook" });
  headline(s, "One click sends every reminder", 1.8, 2.5, { name: "action" });
  headline(s, "5 overdue invoices, paid in 3 days", 4.3, 2.9, { name: "result", color: "#6ee7b7" });
  headline(s, "Reminders live in your invoices tab, on every plan.", 7.2, 4.8, { name: "context", size: 64, fade: true });

  // B5 CTA: one specific next step under the result, then a hold.
  s.seq(9.5, 2.5, (q) => {
    const button = q.pill("Start a free trial", { name: "cta", y: 575, size: 54, weight: 800, color: STAGE, fillColor: TEXT, stroke: "rgba(0,0,0,0)", padX: 74, padY: 30 });
    button.enter({ from: { offsetY: 30, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  });

  s.finish({ vignette: 0.2, softness: 0.75, grain: 0.03, seed: 2 });
});

v.series([demo]);

const saved = await v.save(nodetool.timelines, {
  name: "Dashboard punch-in — Ledgerly",
  showcase: true
});
await output("timeline", {
  name: "Dashboard punch-in — Ledgerly",
  description: "A 12-second vertical demo ad: close on one control, a click, its result wiping in with a counted total, then a pull-back to the whole app and a CTA.",
  videoUri: "/ad-library/videos/benefit-led-dashboard-punch-in.mp4",
  posterUri: "/ad-library/videos/benefit-led-dashboard-punch-in.webp",
  ...saved
});
