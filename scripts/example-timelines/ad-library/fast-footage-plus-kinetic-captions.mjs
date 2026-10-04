// Ad library R05, Fast footage plus kinetic captions: a 15-second vertical
// ad cut from the Voltra example's stills, for the same fictional electric
// motorcycle. One shot, one message: each caption changes with its shot.
//
// `node scripts/example-timelines/ad-library.mjs build fast-footage-plus-kinetic-captions`
// writes marketing/recipe-assets/ad-library/fast-footage-plus-kinetic-captions.timeline.json.
//
// The stills ship with NodeTool under package://nodetool-base/timelines/voltra
// (scripts/example-timelines/voltra-stills.mjs made them). They are 16:9, so
// each shot is a full-bleed crop chosen around its subject, with the
// recipe's minimal Ken Burns move because they are stills. The brand and its
// claims are fictional. Every time value is seconds from the start of the
// ad, the beat times in marketing/src/data/adLibrary.json. Positions are px
// from the frame centre on a 1080×1920 frame.
//
// Motion language: hard cuts, one 200 ms push at 5 s, captions that rise 5%
// of the frame height in 200 ms by word, one entrance curve (SNAP).
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const INK = "#05070a", TEXT = "#f4f7f8", TEAL = "#2ee6d6", DIM = "#9fb3b8";
const DISPLAY = "display", BODY = "body";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const EASE_IO = "cubic-bezier(0.65,0,0.35,1)";
// A 16:9 still contain-fits a 9:16 frame at its full width; this scale covers the height.
const COVER = H / ((W * 9) / 16);
const SRC_W = W * COVER;

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: INK, text: TEXT, dim: DIM, accent: TEAL },
  fonts: { display: "Bebas Neue", body: "Inter" }
});

const uri = (name) => `package://nodetool-base/timelines/voltra/${name}.jpg`;

/**
 * A full-bleed crop of a 16:9 still, centred on `fx` (the subject's place
 * across the source, 0..1), with a 4% Ken Burns settle across the shot.
 */
function shot(s, name, fx, at, dur, o = {}) {
  const img = s.image(uri(name), { name: `shot-${name}`, s: COVER, x: -(fx - 0.5) * SRC_W, at, dur, ...o });
  img.animate({ scale: [1.04, 1, "linear"] }, { at: 0, dur, role: "emphasis" });
  return img;
}

/** A caption of one or two lines that rises 5% of the frame height, word by word. */
function caption(s, lines, at, dur, o = {}) {
  const els = lines.map((line, k) => {
    const t = s.text(line, { name: `${o.name ?? "caption"}-${k}`, font: DISPLAY, size: o.size ?? 150, weight: 400, color: k === (o.accent ?? -1) ? TEAL : TEXT, tracking: 0.01, at, dur, style: { lineHeight: 0.9 } });
    t.enter({ from: { offsetY: 0.05 * H, opacity: 0 }, at: k * 0.08, dur: 0.2, ease: SNAP, by: "word", staggerMs: 50 });
    return t;
  });
  return s.stack(els, { name: o.name ?? "caption", at: { x: -470, y: -620 }, anchor: "top-left", align: "start", gap: 0, start: at, dur });
}

