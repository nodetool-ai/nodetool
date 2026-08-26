/**
 * Tutorials shown on the Tutorials page, the dashboard section, and the logo
 * menu. Each is a pre-rendered MP4 + poster produced by the Remotion harness
 * in `demo/`, and the pair is split by weight: the 55 MB of video streams from
 * the documentation site, which serves the same files to
 * [its own Tutorials page](https://docs.nodetool.ai/tutorials), while the
 * 1.8 MB of posters ships with the app.
 *
 * The split is not only about size. Posters render on every card the moment a
 * page opens, so a poster that depends on a deploy of another site is a broken
 * dashboard; a video is requested only when someone presses play.
 */
import { DOCS_BASE_URL } from "../../config/docsLinks";

/** A video, streamed from the docs site rather than bundled. */
const tutorialVideo = (file: string): string =>
  `${DOCS_BASE_URL}/assets/tutorials/${file}`;

/** A poster, served by the app itself from `web/public/tutorials/`. */
const tutorialPoster = (file: string): string => `/tutorials/${file}`;
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
  /** Absolute URL of the rendered video, streamed from the docs site. */
  video: string;
  /** App-served path of the poster still. */
  poster: string;
  /** Accent colour (hex) used for the card and play button. */
  accent: string;
  /** Bullet points: what the viewer will learn. */
  learn: string[];
}

