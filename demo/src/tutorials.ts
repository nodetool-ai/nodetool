/**
 * The set of beginner tutorials rendered by the Remotion harness.
 *
 * Each entry fully describes one tutorial video: which cast to replay, the
 * title/outro cards, the step indicator beats, and the lower-third captions.
 * `Root.tsx` registers one `Tutorial` composition per entry; the render scripts
 * (see package.json) emit MP4s and JPGs under `docs/assets/tutorials/`.
 * Only the JPG posters are copied into the app bundle.
 */
import type { TutorialProps } from "./Tutorial";
import { framesForTiming } from "./tutorialTiming";
import type { FocusTarget, TutorialShot } from "./types";

const INTRO_SECONDS = 2.5;
const OUTRO_SECONDS = 4;

const overview: FocusTarget = { kind: "overview" };
const node = (nodeId: string): FocusTarget => ({ kind: "node", nodeId });
const group = (...nodeIds: string[]): FocusTarget => ({
  kind: "group",
  targets: nodeIds.map(node),
});
const shot = (
  id: string,
  fromMs: number,
  toMs: number,
  target: FocusTarget,
  options: Omit<TutorialShot, "id" | "fromMs" | "toMs" | "target"> = {}
): TutorialShot => ({ id, fromMs, toMs, target, moveMs: 650, padding: 100, ...options });

