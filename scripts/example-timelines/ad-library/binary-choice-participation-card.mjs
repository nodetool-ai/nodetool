// Ad library R07, Binary-choice participation card: a 10-second vertical
// engagement ad for the fictional Voltra motorcycle. It asks one question,
// shows two equal choices, and asks for a comment instead of pretending the
// video is a poll.
//
// `node scripts/example-timelines/ad-library.mjs build binary-choice-participation-card`
// writes marketing/recipe-assets/ad-library/binary-choice-participation-card.timeline.json.
//
// The pictures are the Voltra example's stills, shipped under
// package://nodetool-base/timelines/voltra. Every time value is seconds from
// the start of the ad, the beat times in marketing/src/data/adLibrary.json.
// Positions are px from the frame centre on a 1080×1920 frame.
//
// Motion language: the two cards share one 250 ms slide and one curve
// (SNAP), mirrored. The question pops once; the instruction does not move.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const INK = "#05070a", TEXT = "#f4f7f8", DIM = "#a8b6ba", TEAL = "#2ee6d6", AMBER = "#ffb547";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const POP = "cubic-bezier(0.3,1.4,0.6,1)";
const COVER = H / ((W * 9) / 16);
const SRC_W = W * COVER;

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: INK, text: TEXT, dim: DIM, accent: TEAL },
  fonts: { display: "Inter", body: "Inter" }
});

const uri = (name) => `package://nodetool-base/timelines/voltra/${name}.jpg`;

const CARD = { w: 450, h: 640, y: 50, gap: 34, img: 420 };

/**
 * One choice: a still cropped to the card's picture window, a letter badge
 * and two lines of label. Both cards are built by this one function, so they
 * carry the same visual weight.
 */
function choice(s, o) {
  const { letter, lines, still, fx, tone, side } = o;
  const x = side * (CARD.w + CARD.gap) / 2;
  const g = s.group({ name: `choice-${letter}`, x, y: CARD.y, at: o.at });
  s.rect(CARD.w, CARD.h, "rgba(8,11,15,0.82)", { name: `choice-${letter}-plate`, parent: g.id, r: 34, stroke: "rgba(255,255,255,0.16)", sw: 2, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 24, blur: 50, color: "rgba(0,0,0,0.5)" }] });
  // The picture: the still's 9:16-height crop around fx, scaled to the window.
  const iw = CARD.w - 28, ih = CARD.img;
  const aspect = iw / ih, cw = (aspect * 9) / 16;
  const left = Math.min(Math.max(fx - cw / 2, 0), 1 - cw);
  s.image(uri(still), {
    name: `choice-${letter}-picture`, parent: g.id, y: -CARD.h / 2 + 14 + ih / 2, s: iw / W,
    crop: { left, right: 1 - left - cw, top: 0, bottom: 0 }, mask: { kind: "rect", x: 0, y: 0, width: 1, height: 1, radiusPx: 24 }
  });
  const badge = s.ellipse(92, tone, { name: `choice-${letter}-badge`, parent: g.id, x: -CARD.w / 2 + 70, y: -CARD.h / 2 + 14 + ih + 6 });
  s.text(letter, { name: `choice-${letter}-letter`, parent: g.id, x: -CARD.w / 2 + 70, y: -CARD.h / 2 + 14 + ih + 6, mw: 0.08, size: 56, weight: 800, color: INK });
  const label = lines.map((line, k) => s.text(line, { name: `choice-${letter}-label-${k}`, parent: g.id, anchor: "left", x: -CARD.w / 2 + 30, y: CARD.h / 2 - 104 + k * 58, mw: 0.36, size: 48, weight: 700, color: TEXT, tracking: -0.02 }));
  badge.enter({ from: { scale: 0 }, at: 0.15, dur: 0.25, ease: POP });
  return { g, label };
}

