// Ad library R13, Calm breathing-shape loop: a 12-second vertical ad for a
// fictional guided-pause app. One soft form expands and returns once; the
// rest of the frame stays quiet.
//
// `node scripts/example-timelines/ad-library.mjs build calm-breathing-shape-loop`
// writes marketing/recipe-assets/ad-library/calm-breathing-shape-loop.timeline.json.
//
// The app is fictional and the copy makes no health promise. Every time
// value is seconds from the start of the ad, the beat times in
// marketing/src/data/adLibrary.json. Positions are px from the frame centre
// on a 1080×1920 frame.
//
// Motion language: one easing for the whole breath (BREATH), 3 s each way
// with no reset, 350 ms opacity entrances and 180 ms fades for type,
// nothing else that asks for attention.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const MIST = "#e9f0ea", MIST2 = "#d7e5dc", INK = "#21332b", DIM = "#5f7a6d", SAGE = "#7fb59c", DEEP = "#4f8c74";
const SERIF = "serif", SANS = "sans";
const BREATH = "cubic-bezier(0.45,0,0.55,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: MIST, ink2: MIST2, text: INK, dim: DIM, accent: SAGE },
  fonts: { serif: "Lora", sans: "Inter" }
});

const FX = 0, FY = -30, FD = 560;
// One breath: rest until 2 s, in until 5 s, out until 8 s, then rest. As
// fractions of the 12 s clip.
const BREATH_TRACK = (rest, full) => [[0, rest], [2 / 12, rest], [5 / 12, full, BREATH], [8 / 12, rest, BREATH], [1, rest]];

/**
 * A prompt in the slot above the form: a soft 350 ms opacity entrance. A
 * prompt that hands over to another fades out over its last 250 ms first, so
 * two lines never sit on top of each other.
 */
function prompt(s, str, at, dur, o = {}) {
  const t = s.text(str, { name: o.name ?? "prompt", y: -560, mw: 0.84, font: SERIF, size: o.size ?? 84, weight: 500, color: INK, tracking: -0.015, at, dur, style: { lineHeight: 1.12 } });
  t.enter({ from: { opacity: 0 }, at: 0, dur: o.fade ?? 0.35, ease: "linear" });
  if (!o.last) t.exit({ to: { opacity: 0 }, at: dur - 0.25, dur: 0.25, ease: "linear" });
  return t;
}

const breathe = v.scene("Breathe", 12, (s) => {
  s.backdrop({ colors: [MIST, MIST2], opacity: 0.6, seed: 23 });

  // The ground shadow: wider and lighter while the form is full.
  const shadow = s.rect(440, 70, "rgba(33,51,43,0.22)", { name: "ground-shadow", kind: "ellipse", x: FX, y: FY + FD / 2 + 70, effects: [{ type: "blur", radius: 26 }] });
  shadow.animate({ scaleX: BREATH_TRACK(1, 1.1), opacity: BREATH_TRACK(1, 0.7) }, { at: 0, dur: 12, role: "emphasis" });

  // A faint ring that follows the breath a little further out.
  const ring = s.ellipse(FD + 120, null, { name: "breath-ring", x: FX, y: FY, stroke: "rgba(79,140,116,0.28)", sw: 3 });
  ring.animate({ scale: BREATH_TRACK(1, 1.14), opacity: BREATH_TRACK(0.6, 1) }, { at: 0, dur: 12, role: "emphasis" });

  // The form: present on frame 0, one complete cycle around a fixed centre.
  const form = s.group({ name: "form", x: FX, y: FY });
  s.ellipse(FD, { type: "radial", stops: [{ offset: 0, color: "#b6dac7" }, { offset: 0.6, color: SAGE }, { offset: 1, color: DEEP }] }, { name: "form-body", parent: form.id });
  s.ellipse(FD * 0.34, "rgba(255,255,255,0.35)", { name: "form-light", parent: form.id, x: -FD * 0.17, y: -FD * 0.2, effects: [{ type: "blur", radius: 40 }] });
  form.animate({ scale: BREATH_TRACK(1, 1.08) }, { at: 0, dur: 12, role: "emphasis" });
  form.enter({ from: { opacity: 0 }, at: 0, dur: 0.35, ease: "linear" });
  // After the cycle, a 1.5% drift is all that moves.
  form.animate({ offsetY: [[0, 0], [8 / 12, 0], [10 / 12, -8, "inOut"], [1, 0, "inOut"]] }, { at: 0, dur: 12, role: "emphasis" });

  prompt(s, "Take one slow breath with us.", 0, 2, { name: "invitation" });
  prompt(s, "Breathe in slowly…", 2, 3, { name: "expand" });
  prompt(s, "…and let it go.", 5, 3, { name: "contract" });
  prompt(s, "Two-minute guided pauses, whenever you need one.", 8, 4, { name: "benefit", size: 70, fade: 0.18, last: true });

  // B5: the brand and one next step, holding still.
  s.seq(10, 2, (q) => {
    const word = q.text("still", { name: "wordmark", y: 410, font: SERIF, size: 92, weight: 600, italic: true, color: DEEP, tracking: -0.02 });
    word.enter({ from: { opacity: 0 }, at: 0, dur: 0.35, ease: "linear" });
    const button = q.pill("Try Still free", { name: "cta", y: 540, size: 52, weight: 600, color: MIST, fillColor: INK, stroke: "rgba(0,0,0,0)", font: SANS, padX: 72, padY: 28 });
    button.enter({ from: { opacity: 0 }, at: 0.1, dur: 0.35, ease: "linear" });
  });

  s.finish({ vignette: 0.1, softness: 0.85, grain: 0.03, seed: 17 });
});

v.series([breathe]);

const saved = await v.save(nodetool.timelines, {
  name: "Calm breathing loop — Still",
  showcase: true
});
await output("timeline", {
  name: "Calm breathing loop — Still",
  description: "A 12-second vertical ad: one soft form breathes in and out once under quiet prompts, then rests for the benefit, the wordmark and a CTA.",
  videoUri: "/ad-library/videos/calm-breathing-shape-loop.mp4",
  posterUri: "/ad-library/videos/calm-breathing-shape-loop.webp",
  ...saved
});
