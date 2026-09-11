/**
 * Document-editor tutorial videos rendered by the Remotion harness — one per
 * document type, each showing that surface's assistant doing the work.
 * Sibling to `tutorials.ts` (graph), `chatTutorials.ts` and
 * `timelineTutorials.ts`: same three-beat shell, a different replay surface
 * (`DocTutorial` / `DocDemoPlayer`).
 */
import type { DocTutorialProps } from "./DocTutorial";
import { framesForTiming } from "./tutorialTiming";

const INTRO_SECONDS = 1.5;
const OUTRO_SECONDS = 2;

export interface DocTutorialEntry {
  /** Remotion composition id, e.g. "DocTutorial-sketch-assistant". */
  compositionId: string;
  /** Output basename under docs/assets/tutorials/. */
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
  props: { ...props, introSeconds: INTRO_SECONDS, outroSeconds: OUTRO_SECONDS }
});

export const DOC_TUTORIALS: DocTutorialEntry[] = [
  entry("sketch-assistant", 30, {
    castId: "sketch-assistant",
    title: "Edit a sketch by asking",
    subtitle: "Sketch editor · the assistant paints the layer",
    replayWindowMs: 15000,
    timeMap: [
      {
        presentationFromMs: 0,
        presentationToMs: 15000,
        castFromMs: 0,
        castToMs: 15000
      }
    ],
    shots: [
      {
        id: "sketch-establish",
        fromMs: 0,
        toMs: 1400,
        target: { kind: "overview" },
        moveMs: 0
      },
      {
        id: "vignette-request",
        fromMs: 1400,
        toMs: 3600,
        target: { kind: "component", focusId: "message-demo-user-400" },
        moveMs: 600,
        anchorMs: 2200,
        emphasis: "outline-dim"
      },
      {
        id: "add-layer-tool",
        fromMs: 3600,
        toMs: 4400,
        target: {
          kind: "component",
          focusId: "tool-call-sketch-call-add-layer"
        },
        moveMs: 550,
        anchorMs: 4200,
        emphasis: "outline"
      },
      {
        id: "new-layer",
        fromMs: 4400,
        toMs: 7600,
        target: { kind: "component", focusId: "sketch-layer-layer-vignette" },
        moveMs: 600,
        actionAtMs: 5200,
        anchorMs: 6000,
        emphasis: "outline-dim"
      },
      {
        id: "blend-opacity",
        fromMs: 7600,
        toMs: 11200,
        target: {
          kind: "group",
          targets: [
            { kind: "component", focusId: "sketch-layer-blend-mode" },
            { kind: "component", focusId: "sketch-layer-opacity" }
          ]
        },
        moveMs: 600,
        actionAtMs: 9400,
        anchorMs: 10000,
        emphasis: "outline-dim"
      },
      {
        id: "sketch-result",
        fromMs: 11200,
        toMs: 15000,
        target: { kind: "component", focusId: "sketch-canvas" },
        moveMs: 600,
        anchorMs: 14000
      }
    ],
    steps: [
      { atMs: 500, label: "Ask for a vignette" },
      { atMs: 5200, label: "The layer lands" },
      { atMs: 9400, label: "Blend mode and opacity" }
    ],
    captions: [
      {
        fromMs: 600,
        toMs: 4800,
        text: "Ask for a soft vignette on the existing sketch."
      },
      {
        fromMs: 5400,
        toMs: 9000,
        text: "The new layer appears selected in the layer panel."
      },
      {
        fromMs: 9600,
        toMs: 14600,
        text: "Then it dials in blend mode and opacity, and the canvas settles."
      }
    ],
    outroTitle: "Your canvas, your words",
    outroPoints: [
      "Every layer stays yours to edit by hand",
      "The assistant works the real tools",
      "Undo reaches its edits like any other"
    ]
  }),

  entry("script-assistant", 30, {
    castId: "script-assistant",
    title: "Write and voice a script",
    subtitle: "Script editor · cast, lines, takes",
    replayWindowMs: 18000,
    timeMap: [
      {
        presentationFromMs: 0,
        presentationToMs: 18000,
        castFromMs: 0,
        castToMs: 18000
      }
    ],
    shots: [
      {
        id: "script-establish",
        fromMs: 0,
        toMs: 1400,
        target: { kind: "overview" },
        moveMs: 0
      },
      {
        id: "script-request",
        fromMs: 1400,
        toMs: 3000,
        target: { kind: "component", focusId: "message-demo-user-400" },
        moveMs: 600,
        anchorMs: 2500,
        emphasis: "outline-dim"
      },
      {
        id: "speaker-cast",
        fromMs: 3000,
        toMs: 6400,
        target: { kind: "component", focusId: "script-cast" },
        moveMs: 600,
        actionAtMs: 3800,
        anchorMs: 5000
      },
      {
        id: "script-lines",
        fromMs: 6400,
        toMs: 11200,
        target: { kind: "component", focusId: "script-lines" },
        moveMs: 600,
        actionAtMs: 7200,
        anchorMs: 9000,
        emphasis: "outline"
      },
      {
        id: "voiced-take",
        fromMs: 11200,
        toMs: 14800,
        target: {
          kind: "group",
          targets: [
            { kind: "component", focusId: "tool-call-script-call-voice-all" },
            { kind: "component", focusId: "script-line-line-1" }
          ]
        },
        moveMs: 600,
        actionAtMs: 13200,
        anchorMs: 13800
      },
      {
        id: "populated-script",
        fromMs: 14800,
        toMs: 18000,
        target: { kind: "component", focusId: "script-lines" },
        moveMs: 600,
        anchorMs: 17000
      }
    ],
    steps: [
      { atMs: 500, label: "Ask for a two-hander" },
      { atMs: 3800, label: "Cast the speakers" },
      { atMs: 7200, label: "Lines, then voices" }
    ],
    captions: [
      {
        fromMs: 600,
        toMs: 3600,
        text: "Request the length, speakers, and tone."
      },
      { fromMs: 4000, toMs: 7000, text: "Two speakers join the cast with named voices." },
      {
        fromMs: 7400,
        toMs: 17600,
        text: "The lines arrive as drafts, then each one is voiced into a take."
      }
    ],
    outroTitle: "From blank page to voiced",
    outroPoints: [
      "Lines stay editable — retype any of them",
      "Every take is kept, so you can pick another",
      "Send the finished script straight to a timeline"
    ]
  }),

  entry("storyboard-assistant", 30, {
    castId: "storyboard-assistant",
    title: "Board a shot list",
    subtitle: "Storyboard · direction, then stills",
    replayWindowMs: 30000,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 4800, castFromMs: 0, castToMs: 4800 },
      { presentationFromMs: 4800, presentationToMs: 10400, castFromMs: 4800, castToMs: 5000 },
      { presentationFromMs: 10400, presentationToMs: 11400, castFromMs: 5000, castToMs: 5000 },
      { presentationFromMs: 11400, presentationToMs: 13600, castFromMs: 5000, castToMs: 8000 },
      { presentationFromMs: 13600, presentationToMs: 19000, castFromMs: 8000, castToMs: 10000 },
      { presentationFromMs: 19000, presentationToMs: 19800, castFromMs: 10000, castToMs: 10000 },
      { presentationFromMs: 19800, presentationToMs: 28000, castFromMs: 10000, castToMs: 24000 },
      { presentationFromMs: 28000, presentationToMs: 30000, castFromMs: 24000, castToMs: 24000 },
    ],
    shots: [
      { id: "storyboard-establish", fromMs: 0, toMs: 1400, target: { kind: "overview" }, moveMs: 0 },
      { id: "teaser-brief", fromMs: 1400, toMs: 3800, target: { kind: "component", focusId: "message-demo-user-400" }, moveMs: 600, anchorMs: 2600, emphasis: "outline-dim" },
      { id: "planned-board", fromMs: 3800, toMs: 7200, target: { kind: "component", focusId: "storyboard-board" }, moveMs: 600, actionAtMs: 4600, anchorMs: 6000, emphasis: "outline" },
      { id: "shot-direction", fromMs: 7200, toMs: 10400, target: { kind: "component", focusId: "storyboard-shot-direction" }, moveMs: 500, anchorMs: 8000, maxZoom: 1.45, emphasis: "outline-dim" },
      { id: "generation-tool", fromMs: 10400, toMs: 13600, target: { kind: "component", focusId: "tool-call-storyboard-call-keyframes" }, moveMs: 600, actionAtMs: 11547, anchorMs: 12000, emphasis: "outline" },
      { id: "completed-still", fromMs: 13600, toMs: 19000, target: { kind: "component", focusId: "storyboard-shot-shot-1" }, moveMs: 600, actionAtMs: 15220, anchorMs: 18000, emphasis: "outline-dim" },
      { id: "finished-board", fromMs: 19000, toMs: 30000, target: { kind: "component", focusId: "storyboard-board" }, moveMs: 600, actionAtMs: 25423, anchorMs: 29000 },
    ],
    steps: [
      { atMs: 500, label: "Ask for a teaser" },
      { atMs: 4600, label: "The shot list" },
      { atMs: 10400, label: "Stills, shot by shot" },
    ],
    captions: [
      { fromMs: 600, toMs: 4400, text: "The brief defines the shots and camera direction." },
      { fromMs: 4800, toMs: 7200, text: "The planned shots arrive." },
      { fromMs: 7400, toMs: 10200, text: "Read the description and camera movement." },
      { fromMs: 10600, toMs: 13600, text: "The assistant renders the planned shots." },
      { fromMs: 14000, toMs: 18600, text: "The first planned card becomes a completed still." },
      { fromMs: 19800, toMs: 29600, text: "The remaining cards finish in place, leaving a complete board." },
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
    replayWindowMs: 26000,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 10200, castFromMs: 0, castToMs: 10200 },
      { presentationFromMs: 10200, presentationToMs: 14200, castFromMs: 10200, castToMs: 10200 },
      { presentationFromMs: 14200, presentationToMs: 18500, castFromMs: 10200, castToMs: 14500 },
      { presentationFromMs: 18500, presentationToMs: 21500, castFromMs: 14500, castToMs: 14500 },
      { presentationFromMs: 21500, presentationToMs: 26000, castFromMs: 14500, castToMs: 19000 },
    ],
    shots: [
      {
        id: "jsscript-establish",
        fromMs: 0,
        toMs: 1400,
        target: { kind: "overview" },
        moveMs: 0
      },
      {
        id: "jsscript-request",
        fromMs: 1400,
        toMs: 3400,
        target: { kind: "component", focusId: "message-demo-user-400" },
        moveMs: 600,
        anchorMs: 2600,
        emphasis: "outline-dim"
      },
      {
        id: "ports",
        fromMs: 3400,
        toMs: 7600,
        target: { kind: "component", focusId: "jsscript-ports" },
        moveMs: 600,
        actionAtMs: 4200,
        anchorMs: 6000,
        emphasis: "outline-dim"
      },
      {
        id: "code-body",
        fromMs: 7600,
        toMs: 15200,
        target: { kind: "component", focusId: "jsscript-code-content" },
        moveMs: 600,
        actionAtMs: 9000,
        anchorMs: 9800,
        emphasis: "outline"
      },
      {
        id: "saved-test",
        fromMs: 15200,
        toMs: 22400,
        target: { kind: "component", focusId: "jsscript-tests" },
        moveMs: 600,
        actionAtMs: 17600,
        anchorMs: 21500,
        emphasis: "outline-dim"
      },
      {
        id: "verified-script",
        fromMs: 22400,
        toMs: 26000,
        target: {
          kind: "group",
          targets: [
            { kind: "component", focusId: "jsscript-code-content" },
            { kind: "component", focusId: "jsscript-tests" }
          ]
        },
        moveMs: 600,
        anchorMs: 24500
      }
    ],
    steps: [
      { atMs: 500, label: "Describe the script" },
      { atMs: 4200, label: "Declare the ports" },
      { atMs: 9000, label: "Body, then the test" }
    ],
    captions: [
      {
        fromMs: 600,
        toMs: 4000,
        text: "Say what goes in and what should come out."
      },
      {
        fromMs: 4400,
        toMs: 8800,
        text: "Ports are declared first — they are the script's contract."
      },
      {
        fromMs: 9200,
        toMs: 25600,
        text: "The body lands in the editor, and a saved case grades it in the sandbox."
      }
    ],
    outroTitle: "Code you can trust",
    outroPoints: [
      "Runs sandboxed — no filesystem, no surprises",
      "Saved cases catch the next edit that breaks it",
      "Call it from a workflow or another script"
    ]
  }),

  entry("app-assistant", 30, {
    castId: "app-assistant",
    title: "Build a mini app",
    subtitle: "App builder · operation, setting, widgets",
    replayWindowMs: 19000,
    timeMap: [
      {
        presentationFromMs: 0,
        presentationToMs: 19000,
        castFromMs: 0,
        castToMs: 19000
      }
    ],
    shots: [
      {
        id: "app-establish",
        fromMs: 0,
        toMs: 1400,
        target: { kind: "overview" },
        moveMs: 0
      },
      {
        id: "app-request",
        fromMs: 1400,
        toMs: 3600,
        target: { kind: "component", focusId: "message-demo-user-400" },
        moveMs: 600,
        anchorMs: 2600,
        emphasis: "outline-dim"
      },
      {
        id: "workflow-binding",
        fromMs: 3600,
        toMs: 7000,
        target: {
          kind: "component",
          focusId: "tool-call-app-call-add-operation"
        },
        moveMs: 600,
        actionAtMs: 4400,
        anchorMs: 5600,
        emphasis: "outline"
      },
      {
        id: "topic-setting",
        fromMs: 7000,
        toMs: 10000,
        target: {
          kind: "group",
          targets: [
            {
              kind: "component",
              focusId: "tool-call-app-call-declare-variable"
            },
            { kind: "component", focusId: "app-widget-in-topic" }
          ]
        },
        moveMs: 600,
        actionAtMs: 8600,
        anchorMs: 9200
      },
      {
        id: "button-output",
        fromMs: 10000,
        toMs: 14600,
        target: {
          kind: "group",
          targets: [
            { kind: "component", focusId: "app-widget-btn-run" },
            { kind: "component", focusId: "app-widget-out-headline" }
          ]
        },
        moveMs: 600,
        actionAtMs: 11400,
        anchorMs: 14200,
        emphasis: "outline-dim"
      },
      {
        id: "assembled-app",
        fromMs: 14600,
        toMs: 19000,
        target: { kind: "component", focusId: "app-runtime" },
        moveMs: 600,
        anchorMs: 17500
      }
    ],
    steps: [
      { atMs: 500, label: "Describe the app" },
      { atMs: 4400, label: "Bind the workflow" },
      { atMs: 8600, label: "Place the widgets" }
    ],
    captions: [
      {
        fromMs: 600,
        toMs: 4200,
        text: "Request an input, a button, and an answer."
      },
      {
        fromMs: 4600,
        toMs: 8400,
        text: "The tool binds the workflow and saves the topic."
      },
      {
        fromMs: 8800,
        toMs: 18600,
        text: "Widgets are placed one at a time, each bound to something the app declares."
      }
    ],
    outroTitle: "A workflow anyone can run",
    outroPoints: [
      "No canvas needed to use it",
      "Settings persist between sessions",
      "Publish a release and share the link"
    ]
  }),

  entry("sketch-correction", 30, {
    castId: "sketch-correction",
    title: "Correct it without starting over",
    subtitle: "Sketch editor · the second ask amends the first",
    replayWindowMs: 21000,
    timeMap: [
      {
        presentationFromMs: 0,
        presentationToMs: 21000,
        castFromMs: 0,
        castToMs: 21000
      }
    ],
    shots: [
      {
        id: "correction-establish",
        fromMs: 0,
        toMs: 1400,
        target: { kind: "overview" },
        moveMs: 0
      },
      {
        id: "first-request",
        fromMs: 1400,
        toMs: 4000,
        target: { kind: "component", focusId: "message-demo-user-400" },
        moveMs: 600,
        anchorMs: 2500,
        emphasis: "outline-dim"
      },
      {
        id: "strong-wash",
        fromMs: 4000,
        toMs: 7600,
        target: { kind: "component", focusId: "sketch-canvas" },
        moveMs: 600,
        actionAtMs: 4800,
        anchorMs: 7000,
        emphasis: "outline"
      },
      {
        id: "correction-message",
        fromMs: 7600,
        toMs: 11600,
        target: { kind: "component", focusId: "message-demo-user-10400" },
        moveMs: 600,
        anchorMs: 11000,
        emphasis: "outline-dim"
      },
      {
        id: "same-layer-fix",
        fromMs: 11600,
        toMs: 15400,
        target: {
          kind: "group",
          targets: [
            { kind: "component", focusId: "sketch-layer-layer-warm-wash" },
            { kind: "component", focusId: "sketch-layer-opacity" }
          ]
        },
        moveMs: 600,
        actionAtMs: 14200,
        anchorMs: 14800,
        emphasis: "outline-dim"
      },
      {
        id: "corrected-canvas",
        fromMs: 15400,
        toMs: 19000,
        target: { kind: "component", focusId: "sketch-canvas" },
        moveMs: 600,
        anchorMs: 18000,
        emphasis: "outline"
      },
      {
        id: "unchanged-stack",
        fromMs: 19000,
        toMs: 21000,
        target: {
          kind: "group",
          targets: [
            { kind: "component", focusId: "sketch-layers" },
            { kind: "component", focusId: "sketch-canvas" }
          ]
        },
        moveMs: 600,
        anchorMs: 20000
      }
    ],
    steps: [
      { atMs: 500, label: "Ask for a warm wash" },
      { atMs: 6800, label: "Too strong" },
      { atMs: 14400, label: "Same layer, half the strength" }
    ],
    captions: [
      {
        fromMs: 600,
        toMs: 4600,
        text: "The first request adds a warm wash layer."
      },
      {
        fromMs: 7200,
        toMs: 10400,
        text: "The correction asks for less opacity."
      },
      {
        fromMs: 11000,
        toMs: 20600,
        text: "The fix lands on the layer already there: two layers before, two after, nothing regenerated."
      }
    ],
    outroTitle: "Correct it, don't restart it",
    outroPoints: [
      "A second ask edits what is already there",
      "The layer stack never grew",
      "Finish it by hand — the panel slider is yours"
    ]
  }),

  entry("storyboard-ask", 30, {
    castId: "storyboard-ask",
    title: "It asks before it spends",
    subtitle: "Storyboard · a question, not a guess",
    replayWindowMs: 19000,
    timeMap: [
      {
        presentationFromMs: 0,
        presentationToMs: 19000,
        castFromMs: 0,
        castToMs: 19000
      }
    ],
    shots: [
      {
        id: "clarification-establish",
        fromMs: 0,
        toMs: 1400,
        target: { kind: "overview" },
        moveMs: 0
      },
      {
        id: "underspecified-request",
        fromMs: 1400,
        toMs: 4000,
        target: { kind: "component", focusId: "message-demo-user-400" },
        moveMs: 600,
        anchorMs: 2600,
        emphasis: "outline-dim"
      },
      {
        id: "clarifying-question",
        fromMs: 4000,
        toMs: 6500,
        target: { kind: "component", focusId: "message-storyboard-ask-1" },
        moveMs: 600,
        anchorMs: 5600,
        emphasis: "outline"
      },
      {
        id: "empty-board-wait",
        fromMs: 6500,
        toMs: 8400,
        target: {
          kind: "group",
          targets: [
            { kind: "component", focusId: "document-surface" },
            { kind: "component", focusId: "assistant-thread" }
          ]
        },
        moveMs: 600,
        anchorMs: 6800
      },
      {
        id: "format-answer",
        fromMs: 8400,
        toMs: 10600,
        target: { kind: "component", focusId: "message-demo-user-7200" },
        moveMs: 600,
        anchorMs: 9000,
        emphasis: "outline-dim"
      },
      {
        id: "planned-shots",
        fromMs: 10600,
        toMs: 15000,
        target: {
          kind: "group",
          targets: [
            {
              kind: "component",
              focusId: "tool-call-storyboard-ask-screenplay"
            },
            { kind: "component", focusId: "document-surface" }
          ]
        },
        moveMs: 600,
        actionAtMs: 12200,
        anchorMs: 13800,
        emphasis: "outline"
      },
      {
        id: "planned-unrendered-board",
        fromMs: 15000,
        toMs: 19000,
        target: { kind: "component", focusId: "document-surface" },
        moveMs: 600,
        anchorMs: 17500
      }
    ],
    steps: [
      { atMs: 500, label: "An under-specified brief" },
      { atMs: 2000, label: "It asks instead of guessing" },
      { atMs: 8400, label: "Your answer shapes the board" }
    ],
    captions: [
      { fromMs: 600, toMs: 2200, text: "The format is missing." },
      {
        fromMs: 2200,
        toMs: 7000,
        text: "The assistant waits while the board stays empty."
      },
      {
        fromMs: 8600,
        toMs: 18600,
        text: "Answer, and the shots land in the format you picked. Planned only: still no frame rendered."
      }
    ],
    outroTitle: "A question beats a guess",
    outroPoints: [
      "Nothing renders while the dock waits on you",
      "Your answer picks the format and the shot count",
      "Shots arrive planned — you approve the spend"
    ]
  }),

  entry("jsscript-repair", 30, {
    castId: "jsscript-repair",
    title: "A test catches it",
    subtitle: "JS scripts · red, then the repair, then green",
    replayWindowMs: 31000,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 9000, castFromMs: 0, castToMs: 9000 },
      { presentationFromMs: 9000, presentationToMs: 10500, castFromMs: 9000, castToMs: 9000 },
      { presentationFromMs: 10500, presentationToMs: 15700, castFromMs: 9000, castToMs: 14200 },
      { presentationFromMs: 15700, presentationToMs: 20700, castFromMs: 14200, castToMs: 14200 },
      { presentationFromMs: 20700, presentationToMs: 23900, castFromMs: 14200, castToMs: 17400 },
      { presentationFromMs: 23900, presentationToMs: 26400, castFromMs: 17400, castToMs: 17400 },
      { presentationFromMs: 26400, presentationToMs: 31000, castFromMs: 17400, castToMs: 22000 },
    ],
    shots: [
      {
        id: "repair-establish",
        fromMs: 0,
        toMs: 1400,
        target: { kind: "overview" },
        moveMs: 0
      },
      {
        id: "suspected-edge-case",
        fromMs: 1400,
        toMs: 4200,
        target: { kind: "component", focusId: "message-demo-user-400" },
        moveMs: 600,
        anchorMs: 2800,
        emphasis: "outline-dim"
      },
      {
        id: "saved-case",
        fromMs: 4200,
        toMs: 6200,
        target: { kind: "component", focusId: "jsscript-tests" },
        moveMs: 600,
        anchorMs: 5600,
        emphasis: "outline"
      },
      {
        id: "failing-result",
        fromMs: 6200,
        toMs: 12700,
        target: { kind: "component", focusId: "jsscript-tests" },
        moveMs: 600,
        actionAtMs: 7000,
        anchorMs: 10500,
        emphasis: "outline-dim"
      },
      {
        id: "repaired-code",
        fromMs: 12700,
        toMs: 20900,
        target: {
          kind: "component",
          focusId: "jsscript-code-content"
        },
        moveMs: 600,
        actionAtMs: 15500,
        anchorMs: 20700,
        emphasis: "outline"
      },
      {
        id: "passing-rerun",
        fromMs: 20900,
        toMs: 27400,
        target: { kind: "component", focusId: "jsscript-tests" },
        moveMs: 600,
        actionAtMs: 23300,
        anchorMs: 26600,
        emphasis: "outline-dim"
      },
      {
        id: "same-cases-green",
        fromMs: 27400,
        toMs: 31000,
        target: {
          kind: "group",
          targets: [
            { kind: "component", focusId: "jsscript-tests" },
            { kind: "component", focusId: "assistant-thread" }
          ]
        },
        moveMs: 600,
        anchorMs: 29500
      }
    ],
    steps: [
      { atMs: 500, label: "Name the case you suspect" },
      { atMs: 4600, label: "It runs red" },
      { atMs: 12700, label: "The fix, then green" }
    ],
    captions: [
      {
        fromMs: 600,
        toMs: 4200,
        text: "The suspected edge case is saved before repair."
      },
      {
        fromMs: 4800,
        toMs: 12300,
        text: "The run fails in the open, with the reason: one bad cell turned the sum into NaN."
      },
      {
        fromMs: 12900,
        toMs: 30600,
        text: "One call repairs the body, the same cases run again, and both come back green."
      }
    ],
    outroTitle: "A check you watched fail",
    outroPoints: [
      "The failing run is the evidence, not the claim",
      "The case stays saved for the next edit",
      "Every call it made stays on screen"
    ]
  })
];

/** Total frames for a document tutorial entry: intro + replay window + outro. */
export function docTutorialFrames(e: DocTutorialEntry): number {
  return framesForTiming(e.fps, e.props);
}