const ask = v.scene("Ask", 10, (s) => {
  // Context: the bike on the rooftop, darkened under a scrim, pushing in slowly.
  const ctx = s.image(uri("rooftop"), { name: "context", s: COVER, x: -(0.42 - 0.5) * SRC_W });
  ctx.animate({ scale: [1, 1.06, "linear"] }, { at: 0, dur: 10, role: "emphasis" });
  s.rect(W, H, { type: "linear", angle: 90, stops: [{ offset: 0, color: "rgba(5,7,10,0.92)" }, { offset: 0.45, color: "rgba(5,7,10,0.38)" }, { offset: 1, color: "rgba(5,7,10,0.85)" }] }, { name: "scrim" });

  // B1 question: one pop over 220 ms, then it holds for the whole ad.
  const q1 = s.text("Where does your", { name: "question-1", size: 92, weight: 800, color: TEXT, tracking: -0.035, style: { lineHeight: 1.04 } });
  const q2 = s.text("first ride go?", { name: "question-2", size: 92, weight: 800, color: TEAL, tracking: -0.035, style: { lineHeight: 1.04 } });
  const question = s.stack([q1, q2], { name: "question", at: { x: 0, y: -520 }, align: "center", gap: 0 });
  question.enter({ from: { scale: 0.86, opacity: 0 }, at: 0, dur: 0.22, ease: POP });
  const mark = s.text("VOLTRA", { name: "brand", y: -735, mw: 0.4, font: "Bebas Neue", size: 60, weight: 400, color: DIM, tracking: 0.3 });
  mark.enter({ from: { opacity: 0 }, at: 0, dur: 0.22, ease: "linear" });

  // B2 and B3: the two cards, same slide, same curve, mirrored.
  const a = choice(s, { letter: "A", lines: ["Neon streets", "after the rain"], still: "street", fx: 0.42, tone: TEAL, side: -1, at: 2 });
  const b = choice(s, { letter: "B", lines: ["The long", "tunnel home"], still: "tunnel", fx: 0.5, tone: AMBER, side: 1, at: 4 });
  a.g.enter({ from: { offsetX: -0.2 * W, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  b.g.enter({ from: { offsetX: 0.2 * W, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  // A small emphasis on each as it lands.
  a.g.animate({ scale: [[0, 1], [0.5, 1.03, "out"], [1, 1, "inOut"]] }, { at: 0.3, dur: 0.5, role: "emphasis" });
  b.g.animate({ scale: [[0, 1], [0.5, 1.03, "out"], [1, 1, "inOut"]] }, { at: 0.3, dur: 0.5, role: "emphasis" });
  // B4 compare: one gentle alternating emphasis, A then B, then both hold.
  a.g.animate({ scale: [[0, 1], [0.5, 1.025, "inOut"], [1, 1, "inOut"]] }, { at: 4.3, dur: 0.6, role: "emphasis" });
  b.g.animate({ scale: [[0, 1], [0.5, 1.025, "inOut"], [1, 1, "inOut"]] }, { at: 2.9, dur: 0.6, role: "emphasis" });

  // The bottom slot: the compare prompt, then the instruction, which does not move.
  const compare = s.text("Pick one. No wrong answers.", { name: "compare", y: 500, mw: 0.86, size: 56, weight: 600, color: DIM, at: 6, dur: 2 });
  compare.enter({ from: { opacity: 0, offsetY: 16 }, at: 0, dur: 0.25, ease: SNAP });
  s.seq(8, 2, (q) => {
    const line1 = q.text("Comment A or B.", { name: "instruction-1", size: 72, weight: 800, color: TEXT, tracking: -0.03 });
    const line2 = q.text("We ride the winner next week.", { name: "instruction-2", size: 48, weight: 500, color: DIM });
    q.stack([line1, line2], { name: "instruction", at: { x: 0, y: 500 }, align: "center", gap: 10 });
  });

  s.finish({ vignette: 0.16, softness: 0.75, grain: 0.04, seed: 8 });
});

v.series([ask]);

const saved = await v.save(nodetool.timelines, {
  name: "Binary-choice card — Voltra",
  showcase: true
});
await output("timeline", {
  name: "Binary-choice card — Voltra",
  description: "A 10-second vertical engagement ad: one question over a darkened context shot, two matched choice cards, and a plain instruction to comment A or B.",
  videoUri: "/ad-library/videos/binary-choice-participation-card.mp4",
  posterUri: "/ad-library/videos/binary-choice-participation-card.webp",
  ...saved
});
