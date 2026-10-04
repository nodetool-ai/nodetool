// Ad library R14, Macro feature proof: a 10-second vertical ad for the
// fictional Voltra motorcycle. A macro of its light bar fills the frame, the
// light reacts as the street goes dark, then a match cut puts the bar in
// place on the whole bike.
//
// `node scripts/example-timelines/ad-library.mjs build macro-feature-proof`
// writes marketing/recipe-assets/ad-library/macro-feature-proof.timeline.json.
//
// The pictures are the Voltra example's stills, shipped under
// package://nodetool-base/timelines/voltra. The feature and its claim are
// fictional, and the qualification says so in the ad's own terms. The
// demonstration grades one approved still (the street darkens, the bar
// brightens) rather than inventing a second state. Every time value is
// seconds from the start of the ad, the beat times in
// marketing/src/data/adLibrary.json. Positions are px from the frame centre
// on a 1080×1920 frame.
//
// Motion language: one slow settle per shot, a hard match cut with the light
// bar at the same height on both sides, type that fades, a still end card.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const INK = "#05070a", TEXT = "#f4f7f8", DIM = "#9fb3b8", TEAL = "#2ee6d6";
const DISPLAY = "display", BODY = "body";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: INK, text: TEXT, dim: DIM, accent: TEAL },
  fonts: { display: "Bebas Neue", body: "Inter" }
});

const uri = (name) => `package://nodetool-base/timelines/voltra/${name}.jpg`;

// The light bar sits 42% down the macro and 26% down the hero still. Both
// shots place it at BAR_Y on screen, so the cut keeps it where the eye is.
// The macro is placed at 2.3× the contain fit rather than a full cover, so it
// is upscaled less; the scrims take the black above and below it.
const MACRO_BAR = 0.42, MACRO_S = 2.3, HERO_BAR = 0.26, HERO_S = 1.35;
const FIT_H = (W * 9) / 16;
const BAR_Y = (MACRO_BAR - 0.5) * FIT_H * MACRO_S;
const HERO_Y = BAR_Y - (HERO_BAR - 0.5) * FIT_H * HERO_S;