export const TUTORIALS: Tutorial[] = [
  {
    id: "sketch-assistant",
    title: "Edit a sketch by asking",
    tagline: "Sketch editor · the assistant paints the layer",
    description:
      "Say what you want changed and the assistant works the real layer tools: it adds the layer, sets the blend mode, and dials in opacity while you watch the panel update.",
    level: "Beginner",
    durationLabel: "0:21",
    video: tutorialVideo("sketch-assistant.mp4"),
    poster: tutorialPoster("sketch-assistant.jpg"),
    accent: "#d946ef",
    learn: [
      "Asking for an edit against the layer stack you already have",
      "Watching layers appear in the panel as the assistant works",
      "Taking over by hand — every edit stays yours to change",
    ],
  },
  {
    id: "script-assistant",
    title: "Write and voice a script",
    tagline: "Script editor · cast, lines, takes",
    description:
      "From a blank page to voiced audio in one ask: the assistant casts the speakers, writes their lines, then synthesizes a take for each one.",
    level: "Beginner",
    durationLabel: "0:24",
    video: tutorialVideo("script-assistant.mp4"),
    poster: tutorialPoster("script-assistant.jpg"),
    accent: "#0ea5e9",
    learn: [
      "Describing a script by length, voices, and tone",
      "How speakers are cast before any line is written",
      "Voicing lines into takes you can swap or re-record",
    ],
  },
  {
    id: "storyboard-assistant",
    title: "Board a shot list",
    tagline: "Storyboard · direction, then stills",
    description:
      "Describe the piece and the assistant writes the shots — camera and all — before spending a frame. Approve the board, then the stills render shot by shot.",
    level: "Beginner",
    durationLabel: "0:30",
    video: tutorialVideo("storyboard-assistant.mp4"),
    poster: tutorialPoster("storyboard-assistant.jpg"),
    accent: "#ef4444",
    learn: [
      "Getting a shot list before any image is generated",
      "Revising a shot while it is still free to change",
      "Rendering stills across the board in one call",
    ],
  },
  {
    id: "app-assistant",
    title: "Build a mini app",
    tagline: "App builder · operation, setting, widgets",
    description:
      "Describe an app in a sentence — an input, a button, an answer — and the assistant binds the workflow as an operation and places each widget against something the app declares.",
    level: "Beginner",
    durationLabel: "0:25",
    video: tutorialVideo("app-assistant.mp4"),
    poster: tutorialPoster("app-assistant.jpg"),
    accent: "#6366f1",
    learn: [
      "Turning a workflow into an app anyone can run",
      "Saving a value as a setting that persists between sessions",
      "Binding widgets to inputs, outputs, and variables",
    ],
  },
  {
    id: "jsscript-assistant",
    title: "Write a JS script",
    tagline: "JS scripts · ports, body, saved test",
    description:
      "Say what goes in and what should come out. The assistant declares the ports first, writes the body, and saves a test case that grades it in the sandbox.",
    level: "Intermediate",
    durationLabel: "0:25",
    video: tutorialVideo("jsscript-assistant.mp4"),
    poster: tutorialPoster("jsscript-assistant.jpg"),
    accent: "#84cc16",
    learn: [
      "Declaring ports as the script's contract",
      "Reading a body that runs sandboxed — no filesystem access",
      "Keeping a saved case that catches the next breaking edit",
    ],
  },
  {
    id: "sketch-correction",
    title: "Correct it without starting over",
    tagline: "Sketch editor · the second ask amends the first",
    description:
      "The wash comes back too strong. Saying so in the next message edits the layer that is already there — the stack stays the same size and nothing is regenerated.",
    level: "Beginner",
    durationLabel: "0:28",
    video: tutorialVideo("sketch-correction.mp4"),
    poster: tutorialPoster("sketch-correction.jpg"),
    accent: "#2563eb",
    learn: [
      "Correcting a result instead of starting the ask again",
      "Reading which tool call the correction actually ran",
      "Taking the last step yourself with the panel controls",
    ],
  },
  {
    id: "storyboard-ask",
    title: "It asks before it spends",
    tagline: "Storyboard · a question, not a guess",
    description:
      "An under-specified brief gets a question back. The board stays empty and nothing renders while you decide, then your answer picks the format and the shot count.",
    level: "Beginner",
    durationLabel: "0:26",
    video: tutorialVideo("storyboard-ask.mp4"),
    poster: tutorialPoster("storyboard-ask.jpg"),
    accent: "#be123c",
    learn: [
      "Why an ambiguous brief comes back as a question",
      "What the assistant does while it waits on you: nothing",
      "Approving the spend once the shots read right",
    ],
  },
  {
    id: "jsscript-repair",
    title: "A test catches it",
    tagline: "JS scripts · red, then the repair, then green",
    description:
      "Name the edge case you do not trust. The assistant saves it as a test, runs it red with the reason in the open, repairs the body, and runs the same cases green.",
    level: "Intermediate",
    durationLabel: "0:29",
    video: tutorialVideo("jsscript-repair.mp4"),
    poster: tutorialPoster("jsscript-repair.jpg"),
    accent: "#0d9488",
    learn: [
      "Asking for the check before asking for the fix",
      "Reading a failing run instead of a summary of one",
      "Keeping the case saved so the next edit fails here first",
    ],
  },
  {
    id: "chat-agent-qa",
    title: "Ask the chat agent",
    tagline: "Global Chat · tool calls, streamed live",
    description:
      "A question goes straight to Global Chat: the agent calls a web-search tool in the open, then streams its answer back token by token.",
    level: "Beginner",
    durationLabel: "0:17",
    video: tutorialVideo("chat-agent-qa.mp4"),
    poster: tutorialPoster("chat-agent-qa.jpg"),
    accent: "#06b6d4",
    learn: [
      "Sending a message from Global Chat",
      "Watching a tool call run in the open",
      "Reading a streamed answer as it arrives",
    ],
  },
  {
    id: "first-workflow",
    title: "Build your first workflow",
    tagline: "Text → enhance → image, end to end",
    description:
      "Watch a complete AI pipeline run on the canvas: a prompt is enhanced by an LLM, then turned into an image — all from connected nodes, no code.",
    level: "Beginner",
    durationLabel: "0:23",
    video: tutorialVideo("first-workflow.mp4"),
    poster: tutorialPoster("first-workflow.jpg"),
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
    video: tutorialVideo("connect-run.mp4"),
    poster: tutorialPoster("connect-run.jpg"),
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
    video: tutorialVideo("list-generator.mp4"),
    poster: tutorialPoster("list-generator.jpg"),
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
    video: tutorialVideo("ask-ai.mp4"),
    poster: tutorialPoster("ask-ai.jpg"),
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
    video: tutorialVideo("combine-inputs.mp4"),
    poster: tutorialPoster("combine-inputs.jpg"),
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
    video: tutorialVideo("summarize-text.mp4"),
    poster: tutorialPoster("summarize-text.jpg"),
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
    video: tutorialVideo("describe-image.mp4"),
    poster: tutorialPoster("describe-image.jpg"),
    accent: "#f97316",
    learn: [
      "Bringing an image into a graph",
      "Sending a picture to a vision model",
      "Reusing the streamed description downstream",
    ],
  },
  {
    id: "timeline-trim-arrange",
    title: "Cut a scene together",
    tagline: "Timeline editor · trim, arrange, caption",
    description:
      "A short editing session on the timeline: trim a clip, drag in another, drop in a word-synced caption, then scrub the finished cut.",
    level: "Beginner",
    durationLabel: "0:23",
    video: tutorialVideo("timeline-trim-arrange.mp4"),
    poster: tutorialPoster("timeline-trim-arrange.jpg"),
    accent: "#8b5cf6",
    learn: [
      "Trimming and arranging clips on tracks",
      "Adding a caption synced word-by-word",
      "Scrubbing and previewing the cut live",
    ],
  },
];

export const getTutorial = (id: string | null | undefined): Tutorial =>
  TUTORIALS.find((t) => t.id === id) ?? TUTORIALS[0];
