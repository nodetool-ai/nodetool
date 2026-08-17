/**
 * Document-editor tutorial videos rendered by the Remotion harness — one per
 * document type, each showing that surface's assistant doing the work.
 * Sibling to `tutorials.ts` (graph), `chatTutorials.ts` and
 * `timelineTutorials.ts`: same three-beat shell, a different replay surface
 * (`DocTutorial` / `DocDemoPlayer`).
 */
import type { DocTutorialProps } from "./DocTutorial";
import { framesForTiming } from "./tutorialTiming";

const INTRO_SECONDS = 2.5;
const OUTRO_SECONDS = 4;

export interface DocTutorialEntry {
  /** Remotion composition id, e.g. "DocTutorial-sketch-assistant". */
  compositionId: string;
  /** Output basename: ../web/public/tutorials/<slug>.mp4. */
  slug: string;
  fps: number;
  props: DocTutorialProps;
}

const entry = (
  slug: string,
  fps: number,
  props: Omit<DocTutorialProps, "introSeconds" | "outroSeconds">
): DocTutorialEntry => ({
  compositionId: `DocTutorial-${slug}`,
  slug,
  fps,
  props: { ...props, introSeconds: INTRO_SECONDS, outroSeconds: OUTRO_SECONDS },
});

export const DOC_TUTORIALS: DocTutorialEntry[] = [
  entry("sketch-assistant", 30, {
    castId: "sketch-assistant",
    title: "Edit a sketch by asking",
    subtitle: "Sketch editor · the assistant paints the layer",
    replayWindowMs: 15000,
    steps: [
      { atMs: 500, label: "Ask for a vignette" },
      { atMs: 5200, label: "The layer lands" },
      { atMs: 9400, label: "Blend mode and opacity" },
    ],
    captions: [
      { fromMs: 600, toMs: 4800, text: "Say what you want changed — the assistant reads the layer stack you have." },
      { fromMs: 5400, toMs: 9000, text: "It adds the layer itself: same tools you'd reach for, driven by the chat." },
      { fromMs: 9600, toMs: 14600, text: "Then it dials in blend mode and opacity, and the canvas settles." },
    ],
    outroTitle: "Your canvas, your words",
    outroPoints: [
      "Every layer stays yours to edit by hand",
      "The assistant works the real tools",
      "Undo reaches its edits like any other",
    ],
  }),

  entry("script-assistant", 30, {
    castId: "script-assistant",
    title: "Write and voice a script",
    subtitle: "Script editor · cast, lines, takes",
    replayWindowMs: 18000,
    steps: [
      { atMs: 500, label: "Ask for a two-hander" },
      { atMs: 3800, label: "Cast the speakers" },
      { atMs: 7200, label: "Lines, then voices" },
    ],
    captions: [
      { fromMs: 600, toMs: 3600, text: "Ask for the script you want — length, voices, tone." },
      { fromMs: 4000, toMs: 7000, text: "Speakers are cast first: every line belongs to one of them." },
      { fromMs: 7400, toMs: 17600, text: "The lines arrive as drafts, then each one is voiced into a take." },
    ],
    outroTitle: "From blank page to voiced",
    outroPoints: [
      "Lines stay editable — retype any of them",
      "Every take is kept, so you can pick another",
      "Send the finished script straight to a timeline",
    ],
  }),

  entry("storyboard-assistant", 30, {
    castId: "storyboard-assistant",
    title: "Board a shot list",
    subtitle: "Storyboard · direction, then stills",
    replayWindowMs: 20000,
    steps: [
      { atMs: 500, label: "Ask for a teaser" },
      { atMs: 4600, label: "The shot list" },
      { atMs: 9000, label: "Stills, shot by shot" },
    ],
    captions: [
      { fromMs: 600, toMs: 4400, text: "Describe the piece — the assistant writes the shots, camera and all." },
      { fromMs: 4800, toMs: 8800, text: "The board fills with planned shots before a single frame is spent." },
      { fromMs: 9200, toMs: 19600, text: "Then each still renders in turn, and the cards flip to ready." },
    ],
    outroTitle: "Direct, then render",
    outroPoints: [
      "Revise any shot before it costs a frame",
      "Stills first, clips only when you approve",
      "Assemble the board into a timeline in one call",
    ],
  }),

  entry("jsscript-assistant", 30, {
    castId: "jsscript-assistant",
    title: "Write a JS script",
    subtitle: "JS scripts · ports, body, saved test",
    replayWindowMs: 19000,
    steps: [
      { atMs: 500, label: "Describe the script" },
      { atMs: 4200, label: "Declare the ports" },
      { atMs: 9000, label: "Body, then the test" },
    ],
    captions: [
      { fromMs: 600, toMs: 4000, text: "Say what goes in and what should come out." },
      { fromMs: 4400, toMs: 8800, text: "Ports are declared first — they are the script's contract." },
      { fromMs: 9200, toMs: 18600, text: "The body lands in the editor, and a saved case grades it in the sandbox." },
    ],
    outroTitle: "Code you can trust",
    outroPoints: [
      "Runs sandboxed — no filesystem, no surprises",
      "Saved cases catch the next edit that breaks it",
      "Call it from a workflow or another script",
    ],
  }),

  entry("app-assistant", 30, {
    castId: "app-assistant",
    title: "Build a mini app",
    subtitle: "App builder · operation, setting, widgets",
    replayWindowMs: 19000,
    steps: [
      { atMs: 500, label: "Describe the app" },
      { atMs: 4400, label: "Bind the workflow" },
      { atMs: 8600, label: "Place the widgets" },
    ],
    captions: [
      { fromMs: 600, toMs: 4200, text: "Describe the app in a sentence: an input, a button, an answer." },
      { fromMs: 4600, toMs: 8400, text: "The workflow is bound as an operation, and the topic becomes a saved setting." },
      { fromMs: 8800, toMs: 18600, text: "Widgets are placed one at a time, each bound to something the app declares." },
    ],
    outroTitle: "A workflow anyone can run",
    outroPoints: [
      "No canvas needed to use it",
      "Settings persist between sessions",
      "Publish a release and share the link",
    ],
  }),
];

/** Total frames for a document tutorial entry: intro + replay window + outro. */
export function docTutorialFrames(e: DocTutorialEntry): number {
  return framesForTiming(e.fps, e.props);
}
