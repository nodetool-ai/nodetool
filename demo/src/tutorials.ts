/**
 * The set of beginner tutorials rendered by the Remotion harness.
 *
 * Each entry fully describes one tutorial video: which cast to replay, the
 * title/outro cards, the step indicator beats, and the lower-third captions.
 * `Root.tsx` registers one `Tutorial` composition per entry; the render scripts
 * (see package.json) emit one MP4 per `slug` into `out/`, which then ship in the
 * web app under `web/public/tutorials/`.
 */
import type { TutorialProps } from "./Tutorial";

const INTRO_SECONDS = 2.5;
const OUTRO_SECONDS = 4;

export interface TutorialEntry {
  /** Remotion composition id, e.g. "Tutorial-first-workflow". */
  compositionId: string;
  /** Output basename: out/<slug>.mp4 → web/public/tutorials/<slug>.mp4. */
  slug: string;
  fps: number;
  props: TutorialProps;
}

const entry = (
  slug: string,
  fps: number,
  props: Omit<TutorialProps, "introSeconds" | "outroSeconds">
): TutorialEntry => ({
  compositionId: `Tutorial-${slug}`,
  slug,
  fps,
  props: { ...props, introSeconds: INTRO_SECONDS, outroSeconds: OUTRO_SECONDS },
});

export const TUTORIALS: TutorialEntry[] = [
  entry("first-workflow", 30, {
    castId: "intro-tutorial",
    title: "Build your first workflow",
    subtitle: "NodeTool · visual AI, no code",
    replayWindowMs: 16500,
    steps: [
      { atMs: 0, label: "Text input" },
      { atMs: 900, label: "Enhance with an LLM" },
      { atMs: 5600, label: "Generate an image" },
      { atMs: 14400, label: "Preview the result" },
    ],
    captions: [
      { fromMs: 200, toMs: 2200, text: "Each node does one task — wire its output into the next node's input." },
      { fromMs: 2400, toMs: 5400, text: "An LLM node rewrites the prompt, streaming its answer live." },
      { fromMs: 5600, toMs: 13800, text: "The next node turns that prompt into an image, step by step." },
      { fromMs: 14000, toMs: 16400, text: "Outputs render right on the canvas. No code, no glue." },
    ],
    outroTitle: "Your turn",
    outroPoints: [
      "Drag in a node, wire it to the next",
      "Hit Run — watch every node light up",
      "Outputs preview right on the canvas",
    ],
  }),

  entry("connect-run", 30, {
    castId: "connect-run",
    title: "Connect & run",
    subtitle: "The core loop in ten seconds",
    replayWindowMs: 4400,
    steps: [
      { atMs: 0, label: "Add a node" },
      { atMs: 700, label: "Connect a handle" },
      { atMs: 1000, label: "Hit Run" },
      { atMs: 2900, label: "Read the output" },
    ],
    captions: [
      { fromMs: 200, toMs: 2300, text: "Every node has handles — drag from an output into the next node's input." },
      { fromMs: 2450, toMs: 4300, text: "Press Run and your data flows through to the output." },
    ],
    outroTitle: "That's the whole loop",
    outroPoints: [
      "Add nodes from the menu",
      "Connect handle → handle",
      "Run, then read the result",
    ],
  }),

  entry("list-generator", 30, {
    castId: "list-generator",
    title: "Generate a list",
    subtitle: "One prompt, many results",
    replayWindowMs: 10500,
    steps: [
      { atMs: 0, label: "Set a topic" },
      { atMs: 1000, label: "Generate a list" },
      { atMs: 8900, label: "Preview the items" },
    ],
    captions: [
      { fromMs: 200, toMs: 2300, text: "Start with a topic for the model to build on." },
      { fromMs: 2400, toMs: 8200, text: "One LLM node streams back a full list, item by item." },
      { fromMs: 8400, toMs: 10400, text: "Feed the list anywhere downstream — preview, loop, or save." },
    ],
    outroTitle: "Generate anything",
    outroPoints: [
      "Swap the topic for any idea",
      "Loop over each item to act on it",
      "Connect outputs to save or share",
    ],
  }),
];

/** Total frames for an entry: intro + replay window + outro. */
export function tutorialFrames(e: TutorialEntry): number {
  const seconds =
    e.props.introSeconds + e.props.replayWindowMs / 1000 + e.props.outroSeconds;
  return Math.round(seconds * e.fps);
}
