/**
 * Beginner tutorials shown on the Tutorials page, the dashboard section, and the
 * logo menu. Each entry points at a pre-rendered MP4 + poster shipped under
 * `web/public/tutorials/` (produced by the Remotion harness in `demo/`), so the
 * app plays them with a plain <video> — no Remotion bundled into the build.
 */
export interface Tutorial {
  /** Stable id, used in the `/tutorials?id=` query param. */
  id: string;
  title: string;
  /** One-line hook shown under the title. */
  tagline: string;
  /** A sentence or two describing what the tutorial covers. */
  description: string;
  /** Difficulty badge text. */
  level: string;
  /** Human-readable runtime, e.g. "0:23". */
  durationLabel: string;
  /** Public path to the rendered video. */
  video: string;
  /** Public path to the poster still. */
  poster: string;
  /** Accent colour (hex) used for the card and play button. */
  accent: string;
  /** Bullet points: what the viewer will learn. */
  learn: string[];
}

export const TUTORIALS: Tutorial[] = [
  {
    id: "first-workflow",
    title: "Build your first workflow",
    tagline: "Text → enhance → image, end to end",
    description:
      "Watch a complete AI pipeline run on the canvas: a prompt is enhanced by an LLM, then turned into an image — all from connected nodes, no code.",
    level: "Beginner",
    durationLabel: "0:23",
    video: "/tutorials/first-workflow.mp4",
    poster: "/tutorials/first-workflow.jpg",
    accent: "#f59e0b",
    learn: [
      "How nodes pass data through their handles",
      "Reading live status: running rings, streaming text, progress",
      "Where generated outputs appear on the canvas",
    ],
  },
  {
    id: "connect-run",
    title: "Connect & run",
    tagline: "The core loop in ten seconds",
    description:
      "The absolute basics. Add a node, drag from one handle into the next node's input, press Run, and read the result — the loop every workflow is built on.",
    level: "Beginner",
    durationLabel: "0:11",
    video: "/tutorials/connect-run.mp4",
    poster: "/tutorials/connect-run.jpg",
    accent: "#22c55e",
    learn: [
      "Inputs, outputs, and how handles connect",
      "Running a graph and watching nodes complete",
      "Finding a node's result in a Preview",
    ],
  },
  {
    id: "list-generator",
    title: "Generate a list",
    tagline: "One prompt, many results",
    description:
      "Turn a single topic into a structured list with one LLM node, then feed it downstream. The pattern behind batching, looping, and bulk generation.",
    level: "Beginner",
    durationLabel: "0:17",
    video: "/tutorials/list-generator.mp4",
    poster: "/tutorials/list-generator.jpg",
    accent: "#8b5cf6",
    learn: [
      "Driving an LLM node from an input",
      "Streaming multi-item output as it arrives",
      "Passing a list into the rest of a workflow",
    ],
  },
];

export const DEFAULT_TUTORIAL_ID = TUTORIALS[0].id;

export const getTutorial = (id: string | null | undefined): Tutorial =>
  TUTORIALS.find((t) => t.id === id) ?? TUTORIALS[0];
