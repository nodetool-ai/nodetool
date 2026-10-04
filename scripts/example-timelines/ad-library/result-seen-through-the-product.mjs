// Ad library R15, Result seen through the product: a 12-second vertical ad
// for a fictional photo-cropping app. The photo fills the frame first; then
// the app's crop window lands on it, aligned, and recrops it for each feed.
//
// `node scripts/example-timelines/ad-library.mjs build result-seen-through-the-product`
// writes marketing/recipe-assets/ad-library/result-seen-through-the-product.timeline.json.
//
// The photo is the Voltra example's rooftop still, shipped under
// package://nodetool-base/timelines/voltra. The app is fictional. Every crop
// shown is the same picture, so the demonstration is truthful: the window is
// an alpha matte over a full-brightness copy that sits exactly on a dimmed
// copy, and only the matte moves. Every time value is seconds from the start
// of the ad, the beat times in marketing/src/data/adLibrary.json. Positions
// are px from the frame centre on a 1080×1920 frame.
//
// Motion language: one in-place curve (EASE_IO) for every crop change, 300 ms
// for the window's arrival, a single 8% pull-back, type that cuts or fades.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const INK = "#0b0c10", TEXT = "#f7f7f5", DIM = "#b9bcc6", AMBER = "#ffb547";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const EASE_IO = "cubic-bezier(0.65,0,0.35,1)";
const PHOTO_S = 2.85;

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: INK, text: TEXT, dim: DIM, accent: AMBER },
  fonts: { display: "Inter", body: "Inter" }
});

const uri = (name) => `package://nodetool-base/timelines/voltra/${name}.jpg`;

// The crop window, centred on the bike: one rectangle per feed format.
const CX = 0, CY = -10, MAXH = 640;
const crop = (w, h) => ({ l: CX - w / 2, r: CX + w / 2, t: CY - h / 2, b: CY + h / 2 });
const FORMATS = [
  { label: "4:5", box: crop(512, MAXH) },
  { label: "9:16", box: crop(360, MAXH) },
  { label: "1:1", box: crop(MAXH, MAXH) },
  { label: "16:9", box: crop(864, 486) }
];
// The order the demonstration visits them, and when each change starts (s).
const STEPS = [[0, 2.0], [1, 4.7], [2, 5.6], [3, 6.5]];
const MOVE = 0.4;
// The window track runs from 2.0 s to 12 s.
const T0 = 2.0, SPAN = 10.0;

/** A rectangle as frame-normalized path data. */
function frameD(c) {
  const X = (px) => ((W / 2 + px) / W).toFixed(4), Y = (py) => ((H / 2 + py) / H).toFixed(4);
  return `M${X(c.l)} ${Y(c.t)} L${X(c.r)} ${Y(c.t)} L${X(c.r)} ${Y(c.b)} L${X(c.l)} ${Y(c.b)} Z`;
}

/**
 * Keyframes for one value over a window from `t0` lasting `span` seconds:
 * hold, then move to each format in turn.
 */
function track(valueOf, t0 = T0, span = SPAN) {
  const tt = (sec) => (sec - t0) / span;
  const kfs = [[0, valueOf(FORMATS[STEPS[0][0]])]];
  for (let k = 1; k < STEPS.length; k++) {
    const [fi, at] = STEPS[k];
    kfs.push([tt(at), valueOf(FORMATS[STEPS[k - 1][0]])]);
    kfs.push([tt(at + MOVE), valueOf(FORMATS[fi]), EASE_IO]);
  }
  kfs.push([1, valueOf(FORMATS[STEPS[STEPS.length - 1][0]])]);
  return kfs;
}

