/**
 * Timeline-editor tutorial videos rendered by the Remotion harness. Sibling
 * to `tutorials.ts` (the graph-editor tutorials) and `chatTutorials.ts` — same
 * three-beat shell, a different replay surface (`TimelineTutorial` /
 * `TimelineDemoPlayer`).
 */
import type { TimelineTutorialProps } from "./TimelineTutorial";
import { framesForTiming } from "./tutorialTiming";

const INTRO_SECONDS = 2.5;
const OUTRO_SECONDS = 4;

export interface TimelineTutorialEntry {
  /** Remotion composition id, e.g. "TimelineTutorial-trim-arrange". */
  compositionId: string;
  /** Output basename: out/<slug>.mp4 → web/public/tutorials/<slug>.mp4. */
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
    replayWindowMs: 16000,
    steps: [
      { atMs: 600, label: "Select a clip" },
      { atMs: 3600, label: "Add another, drop in a caption" },
      { atMs: 7200, label: "Zoom in and play it back" },
    ],
    captions: [
      { fromMs: 700, toMs: 2000, text: "Select a clip on the timeline to trim or inspect it." },
      { fromMs: 3800, toMs: 6200, text: "Drag in the next shot and a caption — both land on their own track." },
      { fromMs: 7400, toMs: 15600, text: "Zoom in, scrub the playhead, and watch the cut play back live." },
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
