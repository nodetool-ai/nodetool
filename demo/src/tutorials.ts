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
    replayWindowMs: 24000,
    steps: [
      { atMs: 1300, label: "Text input", focus: "input", zoom: 1.9 },
      { atMs: 3400, label: "Enhance with an LLM", focus: "enhance", zoom: 1.7 },
      { atMs: 10600, label: "Generate an image", focus: "generate", zoom: 1.6 },
      { atMs: 20400, label: "Preview the result", focus: "preview", zoom: 1.45 },
    ],
    captions: [
      { fromMs: 1500, toMs: 3300, text: "Start with a Text Input — type the prompt your workflow will run on." },
      { fromMs: 3500, toMs: 9400, text: "An LLM node rewrites it into a richer, more detailed prompt — streaming as it thinks." },
      { fromMs: 11000, toMs: 18800, text: "That prompt feeds an image model. The bar shows it rendering, step by step." },
      { fromMs: 20800, toMs: 23800, text: "The finished image previews right here on the canvas — no code needed." },
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
    subtitle: "The core loop, one step at a time",
    replayWindowMs: 8800,
    steps: [
      { atMs: 1300, label: "Add a node", focus: "text", zoom: 1.9 },
      { atMs: 3000, label: "Connect & run", focus: "upper", zoom: 1.9 },
      { atMs: 5600, label: "Read the output", focus: "preview", zoom: 1.6 },
    ],
    captions: [
      { fromMs: 1500, toMs: 2900, text: "Every node does one job — this Text node just holds some text." },
      { fromMs: 3100, toMs: 5300, text: "Wire its output into the next node and Run — the node lights up as it works." },
      { fromMs: 5800, toMs: 8700, text: "A Preview node shows the result: here, the text uppercased." },
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
    replayWindowMs: 14500,
    steps: [
      { atMs: 1400, label: "Set a topic", focus: "topic", zoom: 1.9 },
      { atMs: 3200, label: "Generate a list", focus: "list", zoom: 1.6 },
      { atMs: 11600, label: "Preview the items", focus: "preview", zoom: 1.5 },
    ],
    captions: [
      { fromMs: 1600, toMs: 3000, text: "Give the model a topic to work from — here, 'weekend trip ideas'." },
      { fromMs: 3300, toMs: 10300, text: "One LLM node returns a whole list, streaming each item as it arrives." },
      { fromMs: 11800, toMs: 14300, text: "Every item lands in the preview, ready to use elsewhere in the workflow." },
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