/** A headline in the slot at the top, over the scrim. */
function headline(s, lines, at, dur, o = {}) {
  const els = lines.map((line, k) => s.text(line, { name: `${o.name ?? "headline"}-${k}`, font: DISPLAY, size: o.size ?? 140, weight: 400, color: k === (o.accent ?? -1) ? TEAL : TEXT, tracking: 0.01, at, dur, style: { lineHeight: 0.92 } }));
  const box = s.stack(els, { name: o.name ?? "headline", at: { x: -470, y: -700 }, anchor: "top-left", align: "start", gap: 0, start: at, dur });
  box.enter({ from: { offsetY: 30, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  return box;
}

const proof = v.scene("Proof", 10, (s) => {
  s.fill(INK, { name: "black" });

  // B1 and B2: the macro, settling 1.04 → 1.00 across the hook, then held.
  const macro = s.image(uri("headlight"), { name: "macro", s: MACRO_S, dur: 4.5 });
  macro.animate({ scale: [[0, 1.04], [0.4, 1, "out"], [1, 1.03, "inOut"]] }, { at: 0, dur: 4.5, role: "emphasis" });
  // B2 demonstration: the street around the bar goes dark…
  macro.animate({ brightness: [[0, 0], [0.35, -0.45, "inOut"], [1, -0.45]] }, { at: 1.8, dur: 2.7, role: "emphasis" });
  // …and the bar answers: a screened copy, masked to the bar, glows up.
  const bar = s.image(uri("headlight"), {
    name: "macro-bar", s: MACRO_S, at: 1.8, dur: 2.7, blendMode: "screen",
    mask: { kind: "ellipse", x: 0.08, y: 0.3, width: 0.84, height: 0.26, featherPx: 60 },
    effects: [{ type: "glow", radius: 60, intensity: 1.4, color: "#bff7ff" }]
  });
  bar.animate({ opacity: [[0, 0], [0.3, 0.2, "inOut"], [0.55, 1, "inOut"], [1, 1]] }, { at: 0, dur: 2.7, role: "emphasis" });
  // The same settle as the macro from 1.8 s, so the copy stays registered on it.
  bar.animate({ scale: [[0, 1], [1, 1.03, "inOut"]] }, { at: 0, dur: 2.7, role: "emphasis" });

  // B3 context: a hard match cut to the whole bike, its bar at the same height.
  const hero = s.image(uri("hero"), { name: "hero", s: HERO_S, y: HERO_Y, at: 4.5 });
  hero.animate({ scale: [1.06, 1, "out"] }, { at: 0, dur: 1.2, role: "in" });
  s.glow({ name: "bar-flare", size: 700, alpha: 0.5, color: "#bff7ff", x: (0.7 - 0.5) * W * HERO_S, y: BAR_Y, at: 4.5, dur: 0.6 })
    .animate({ opacity: [1, 0, "out"] }, { at: 0, dur: 0.6, role: "emphasis" });

  // Scrims hold the type off the pictures.
  s.rect(W, 760, { type: "linear", angle: 90, stops: [{ offset: 0, color: "rgba(5,7,10,0.88)" }, { offset: 0.55, color: "rgba(5,7,10,0.45)" }, { offset: 1, color: "rgba(5,7,10,0)" }] }, { name: "scrim-top", y: -580 });
  s.rect(W, 760, { type: "linear", angle: 90, stops: [{ offset: 0, color: "rgba(5,7,10,0)" }, { offset: 0.5, color: "rgba(5,7,10,0.7)" }, { offset: 1, color: "rgba(5,7,10,0.92)" }] }, { name: "scrim-bottom", y: 580 });

  headline(s, ["ADAPTIVE", "LIGHT BAR"], 0, 1.8, { name: "feature", accent: 1 });
  headline(s, ["BRIGHTENS AS THE", "STREET GOES DARK"], 1.8, 2.7, { name: "action", accent: 1, size: 120 });
  headline(s, ["SEE FURTHER ON", "EVERY NIGHT RIDE"], 4.5, 5.5, { name: "benefit", accent: 1, size: 120 });

  // B4 proof: the qualified line fades in; nothing moves.
  const q1 = s.text("The beam adapts to the light around you.", { name: "qualified", y: 400, mw: 0.86, font: BODY, size: 46, weight: 600, color: TEXT, at: 7.0 });
  const q2 = s.text("Final specifications may vary by market.", { name: "disclaimer", y: 462, mw: 0.86, font: BODY, size: 40, weight: 500, color: DIM, at: 7.0 });
  for (const t of [q1, q2]) t.enter({ from: { opacity: 0 }, at: 0, dur: 0.25, ease: "linear" });

  // B5 CTA: product, brand and the next step, held.
  s.seq(8.5, 1.5, (q) => {
    const button = q.pill("Book a test ride", { name: "cta", y: 580, size: 52, weight: 800, color: INK, fillColor: TEAL, stroke: "rgba(0,0,0,0)", font: BODY, padX: 70, padY: 28 });
    button.enter({ from: { opacity: 0, offsetY: 20 }, at: 0, dur: 0.2, ease: SNAP });
  });
  const mark = s.text("VOLTRA R1", { name: "brand-mark", anchor: "right", x: 470, y: -735, mw: 0.4, font: DISPLAY, size: 56, weight: 400, color: DIM, tracking: 0.25 });
  mark.enter({ from: { opacity: 0 }, at: 0, dur: 0.25, ease: "linear" });

  s.finish({ vignette: 0.18, softness: 0.75, grain: 0.05, seed: 18 });
});

v.series([proof]);

const saved = await v.save(nodetool.timelines, {
  name: "Macro feature proof — Voltra",
  showcase: true
});
await output("timeline", {
  name: "Macro feature proof — Voltra",
  description: "A 10-second vertical ad: a macro of the light bar answers a darkening street, then a match cut places it on the whole bike, with a qualified claim and a CTA.",
  videoUri: "/ad-library/videos/macro-feature-proof.mp4",
  posterUri: "/ad-library/videos/macro-feature-proof.webp",
  ...saved
});
