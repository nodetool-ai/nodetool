// Ad library R16, A capability sequence on connected paths: a 12-second
// vertical ad for a fictional bookkeeping service. Four stages sit on one
// continuous path; the progress stroke reaches one node at a time.
//
// `node scripts/example-timelines/ad-library.mjs build a-capability-journey-on-connected-paths`
// writes marketing/recipe-assets/ad-library/a-capability-journey-on-connected-paths.timeline.json.
//
// The service and its timeline are fictional; the icons are drawn from
// shapes. Every time value is seconds from the start of the ad, the beat times
// in marketing/src/data/adLibrary.json. Positions are px from the frame
// centre on a 1080×1920 frame.
//
// Motion language: the same grammar for every stage (a 500 ms stroke draw,
// then a 240 ms node pop on arrival), one restrained pulse on the last node,
// a single 6% pull-back at the end.
import { video } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const PAPER = "#f5f2ea", PAPER2 = "#ebe5d6", INK = "#14231f", DIM = "#68766f", TRACK = "#d6d0c1", FOREST = "#1f7a5a", AMBER = "#f2a93b";
const SNAP = "cubic-bezier(0.16,1,0.3,1)";
const POP = "cubic-bezier(0.3,1.35,0.6,1)";
const EASE_IO = "cubic-bezier(0.65,0,0.35,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: PAPER, ink2: PAPER2, text: INK, dim: DIM, accent: FOREST },
  fonts: { display: "Inter", body: "Inter" }
});

const NODES = [
  { x: -240, y: -410, label: "Intro call", icon: "chat", active: 0 },
  { x: 240, y: -160, label: "Connect", icon: "link", active: 2.3 },
  { x: -240, y: 90, label: "Clean up", icon: "list", active: 4.7 },
  { x: 240, y: 340, label: "Close", icon: "check", active: 7.1 }
];
const ND = 160;
// Each stage draws its segment over 500 ms and lands as the next node activates.
const DRAW = 0.5;

/** The curve from node i to node i+1: out sideways, then into the next node. */
function segment(i) {
  const a = NODES[i], b = NODES[i + 1];
  const dir = Math.sign(b.x - a.x);
  return [["M", a.x + dir * ND / 2, a.y], ["C", a.x + dir * 330, a.y, b.x - dir * 330, b.y, b.x - dir * ND / 2, b.y]];
}

/** A white icon inside a node. */
function icon(s, kind, parent) {
  const o = { parent, stroke: "#ffffff", sw: 8 };
  if (kind === "chat") {
    s.rect(70, 52, null, { ...o, name: "icon-chat", r: 16, y: -6 });
    s.path([["M", -16, 20], ["L", -24, 34], ["L", -2, 20]], { ...o, name: "icon-chat-tail" });
  } else if (kind === "link") {
    s.ellipse(44, null, { ...o, name: "icon-link-a", x: -14 });
    s.ellipse(44, null, { ...o, name: "icon-link-b", x: 14 });
  } else if (kind === "list") {
    [-18, 0, 18].forEach((dy, k) => s.rect(k === 2 ? 34 : 56, 8, "#ffffff", { parent, name: `icon-list-${k}`, y: dy, x: k === 2 ? -11 : 0, r: 4 }));
  } else {
    s.path([["M", -22, 0], ["L", -6, 16], ["L", 24, -16]], { ...o, name: "icon-check", sw: 10 });
  }
}