const product = v.scene("Product", 12, (s) => {
  s.fill(INK, { name: "black" });

  // B4 pull-back: the whole composition sits 8% close until 7.5 s, then settles to 1.00.
  const comp = s.group({ name: "composition" });
  comp.animate({ scale: [1.08, 1, EASE_IO] }, { at: 7.5, dur: 0.5, role: "in" });

  // 2.85× the contain fit: nearly full height, with more of the bike in view than a full cover crop.
  const photo = { s: PHOTO_S, x: -(0.46 - 0.5) * W * PHOTO_S, y: 40 };
  s.image(uri("rooftop"), { name: "photo", parent: comp.id, ...photo });
  // Outside the window the photo dims from 2.0 s; inside it stays as shot.
  const dim = s.rect(W * 1.2, H * 1.2, "rgba(6,7,10,0.72)", { name: "outside-dim", parent: comp.id, at: T0 });
  dim.enter({ from: { opacity: 0 }, at: 0, dur: 0.3, ease: "linear" });

  const matte = s.rect(W, H, "#ffffff", { name: "window-matte", parent: comp.id, kind: "path", at: T0, shape: { d: frameD(FORMATS[0].box) } });
  matte.tween("shape.d", track((f) => frameD(f.box)), { at: 0, dur: SPAN });
  s.image(uri("rooftop"), { name: "photo-in-window", parent: comp.id, at: T0, ...photo, matte: { sourceClipId: matte.id, mode: "alpha" } });

  // The product frame: an outline and four crop handles that follow the
  // window's corners. A child keeps its own clock, so each starts at T0 too.
  const frame = s.group({ name: "product-frame", parent: comp.id, at: T0 });
  frame.enter({ from: { opacity: 0, scale: 1.04 }, at: 0, dur: 0.3, ease: SNAP });
  const outline = s.rect(W, H, null, { name: "window-outline", parent: frame.id, at: T0, kind: "path", shape: { d: frameD(FORMATS[0].box), stroke: TEXT, strokeWidthPx: 5 } });
  outline.tween("shape.d", track((f) => frameD(f.box)), { at: 0, dur: SPAN });
  const first = FORMATS[0].box;
  [["l", "t"], ["r", "t"], ["l", "b"], ["r", "b"]].forEach(([hx, hy], k) => {
    const handle = s.rect(44, 44, TEXT, { name: `handle-${k}`, parent: frame.id, at: T0, x: first[hx], y: first[hy], r: 8, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 4, blur: 10, color: "rgba(0,0,0,0.4)" }] });
    handle.animate({ offsetX: track((f) => f.box[hx] - first[hx]), offsetY: track((f) => f.box[hy] - first[hy]) }, { at: 0, dur: SPAN, role: "emphasis" });
  });
  // The pointer drags the bottom-right handle through the demonstration.
  const pointer = s.path([["M", 0, 0], ["L", 0, 56], ["L", 15, 43], ["L", 26, 66], ["L", 36, 61], ["L", 25, 39], ["L", 44, 38], ["Z"]], {
    name: "pointer", parent: frame.id, fill: "#ffffff", stroke: INK, sw: 4, x: first.r + 10, y: first.b + 10, at: T0, dur: 5.5,
    effects: [{ type: "dropShadow", offsetX: 0, offsetY: 6, blur: 12, color: "rgba(0,0,0,0.35)" }]
  });
  pointer.enter({ from: { offsetX: 200, offsetY: 160, opacity: 0 }, at: 0.3, dur: 0.5, ease: EASE_IO });
  pointer.animate({ offsetX: track((f) => f.box.r - first.r, T0, 5.5), offsetY: track((f) => f.box.b - first.b, T0, 5.5) }, { at: 0, dur: 5.5, role: "emphasis" });
  pointer.exit({ to: { opacity: 0 }, at: 5.2, dur: 0.3, ease: "linear" });

  // The format chips under the window; the active one fills on the same frame as its move.
  const CHIP_Y = CY + MAXH / 2 + 110;
  FORMATS.forEach((f, i) => {
    const x = (i - 1.5) * 200;
    const base = s.rect(170, 74, "rgba(255,255,255,0.08)", { name: `chip-${i}`, x, y: CHIP_Y, r: 37, stroke: "rgba(255,255,255,0.3)", sw: 2, at: T0 });
    base.enter({ from: { opacity: 0 }, at: 0.1 + i * 0.05, dur: 0.25, ease: "linear" });
    const stepIndex = STEPS.findIndex(([fi]) => fi === i);
    const on = STEPS[stepIndex][1], off = stepIndex + 1 < STEPS.length ? STEPS[stepIndex + 1][1] : 12;
    const label = s.text(f.label, { name: `chip-${i}-label`, x, y: CHIP_Y, mw: 0.15, size: 38, weight: 700, color: TEXT, at: T0 });
    label.enter({ from: { opacity: 0 }, at: 0.1 + i * 0.05, dur: 0.25, ease: "linear" });
    s.rect(170, 74, AMBER, { name: `chip-${i}-active`, x, y: CHIP_Y, r: 37, at: on, dur: off - on });
    s.text(f.label, { name: `chip-${i}-active-label`, x, y: CHIP_Y, mw: 0.15, size: 38, weight: 700, color: INK, at: on, dur: off - on });
  });

  // The copy slot at the top, over a scrim.
  s.rect(W, 700, { type: "linear", angle: 90, stops: [{ offset: 0, color: "rgba(6,7,10,0.85)" }, { offset: 1, color: "rgba(6,7,10,0)" }] }, { name: "scrim", y: -610 });
  [["Shot once, at dusk.", 0, 2.0], ["Framed in Framekit.", 2.0, 2.5], ["Drag once to recrop for every feed.", 4.5, 3.0], ["Every crop stays sharp and centred.", 7.5, 4.5]].forEach(([str, at, dur], i) => {
    const t = s.text(str, { name: `headline-${i}`, y: -600, mw: 0.86, size: 80, weight: 800, color: TEXT, tracking: -0.035, at, dur, style: { lineHeight: 1.06 } });
    if (i === 3) t.enter({ from: { opacity: 0 }, at: 0, dur: 0.25, ease: "linear" });
    else t.enter({ from: { offsetY: 30, opacity: 0.3 }, at: 0, dur: 0.25, ease: SNAP });
  });

  // B5 CTA under the chips.
  s.seq(9.5, 2.5, (q) => {
    const button = q.pill("Try Framekit free", { name: "cta", y: CHIP_Y + 140, size: 54, weight: 800, color: INK, fillColor: AMBER, stroke: "rgba(0,0,0,0)", padX: 74, padY: 30 });
    button.enter({ from: { opacity: 0, offsetY: 20 }, at: 0, dur: 0.25, ease: SNAP });
  });

  s.finish({ vignette: 0.16, softness: 0.75, grain: 0.04, seed: 19 });
});

v.series([product]);

const saved = await v.save(nodetool.timelines, {
  name: "Result through the product — Framekit",
  showcase: true
});
await output("timeline", {
  name: "Result through the product — Framekit",
  description: "A 12-second vertical app ad: a photo fills the frame, the app's crop window lands on it aligned and recrops it for four feed formats, then the view pulls back for a CTA.",
  videoUri: "/ad-library/videos/result-seen-through-the-product.mp4",
  posterUri: "/ad-library/videos/result-seen-through-the-product.webp",
  ...saved
});
