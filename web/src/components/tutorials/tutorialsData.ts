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
  {
    id: "ask-ai",
    title: "Ask the AI",
    tagline: "A question in, a streamed answer out",
    description:
      "The simplest chat-style graph: type a question, send it to an LLM node, and watch the answer stream in phrase by phrase before it lands in a Preview.",
    level: "Beginner",
    durationLabel: "0:16",
    video: "/tutorials/ask-ai.mp4",
    poster: "/tutorials/ask-ai.jpg",
    accent: "#06b6d4",
    learn: [
      "Feeding a question into an LLM node",
      "Watching an answer stream as it generates",
      "Reusing the answer downstream",
    ],
  },
  {
    id: "combine-inputs",
    title: "Combine two inputs",
    tagline: "Merge values with a template",
    description:
      "The first graph that branches in: two text inputs flow into one Prompt node that fills a template, composing a single result from reusable parts.",
    level: "Beginner",
    durationLabel: "0:12",
    video: "/tutorials/combine-inputs.mp4",
    poster: "/tutorials/combine-inputs.jpg",
    accent: "#ec4899",
    learn: [
      "Wiring several inputs into one node",
      "Composing text with {{ placeholders }}",
      "Building prompts from reusable parts",
    ],
  },
  {
    id: "summarize-text",
    title: "Summarize a document",
    tagline: "Long text in, key points out",
    description:
      "Condense an article, transcript, or any block of text into a short summary with a single Summarizer node, streaming it as it writes.",
    level: "Beginner",
    durationLabel: "0:16",
    video: "/tutorials/summarize-text.mp4",
    poster: "/tutorials/summarize-text.jpg",
    accent: "#14b8a6",
    learn: [
      "Feeding a long passage into a Summarizer node",
      "Watching the summary stream as it generates",
      "Passing the result into the rest of a workflow",
    ],
  },
  {
    id: "describe-image",
    title: "Describe an image",
    tagline: "Show the AI a picture, get words back",
    description:
      "The first multimodal graph: drop a picture into an Image Input, wire it into an Agent, and watch the model look at the image and describe it in words.",
    level: "Beginner",
    durationLabel: "0:17",
    video: "/tutorials/describe-image.mp4",
    poster: "/tutorials/describe-image.jpg",
    accent: "#f97316",
    learn: [
      "Bringing an image into a graph",
      "Sending a picture to a vision model",
      "Reusing the streamed description downstream",
    ],
  },
];

export const getTutorial = (id: string | null | undefined): Tutorial =>
  TUTORIALS.find((t) => t.id === id) ?? TUTORIALS[0];