const journey = v.scene("Journey", 12, (s) => {
  s.backdrop({ colors: [PAPER, PAPER2], opacity: 0.55, seed: 27 });

  // B5 pull-back: the whole diagram settles back 6% once the journey is complete.
  const diagram = s.group({ name: "diagram" });
  diagram.animate({ scale: [1, 0.94, EASE_IO], offsetY: [0, -30, EASE_IO] }, { at: 9.0, dur: 0.6, role: "out" });

  // The continuous path, faint from the first frame, then drawn in forest one stage at a time.
  NODES.slice(0, -1).forEach((_, i) => s.path(segment(i), { name: `track-${i}`, parent: diagram.id, stroke: TRACK, sw: 10 }));
  NODES.slice(0, -1).forEach((_, i) => {
    const seg = s.path(segment(i), { name: `progress-${i}`, parent: diagram.id, stroke: FOREST, sw: 10, at: NODES[i + 1].active - DRAW });
    seg.draw({ at: 0, dur: DRAW, ease: EASE_IO });
  });

  NODES.forEach((n, i) => {
    // The resting node: an outline on the track.
    s.ellipse(ND, PAPER, { name: `node-${i}-rest`, parent: diagram.id, x: n.x, y: n.y, stroke: TRACK, sw: 6 });
    const node = s.group({ name: `node-${i}`, parent: diagram.id, x: n.x, y: n.y, at: n.active });
    s.glow({ name: `node-${i}-glow`, parent: node.id, size: 360, alpha: 0.25, color: FOREST, at: n.active });
    s.ellipse(ND, FOREST, { name: `node-${i}-disc`, parent: node.id, at: n.active });
    icon(s, n.icon, node.id);
    node.enter({ from: { scale: 0.5, opacity: 0 }, at: 0, dur: 0.24, ease: POP });
    // A stage the journey has moved past dims slightly; the last one gets one restrained pulse.
    const next = NODES[i + 1];
    if (next) node.animate({ opacity: [1, 0.7, "out"], scale: [1, 0.92, "out"] }, { at: next.active - n.active, dur: 0.3, role: "out" });
    else node.animate({ scale: [[0, 1], [0.5, 1.08, "out"], [1, 1, "inOut"]] }, { at: 0.35, dur: 0.5, role: "emphasis" });
    // The label sits under its node, clear of the path, which leaves the node sideways.
    const label = s.text(n.label, { name: `node-${i}-label`, parent: diagram.id, x: n.x, y: n.y + ND / 2 + 46, mw: 0.4, size: 50, weight: 700, color: INK, at: n.active });
    label.enter({ from: { opacity: 0, offsetY: -12 }, at: 0.1, dur: 0.24, ease: SNAP });
  });
  // Every node comes back to full strength for the finished journey.
  NODES.slice(0, -1).forEach((n, i) => {
    const back = s.group({ name: `node-${i}-final`, parent: diagram.id, x: n.x, y: n.y, at: 9.0 });
    s.ellipse(ND, FOREST, { name: `node-${i}-final-disc`, parent: back.id, at: 9.0 });
    icon(s, n.icon, back.id);
    back.enter({ from: { opacity: 0 }, at: 0, dur: 0.3, ease: "linear" });
  });

  // The headline slot: the outcome, then one line per stage, then the outcome again with the CTA.
  [["Books closed by the 5th, every month", 0, 1.8, INK], ["Week 1: connect your accounts", 1.8, 2.4, INK], ["Week 2: we clear the backlog", 4.2, 2.4, INK], ["Week 3: your first monthly close", 6.6, 2.4, INK], ["Closed by the 5th. Every month.", 9.0, 3.0, FOREST]].forEach(([str, at, dur, color], i) => {
    const t = s.text(str, { name: `headline-${i}`, y: -640, mw: 0.86, size: 82, weight: 800, color, tracking: -0.035, at, dur, style: { lineHeight: 1.06 } });
    t.enter({ from: { offsetY: 30, opacity: 0.3 }, at: 0, dur: 0.25, ease: SNAP });
  });

  s.seq(9.3, 2.7, (q) => {
    const button = q.pill("Book a 20-minute intro call", { name: "cta", y: 560, size: 46, weight: 800, color: PAPER, fillColor: INK, stroke: "rgba(0,0,0,0)", padX: 64, padY: 28, dot: AMBER });
    button.enter({ from: { offsetY: 24, opacity: 0 }, at: 0, dur: 0.25, ease: SNAP });
  });

  s.finish({ vignette: 0.08, softness: 0.85, grain: 0.03, seed: 20 });
});

v.series([journey]);

const saved = await v.save(nodetool.timelines, {
  name: "Capability journey — Tally & Co",
  showcase: true
});
await output("timeline", {
  name: "Capability journey — Tally & Co",
  description: "A 12-second vertical ad: four onboarding stages on one continuous path, each drawn in and activated in turn, then the whole journey pulls back under a CTA.",
  videoUri: "/ad-library/videos/a-capability-journey-on-connected-paths.mp4",
  posterUri: "/ad-library/videos/a-capability-journey-on-connected-paths.webp",
  ...saved
});
