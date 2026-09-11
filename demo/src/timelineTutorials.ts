/**
 * Timeline-editor tutorial videos rendered by the Remotion harness. Sibling
 * to `tutorials.ts` (the graph-editor tutorials) and `chatTutorials.ts` — same
 * three-beat shell, a different replay surface (`TimelineTutorial` /
 * `TimelineDemoPlayer`).
 */
import type { TimelineTutorialProps } from "./TimelineTutorial";
import { framesForTiming } from "./tutorialTiming";

const INTRO_SECONDS = 1.5;
const OUTRO_SECONDS = 2;

interface TimelineTutorialEntry {
  /** Remotion composition id, e.g. "TimelineTutorial-trim-arrange". */
  compositionId: string;
  /** Output basename under docs/assets/tutorials/. */
  slug: string;
  fps: number;
  props: TimelineTutorialProps;
}

const entry = (
  slug: string,
  fps: number,
  props: Omit<TimelineTutorialProps, "introSeconds" | "outroSeconds">
): TimelineTutorialEntry => ({
  compositionId: `TimelineTutorial-${slug}`,
  slug,
  fps,
  props: { ...props, introSeconds: INTRO_SECONDS, outroSeconds: OUTRO_SECONDS },
});

export const TIMELINE_TUTORIALS: TimelineTutorialEntry[] = [
  entry("trim-arrange", 30, {
    castId: "timeline-trim-arrange",
    title: "Cut a scene together",
    subtitle: "Timeline editor · trim, arrange, caption",
    replayWindowMs: 29000,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 3000, castFromMs: 0, castToMs: 1200 },
      { presentationFromMs: 3000, presentationToMs: 6500, castFromMs: 1200, castToMs: 2400 },
      { presentationFromMs: 6500, presentationToMs: 10000, castFromMs: 2400, castToMs: 7000 },
      { presentationFromMs: 10000, presentationToMs: 12000, castFromMs: 7000, castToMs: 7600 },
      { presentationFromMs: 12000, presentationToMs: 20000, castFromMs: 7600, castToMs: 15600 },
      { presentationFromMs: 20000, presentationToMs: 22000, castFromMs: 15600, castToMs: 16500 },
      { presentationFromMs: 22000, presentationToMs: 29000, castFromMs: 16500, castToMs: 16500 },
    ],
    shots: [
      { id: "timeline-overview", fromMs: 0, toMs: 700, target: { kind: "overview" }, moveMs: 0 },
      { id: "opening-clip", fromMs: 700, toMs: 3000, target: { kind: "component", focusId: "timeline-clip-demo-clip-intro" }, moveMs: 600, actionAtMs: 1500, anchorMs: 2600, emphasis: "outline-dim" },
      { id: "selection-inspector", fromMs: 3000, toMs: 4300, target: { kind: "group", targets: [{ kind: "component", focusId: "timeline-clip-demo-clip-intro" }, { kind: "component", focusId: "timeline-inspector" }] }, moveMs: 600, anchorMs: 4000 },
      { id: "trim-duration", fromMs: 4300, toMs: 6500, target: { kind: "component", focusId: "timeline-clip-demo-clip-intro" }, moveMs: 550, actionAtMs: 5917, anchorMs: 5000, emphasis: "outline-dim" },
      { id: "adjacent-clips", fromMs: 6500, toMs: 8200, target: { kind: "group", targets: [{ kind: "component", focusId: "timeline-clip-demo-clip-intro" }, { kind: "component", focusId: "timeline-clip-demo-clip-photo" }] }, moveMs: 600, actionAtMs: 7400, anchorMs: 8000, emphasis: "outline" },
      { id: "caption-track", fromMs: 8200, toMs: 10000, target: { kind: "component", focusId: "timeline-clip-demo-clip-caption" }, moveMs: 550, actionAtMs: 9087, anchorMs: 9600 },
      { id: "before-editor-zoom", fromMs: 10000, toMs: 11800, target: { kind: "component", focusId: "timeline-editor" }, moveMs: 400, actionAtMs: 10667, anchorMs: 11000 },
      { id: "full-playback", fromMs: 11800, toMs: 20000, target: { kind: "group", targets: [{ kind: "component", focusId: "timeline-preview" }, { kind: "component", focusId: "timeline-tracks" }] }, moveMs: 0, actionAtMs: 12000, anchorMs: 12500 },
      { id: "finished-cut", fromMs: 20000, toMs: 29000, target: { kind: "component", focusId: "timeline-editor" }, moveMs: 600, anchorMs: 24000 },
    ],
    steps: [
      { atMs: 1500, label: "Select the opening clip" },
      { atMs: 4300, label: "Trim it to five seconds" },
      { atMs: 6500, label: "Arrange the cut and caption" },
      { atMs: 10000, label: "Zoom, then play the full cut" },
    ],
    captions: [
      { fromMs: 1500, toMs: 4300, text: "Selection links the clip to its inspector." },
      { fromMs: 3600, toMs: 6500, text: "The trim changes eight seconds to five." },
      { fromMs: 6500, toMs: 10000, text: "The cutaway lands at five seconds, then the caption." },
      { fromMs: 10000, toMs: 12000, text: "Settle before timeline zoom." },
      { fromMs: 12500, toMs: 19500, text: "Playback runs the full eight-second cut." },
    ],
    outroTitle: "Edit at native speed",
    outroPoints: [
      "Trim, split, and arrange clips on real tracks",
      "Captions sync word-by-word with the audio",
      "Scrub and preview without leaving the browser",
    ],
  }),
];

/** Total frames for a timeline tutorial entry: intro + replay window + outro. */
export function timelineTutorialFrames(e: TimelineTutorialEntry): number {
  return framesForTiming(e.fps, e.props);
}
