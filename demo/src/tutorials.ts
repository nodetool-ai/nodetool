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
    replayWindowMs: 18000,
    steps: [
      { atMs: 1300, label: "Text input", focus: "input", zoom: 2.5 },
      { atMs: 3400, label: "Enhance with an LLM", focus: "enhance", zoom: 2.2 },
      { atMs: 10600, label: "Text to Image", focus: "generate", zoom: 1.85 },
    ],
    captions: [
      { fromMs: 1500, toMs: 3300, text: "Start with a Text Input — type the prompt your workflow will run on." },
      { fromMs: 3500, toMs: 9400, text: "An LLM node rewrites it into a richer, more detailed prompt — streaming as it thinks." },
      { fromMs: 10800, toMs: 16400, text: "Feed that into an image model — the picture renders right inside the node." },
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
      { atMs: 1300, label: "Add a node", focus: "text", zoom: 2.6 },
      { atMs: 3000, label: "Connect & run", focus: "upper", zoom: 2.5 },
      { atMs: 5600, label: "Read the output", focus: "preview", zoom: 2.1 },
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
      { atMs: 1400, label: "Set a topic", focus: "topic", zoom: 2.5 },
      { atMs: 3200, label: "Generate a list", focus: "list", zoom: 1.95 },
      { atMs: 11600, label: "Preview the items", focus: "preview", zoom: 1.85 },
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

  entry("ask-ai", 30, {
    castId: "ask-ai",
    title: "Ask the AI",
    subtitle: "A question in, a streamed answer out",
    replayWindowMs: 13000,
    steps: [
      { atMs: 1400, label: "Type a question", focus: "question", zoom: 2.5 },
      { atMs: 2900, label: "Send it to an LLM", focus: "chat", zoom: 1.95 },
      { atMs: 10500, label: "Read the answer", focus: "preview", zoom: 1.85 },
    ],
    captions: [
      { fromMs: 1600, toMs: 2800, text: "Start with a question — anything you'd ask a chatbot." },
      { fromMs: 3000, toMs: 9400, text: "An LLM node answers, streaming each phrase as it thinks." },
      { fromMs: 10700, toMs: 12800, text: "The finished answer lands in a Preview, ready to reuse." },
    ],
    outroTitle: "Ask anything",
    outroPoints: [
      "Swap in your own question",
      "Add a system prompt to set the tone",
      "Chain the answer into the next node",
    ],
  }),

  entry("combine-inputs", 30, {
    castId: "combine-inputs",
    title: "Combine two inputs",
    subtitle: "Merge values with a template",
    replayWindowMs: 9000,
    steps: [
      { atMs: 1300, label: "Two text inputs", focus: "name", zoom: 2.1 },
      { atMs: 3000, label: "Fill a template", focus: "format", zoom: 2.0 },
      { atMs: 6000, label: "Read the result", focus: "preview", zoom: 1.95 },
    ],
    captions: [
      { fromMs: 1500, toMs: 2800, text: "Two inputs this time — a name and a topic." },
      { fromMs: 3100, toMs: 5700, text: "Both wire into one Prompt node that fills a {{ template }}." },
      { fromMs: 6100, toMs: 8800, text: "The merged sentence appears in the Preview." },
    ],
    outroTitle: "Branch and merge",
    outroPoints: [
      "Feed many inputs into one node",
      "Use {{ placeholders }} to compose text",
      "Build prompts from reusable parts",
    ],
  }),
];

/** Total frames for an entry: intro + replay window + outro. */
export function tutorialFrames(e: TutorialEntry): number {
  const seconds =
    e.props.introSeconds + e.props.replayWindowMs / 1000 + e.props.outroSeconds;
  return Math.round(seconds * e.fps);
}