export interface TutorialEntry {
  /** Remotion composition id, e.g. "Tutorial-first-workflow". */
  compositionId: string;
  /** Output basename under docs/assets/tutorials/. */
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
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 1000, castFromMs: 0, castToMs: 0 },
      { presentationFromMs: 1000, presentationToMs: 4000, castFromMs: 0, castToMs: 1600 },
      { presentationFromMs: 4000, presentationToMs: 6500, castFromMs: 1600, castToMs: 1600 },
      { presentationFromMs: 6500, presentationToMs: 13500, castFromMs: 1600, castToMs: 9600 },
      { presentationFromMs: 13500, presentationToMs: 15000, castFromMs: 9600, castToMs: 9600 },
      { presentationFromMs: 15000, presentationToMs: 19900, castFromMs: 9600, castToMs: 16000 },
      { presentationFromMs: 19900, presentationToMs: 24000, castFromMs: 16000, castToMs: 16000 },
    ],
    steps: [
      { atMs: 1300, label: "Text input", focus: "input", zoom: 2.5 },
      { atMs: 3400, label: "Enhance with an LLM", focus: "enhance", zoom: 2.2 },
      { atMs: 10600, label: "Text to Image", focus: "generate", zoom: 1.85 },
    ],
    shots: [
      shot("workflow-overview", 0, 1700, overview, { moveMs: 0, maxZoom: 1.1 }),
      shot("prompt-value", 1700, 4000, node("input"), { actionAtMs: 3625, maxZoom: 2.15 }),
      shot("prompt-to-llm", 4000, 5600, group("input", "enhance"), { maxZoom: 1.35 }),
      shot("enhanced-text-stream", 5600, 13500, node("enhance"), { actionAtMs: 7025, anchorMs: 6250, maxZoom: 1.85 }),
      shot("image-generation", 13500, 16500, node("generate"), { actionAtMs: 15781, anchorMs: 14150, maxZoom: 1.75 }),
      shot("completed-image", 16500, 22000, node("generate"), { actionAtMs: 19516, anchorMs: 19900, maxZoom: 2.5, emphasis: "outline" }),
      shot("completed-workflow", 22000, 24000, overview, { maxZoom: 1.1 }),
    ],
    captions: [
      { fromMs: 1800, toMs: 3900, text: "Text Input holds the prompt." },
      { fromMs: 4100, toMs: 5500, text: "Feeds Enhance Prompt." },
      { fromMs: 5800, toMs: 11400, text: "The LLM expands the idea while its answer streams into the node." },
      { fromMs: 11800, toMs: 16300, text: "That richer prompt drives Text To Image." },
      { fromMs: 16800, toMs: 21600, text: "Completed image appears inside Text To Image." },
      { fromMs: 22200, toMs: 23800, text: "Text becomes an image." },
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
    replayWindowMs: 16000,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 1000, castFromMs: 0, castToMs: 0 },
      { presentationFromMs: 1000, presentationToMs: 3600, castFromMs: 0, castToMs: 1700 },
      { presentationFromMs: 3600, presentationToMs: 6550, castFromMs: 1700, castToMs: 1700 },
      { presentationFromMs: 6550, presentationToMs: 8150, castFromMs: 1700, castToMs: 4700 },
      { presentationFromMs: 8150, presentationToMs: 10700, castFromMs: 4700, castToMs: 4700 },
      { presentationFromMs: 10700, presentationToMs: 13200, castFromMs: 4700, castToMs: 7200 },
      { presentationFromMs: 13200, presentationToMs: 16000, castFromMs: 7200, castToMs: 7200 },
    ],
    steps: [
      { atMs: 1300, label: "Read the source", focus: "text", zoom: 2.6 },
      { atMs: 3900, label: "Follow the run", focus: "upper", zoom: 2.5 },
      { atMs: 7000, label: "Read the output", focus: "preview", zoom: 2.1 },
    ],
    shots: [
      shot("graph-overview", 0, 1500, overview, { moveMs: 0, maxZoom: 1.1 }),
      shot("source-value", 1500, 3600, node("text"), { actionAtMs: 2988, maxZoom: 2.1 }),
      shot("first-connection", 3600, 5700, group("text", "upper"), { maxZoom: 1.45 }),
      shot("uppercase-execution", 5700, 8150, node("upper"), { actionAtMs: 7030, anchorMs: 6350, maxZoom: 2 }),
      shot("second-connection", 8150, 10700, group("upper", "preview"), { maxZoom: 1.4 }),
      shot("uppercase-preview", 10700, 14000, node("preview"), { actionAtMs: 12000, anchorMs: 11350, maxZoom: 2.5, emphasis: "outline" }),
      shot("completed-path", 14000, 16000, overview, { maxZoom: 1.1 }),
    ],
    captions: [
      { fromMs: 1600, toMs: 3500, text: "Source: hello nodetool." },
      { fromMs: 3800, toMs: 5500, text: "Follow the Uppercase connection." },
      { fromMs: 5900, toMs: 7900, text: "Uppercase changes the value." },
      { fromMs: 8200, toMs: 9700, text: "Result travels onward." },
      { fromMs: 10100, toMs: 13800, text: "Preview receives the completed value: HELLO NODETOOL." },
    ],
    outroTitle: "That's the whole loop",
    outroPoints: [
      "Trace values from left to right",
      "Watch each node complete",
      "Read the result in Preview",
    ],
  }),

  entry("list-generator", 30, {
    castId: "list-generator",
    title: "Generate a list",
    subtitle: "One prompt, many results",
    replayWindowMs: 19050,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 1000, castFromMs: 0, castToMs: 0 },
      { presentationFromMs: 1000, presentationToMs: 3700, castFromMs: 0, castToMs: 1700 },
      { presentationFromMs: 3700, presentationToMs: 6250, castFromMs: 1700, castToMs: 1700 },
      { presentationFromMs: 6250, presentationToMs: 12200, castFromMs: 1700, castToMs: 11000 },
      { presentationFromMs: 12200, presentationToMs: 13050, castFromMs: 11000, castToMs: 11000 },
      { presentationFromMs: 13050, presentationToMs: 15650, castFromMs: 11000, castToMs: 13600 },
      { presentationFromMs: 15650, presentationToMs: 19050, castFromMs: 13600, castToMs: 13600 },
    ],
    steps: [
      { atMs: 1400, label: "Set a topic", focus: "topic", zoom: 2.5 },
      { atMs: 5400, label: "Generate a list", focus: "list", zoom: 1.95 },
      { atMs: 12200, label: "Preview the items", focus: "preview", zoom: 1.85 },
    ],
    shots: [
      shot("list-overview", 0, 1500, overview, { moveMs: 0, maxZoom: 1.05 }),
      shot("topic-value", 1500, 3700, node("topic"), { actionAtMs: 3141, maxZoom: 2.1 }),
      shot("topic-connection", 3700, 5400, group("topic", "list"), { maxZoom: 1.35 }),
      shot("streaming-items", 5400, 12200, node("list"), { actionAtMs: 6698, anchorMs: 6050, maxZoom: 1.7 }),
      shot("list-preview", 12200, 17050, node("preview"), { actionAtMs: 14550, anchorMs: 15650, maxZoom: 2.5, emphasis: "outline" }),
      shot("list-downstream", 17050, 19050, group("list", "preview"), { maxZoom: 1.25 }),
    ],
    captions: [
      { fromMs: 1700, toMs: 3600, text: "Topic: weekend trip ideas." },
      { fromMs: 3900, toMs: 5300, text: "Feeds Generate List." },
      { fromMs: 5600, toMs: 12000, text: "The camera stays still while five trip ideas arrive." },
      { fromMs: 12400, toMs: 16800, text: "Preview shows the completed collection as one downstream value." },
      { fromMs: 17250, toMs: 18850, text: "List stays connected." },
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
    replayWindowMs: 17750,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 1000, castFromMs: 0, castToMs: 0 },
      { presentationFromMs: 1000, presentationToMs: 3800, castFromMs: 0, castToMs: 1800 },
      { presentationFromMs: 3800, presentationToMs: 6250, castFromMs: 1800, castToMs: 1800 },
      { presentationFromMs: 6250, presentationToMs: 11100, castFromMs: 1800, castToMs: 10000 },
      { presentationFromMs: 11100, presentationToMs: 11950, castFromMs: 10000, castToMs: 10000 },
      { presentationFromMs: 11950, presentationToMs: 14450, castFromMs: 10000, castToMs: 12500 },
      { presentationFromMs: 14450, presentationToMs: 17750, castFromMs: 12500, castToMs: 12500 },
    ],
    steps: [
      { atMs: 1400, label: "Type a question", focus: "question", zoom: 2.5 },
      { atMs: 5400, label: "Send it to an LLM", focus: "chat", zoom: 1.95 },
      { atMs: 11100, label: "Read the answer", focus: "preview", zoom: 1.85 },
    ],
    shots: [
      shot("question-overview", 0, 1500, overview, { moveMs: 0, maxZoom: 1.05 }),
      shot("question-value", 1500, 3800, node("question"), { actionAtMs: 3333, maxZoom: 2 }),
      shot("question-connection", 3800, 5400, group("question", "chat"), { maxZoom: 1.35 }),
      shot("answer-stream", 5400, 11100, node("chat"), { actionAtMs: 6664, anchorMs: 6050, maxZoom: 1.75 }),
      shot("answer-preview", 11100, 15750, node("preview"), { actionAtMs: 13250, anchorMs: 14450, maxZoom: 2.5, emphasis: "outline" }),
      shot("answer-context", 15750, 17750, group("chat", "preview"), { maxZoom: 1.25 }),
    ],
    captions: [
      { fromMs: 1700, toMs: 3700, text: "Explain an API briefly." },
      { fromMs: 4000, toMs: 5300, text: "Question reaches Agent." },
      { fromMs: 5600, toMs: 10900, text: "Agent streams the answer while the camera stays fixed." },
      { fromMs: 11300, toMs: 15500, text: "Preview holds the finished sentence long enough to read." },
      { fromMs: 15950, toMs: 17550, text: "Answer stays linked." },
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
    replayWindowMs: 19050,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 1000, castFromMs: 0, castToMs: 0 },
      { presentationFromMs: 1000, presentationToMs: 4000, castFromMs: 0, castToMs: 1800 },
      { presentationFromMs: 4000, presentationToMs: 7000, castFromMs: 1800, castToMs: 1800 },
      { presentationFromMs: 7000, presentationToMs: 7900, castFromMs: 1800, castToMs: 3000 },
      { presentationFromMs: 7900, presentationToMs: 10250, castFromMs: 3000, castToMs: 3000 },
      { presentationFromMs: 10250, presentationToMs: 12050, castFromMs: 3000, castToMs: 4800 },
      { presentationFromMs: 12050, presentationToMs: 13350, castFromMs: 4800, castToMs: 4800 },
      { presentationFromMs: 13350, presentationToMs: 16150, castFromMs: 4800, castToMs: 7600 },
      { presentationFromMs: 16150, presentationToMs: 19050, castFromMs: 7600, castToMs: 7600 },
    ],
    steps: [
      { atMs: 1300, label: "Two text inputs", focus: "name", zoom: 2.1 },
      { atMs: 9400, label: "Fill a template", focus: "format", zoom: 2.0 },
      { atMs: 12500, label: "Read the result", focus: "preview", zoom: 1.95 },
    ],
    shots: [
      shot("merge-overview", 0, 1500, overview, { moveMs: 0, maxZoom: 1.05 }),
      shot("both-inputs", 1500, 4000, group("name", "topic"), { actionAtMs: 3500, maxZoom: 1.65 }),
      shot("name-value", 4000, 5500, node("name"), { maxZoom: 2 }),
      shot("topic-value", 5500, 7000, node("topic"), { maxZoom: 2 }),
      shot("both-connections", 7000, 9400, group("name", "topic", "format"), { maxZoom: 1.15 }),
      shot("template-placeholders", 9400, 12500, node("format"), { anchorMs: 10250, maxZoom: 1.8 }),
      shot("merged-result", 12500, 17250, node("preview"), { actionAtMs: 15250, anchorMs: 13350, maxZoom: 2.5, emphasis: "outline" }),
      shot("branch-and-merge", 17250, 19050, overview, { maxZoom: 1.05 }),
    ],
    captions: [
      { fromMs: 1700, toMs: 3900, text: "Sources provide name and topic." },
      { fromMs: 4200, toMs: 5400, text: "First: name." },
      { fromMs: 5700, toMs: 6900, text: "Second: topic." },
      { fromMs: 7200, toMs: 9200, text: "Both connections enter Prompt." },
      { fromMs: 9600, toMs: 11600, text: "The template places both values." },
      { fromMs: 12000, toMs: 17000, text: "Preview shows both substitutions." },
      { fromMs: 17450, toMs: 18850, text: "Two branches merge." },
    ],
    outroTitle: "Branch and merge",
    outroPoints: [
      "Feed many inputs into one node",
      "Use {{ placeholders }} to compose text",
      "Build prompts from reusable parts",
    ],
  }),

  entry("summarize-text", 30, {
    castId: "summarize-text",
    title: "Summarize a document",
    subtitle: "Long text in, key points out",
    replayWindowMs: 19000,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 1000, castFromMs: 0, castToMs: 0 },
      { presentationFromMs: 1000, presentationToMs: 4300, castFromMs: 0, castToMs: 1800 },
      { presentationFromMs: 4300, presentationToMs: 6750, castFromMs: 1800, castToMs: 1800 },
      { presentationFromMs: 6750, presentationToMs: 11000, castFromMs: 1800, castToMs: 10000 },
      { presentationFromMs: 11000, presentationToMs: 11850, castFromMs: 10000, castToMs: 10000 },
      { presentationFromMs: 11850, presentationToMs: 14350, castFromMs: 10000, castToMs: 12500 },
      { presentationFromMs: 14350, presentationToMs: 19000, castFromMs: 12500, castToMs: 12500 },
    ],
    steps: [
      { atMs: 1400, label: "Paste your text", focus: "source", zoom: 2.1 },
      { atMs: 5900, label: "Summarize it", focus: "summary", zoom: 1.9 },
      { atMs: 11000, label: "Read the summary", focus: "preview", zoom: 1.85 },
    ],
    shots: [
      shot("summary-overview", 0, 1500, overview, { moveMs: 0, maxZoom: 1.05 }),
      shot("long-source", 1500, 4300, node("source"), { actionAtMs: 3750, maxZoom: 1.65 }),
      shot("source-to-summary", 4300, 5900, group("source", "summary"), { maxZoom: 1.25 }),
      shot("summary-stream", 5900, 11000, node("summary"), { actionAtMs: 7113, anchorMs: 6550, maxZoom: 1.65 }),
      shot("complete-summary", 11000, 16500, node("preview"), { actionAtMs: 13150, anchorMs: 14350, maxZoom: 2.5, emphasis: "outline" }),
      shot("source-and-summary", 16500, 19000, group("source", "preview"), { maxZoom: 1.15 }),
    ],
    captions: [
      { fromMs: 1700, toMs: 4200, text: "The source is a long passage." },
      { fromMs: 4500, toMs: 5800, text: "It enters Summarizer." },
      { fromMs: 6100, toMs: 10800, text: "Summarizer extracts the key points without moving the camera." },
      { fromMs: 11200, toMs: 16250, text: "Preview holds the shorter summary for the longest reading beat." },
      { fromMs: 16700, toMs: 18800, text: "Compare source and summary." },
    ],
    outroTitle: "Condense anything",
    outroPoints: [
      "Swap in articles, transcripts, or notes",
      "Tune the length with the system prompt",
      "Feed the summary into the next node",
    ],
  }),

  entry("describe-image", 30, {
    castId: "describe-image",
    title: "Describe an image",
    subtitle: "Show the AI a picture, get words back",
    replayWindowMs: 19550,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 1000, castFromMs: 0, castToMs: 0 },
      { presentationFromMs: 1000, presentationToMs: 4500, castFromMs: 0, castToMs: 1800 },
      { presentationFromMs: 4500, presentationToMs: 7050, castFromMs: 1800, castToMs: 1800 },
      { presentationFromMs: 7050, presentationToMs: 11900, castFromMs: 1800, castToMs: 10400 },
      { presentationFromMs: 11900, presentationToMs: 12750, castFromMs: 10400, castToMs: 10400 },
      { presentationFromMs: 12750, presentationToMs: 14950, castFromMs: 10400, castToMs: 12600 },
      { presentationFromMs: 14950, presentationToMs: 19550, castFromMs: 12600, castToMs: 12600 },
    ],
    steps: [
      { atMs: 1400, label: "Add an image", focus: "image", zoom: 1.9 },
      { atMs: 6200, label: "Ask the AI to look", focus: "describe", zoom: 1.9 },
      { atMs: 11900, label: "Read the description", focus: "preview", zoom: 1.85 },
    ],
    shots: [
      shot("image-overview", 0, 1500, overview, { moveMs: 0, maxZoom: 1.05 }),
      shot("source-image", 1500, 4500, node("image"), { actionAtMs: 3917, maxZoom: 1.55 }),
      shot("image-connection", 4500, 6200, group("image", "describe"), { maxZoom: 1.25 }),
      shot("description-stream", 6200, 11900, node("describe"), { actionAtMs: 7501, anchorMs: 6850, maxZoom: 1.65 }),
      shot("completed-description", 11900, 17050, node("preview"), { actionAtMs: 14050, anchorMs: 14950, maxZoom: 2.5, emphasis: "outline" }),
      shot("image-and-description", 17050, 19550, group("image", "preview"), { maxZoom: 1.1 }),
    ],
    captions: [
      { fromMs: 1700, toMs: 4300, text: "The source image stays fully visible." },
      { fromMs: 4700, toMs: 6000, text: "Image enters Agent." },
      { fromMs: 6400, toMs: 11700, text: "Agent describes what it sees while the text arrives." },
      { fromMs: 12100, toMs: 16800, text: "Preview holds the completed description." },
      { fromMs: 17250, toMs: 19350, text: "Compare the image and description." },
    ],
    outroTitle: "Let the AI see",
    outroPoints: [
      "Feed in photos, screenshots, or diagrams",
      "Ask for captions, alt text, or tags",
      "Chain the description into any text node",
    ],
  }),
];

/** Total frames for an entry: intro + replay window + outro. */
export function tutorialFrames(e: TutorialEntry): number {
  return framesForTiming(e.fps, e.props);
}