const cut = v.scene("Cut", 15, (s) => {
  s.fill(INK, { name: "black" });

  // B1 hook: the strongest result shot, cut in on frame 0.
  shot(s, "hero", 0.58, 0, 1.5);
  // B2 benefit 1: two related shots, cut on the action change.
  shot(s, "ride", 0.55, 1.5, 1.8);
  const tyre = shot(s, "tyre", 0.6, 3.3, 1.9);
  // B3 benefit 2: one 200 ms push up into the next scene; caption and picture move together.
  tyre.exit({ to: { offsetY: -H }, at: 1.7, dur: 0.2, ease: EASE_IO });
  const tunnel = shot(s, "tunnel", 0.5, 5.0, 1.8);
  tunnel.enter({ from: { offsetY: H }, at: 0, dur: 0.2, ease: EASE_IO });
  shot(s, "motor", 0.74, 6.8, 1.7);
  // B4 benefit 3: the clearest proof, then the rider.
  shot(s, "dash", 0.42, 8.5, 1.8);
  shot(s, "rider", 0.56, 10.3, 1.7);

  // B5 CTA: the rooftop shot lands full-bleed, then shrinks into a sharp band
  // over a blurred, darkened copy of itself.
  s.seq(12, 3, (q) => {
    q.image(uri("rooftop"), { name: "end-fill", s: COVER * 1.1, x: 0.05 * SRC_W, effects: [{ type: "blur", radius: 48 }, { type: "color", brightness: -0.35, saturation: 1.15 }] });
    const band = q.image(uri("rooftop"), { name: "end-band", y: -60, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 30, blur: 60, color: "rgba(0,0,0,0.6)" }] });
    band.animate({ scale: [COVER, 1, EASE_IO], offsetX: [0.05 * SRC_W, 0, EASE_IO], offsetY: [60, 0, EASE_IO] }, { at: 0.25, dur: 0.5, role: "in" });
  });

  // A contrast gradient under the captions and the brand mark.
  s.rect(W, 900, { type: "linear", angle: 90, stops: [{ offset: 0, color: "rgba(5,7,10,0.85)" }, { offset: 0.6, color: "rgba(5,7,10,0.35)" }, { offset: 1, color: "rgba(5,7,10,0)" }] }, { name: "caption-scrim", y: -510 });

  caption(s, ["THE QUIETEST", "RIDE IN THE CITY"], 0, 1.5, { name: "hook", accent: 1 });
  const first = caption(s, ["INSTANT TORQUE", "FROM A STANDSTILL"], 1.5, 3.7, { name: "benefit-1", accent: 0 });
  first.exit({ to: { offsetY: -H * 0.4, opacity: 0 }, at: 3.5, dur: 0.2, ease: EASE_IO });
  const second = caption(s, ["CHARGE TO 80%", "OVER LUNCH"], 5.0, 3.5, { name: "benefit-2", accent: 0 });
  second.enter({ from: { offsetY: H * 0.4 }, at: 0, dur: 0.2, ease: EASE_IO });
  caption(s, ["A WEEK OF COMMUTES", "ON ONE CHARGE"], 8.5, 3.5, { name: "benefit-3", accent: 1, size: 128 });
  caption(s, ["MEET THE", "VOLTRA R1"], 12.0, 3.0, { name: "end-title", accent: 1 });

  // The CTA resolves once the band has landed, then holds for over 2 s.
  s.seq(12.8, 2.2, (q) => {
    const button = q.pill("Book a free test ride", { name: "cta", y: 440, size: 54, weight: 800, color: INK, fillColor: TEAL, stroke: "rgba(0,0,0,0)", font: BODY, padX: 72, padY: 30 });
    button.enter({ from: { offsetY: 30, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
    const note = q.text("Electric. 0 emissions at the tailpipe.", { name: "cta-note", y: 560, font: BODY, size: 40, weight: 500, color: DIM });
    note.enter({ from: { opacity: 0 }, at: 0.1, dur: 0.25, ease: "linear" });
  });

  // The persistent brand mark: it never moves, whatever the shots do.
  const mark = s.text("VOLTRA", { name: "brand-mark", anchor: "left", x: -470, y: -735, mw: 0.4, font: DISPLAY, size: 72, weight: 400, color: TEXT, tracking: 0.3 });
  const bar = s.rect(56, 8, TEAL, { name: "brand-bar", x: -442, y: -685, r: 4 });
  mark.enter({ from: { opacity: 0 }, at: 0, dur: 0.2, ease: "linear" });
  bar.enter({ from: { scaleX: 0 }, at: 0.1, dur: 0.3, ease: SNAP });

  s.finish({ vignette: 0.18, softness: 0.75, grain: 0.05, seed: 5 });
});

v.series([cut]);

const saved = await v.save(nodetool.timelines, {
  name: "Footage and kinetic captions — Voltra",
  showcase: true
});
await output("timeline", {
  name: "Footage and kinetic captions — Voltra",
  description: "A 15-second vertical cut of motorcycle stills: one caption per shot, hard cuts and one push, ending on the hero shot shrinking into a CTA end card.",
  videoUri: "/ad-library/videos/fast-footage-plus-kinetic-captions.mp4",
  posterUri: "/ad-library/videos/fast-footage-plus-kinetic-captions.webp",
  ...saved
});
