/**
 * "Correct the assistant without starting over" tutorial cast.
 *
 * The Sketch Assistant lands a warm wash that is too strong, and the user says
 * so. The second turn calls `ui_sketch_set_layer_props` on the *same* layer —
 * the layer stack never grows, nothing is regenerated, and the answer points
 * at the panel slider the user can finish by hand.
 *
 * Backend-free: the wash is an inline SVG data URI, so replay paints no stroke
 * and spends no credit.
 */
import { PROVIDER_IDS } from "../../stores/ApiTypes";
import { EXAMPLE_IMAGE_DATA_URI } from "../assets/exampleImage";
import {
  assistantStart,
  assistantStream,
  status,
  toolResult,
  toolRunning,
  userMessage
} from "../chat/chatCastHelpers";
import {
  patch,
  sketchCastDoc,
  sketchDocument,
  sketchLayer
} from "./docCastHelpers";
import { DOC_CAST_VERSION, type SketchDocCast } from "./docCastTypes";

const WIDTH = 1024;
const HEIGHT = 1024;

const FIRST_TURN = "sketch-correction-1";
const SECOND_TURN = "sketch-correction-2";
const ADD_CALL = "sketch-correction-add-layer";
const SET_CALL = "sketch-correction-set-props";
const FIX_CALL = "sketch-correction-fix-props";

/** A sunset gradient, as an inline SVG — no bytes to fetch. */
const WARM_WASH = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
    '<defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#ff9d4d"/>' +
    '<stop offset="60%" stop-color="#ff5f6d"/>' +
    '<stop offset="100%" stop-color="#7a2ff2"/>' +
    "</linearGradient></defs>" +
    '<rect width="100%" height="100%" fill="url(#w)"/></svg>'
)}`;

const base = sketchLayer("layer-base", "Base art", {
  data: EXAMPLE_IMAGE_DATA_URI,
  contentBounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
});

const wash = sketchLayer("layer-warm-wash", "Warm wash", {
  data: WARM_WASH,
  blendMode: "screen",
  contentBounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
});

/** One frame of the stack: the wash at a given strength, above the art. */
const stackAt = (opacity: number, blendMode: "normal" | "screen") =>
  sketchDocument(
    WIDTH,
    HEIGHT,
    [base, { ...wash, opacity, blendMode }],
    wash.id
  );

const chrome = {
  activeTool: "select" as const,
  zoom: 1,
  foregroundColor: "#f2b28c",
  selectedLayerIds: [wash.id]
};

const FIRST_ANSWER = [
  "Added a Warm wash layer on screen ",
  "at 85% — the sunset sits over ",
  "the whole frame."
];

const SECOND_ANSWER = [
  "Down to 40%, same layer — ",
  "nothing else moved and nothing ",
  "was regenerated. The opacity slider ",
  "in the panel is yours from here."
];

export const sketchCorrectionCast: SketchDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "sketch",
  id: "sketch-correction",
  name: "Correct the assistant without starting over",
  description:
    "The wash comes back too strong. Saying so amends the layer that is already there instead of rebuilding it.",
  createdAt: new Date(0).toISOString(),
  durationMs: 21000,
  fps: 30,
  docId: "demo-sketch-correction",
  assistantTitle: "Sketch Assistant",
  assistantModel: {
    type: "language_model",
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: PROVIDER_IDS.ANTHROPIC
  },

  doc: sketchCastDoc(sketchDocument(WIDTH, HEIGHT, [base], base.id), {
    activeTool: "select",
    zoom: 1,
    foregroundColor: "#f2b28c",
    selectedLayerIds: [base.id]
  }),

  events: [
    // The layer arrives at full strength on normal blend…
    patch(4800, { document: stackAt(1, "normal"), editor: chrome }),
    // …then the assistant's own set_props lands it at 85% on screen.
    patch(6600, { document: stackAt(0.85, "screen") }),
    // The correction: the same layer, half the strength. The stack stays at two.
    patch(14200, { document: stackAt(0.4, "screen") })
  ],

  assistant: [
    status(0, "connected"),
    userMessage(400, "Give it a warm sunset wash over the whole frame."),
    status(900, "streaming"),

    assistantStart(1600, FIRST_TURN, [
      {
        id: ADD_CALL,
        name: "ui_sketch_add_layer",
        args: { name: "Warm wash", above: "Base art" }
      }
    ]),
    toolRunning(1800, ADD_CALL, "Adding a layer…"),
    toolRunning(4600, null),
    toolResult(4800, FIRST_TURN, [
      {
        id: ADD_CALL,
        name: "ui_sketch_add_layer",
        args: { name: "Warm wash", above: "Base art" },
        result: { layerId: "layer-warm-wash" }
      },
      {
        id: SET_CALL,
        name: "ui_sketch_set_layer_props",
        args: { target: "Warm wash", opacity: 0.85, blendMode: "screen" }
      }
    ]),
    toolRunning(5200, SET_CALL, "Setting blend mode…"),
    toolRunning(6400, null),
    toolResult(6600, FIRST_TURN, [
      {
        id: ADD_CALL,
        name: "ui_sketch_add_layer",
        args: { name: "Warm wash", above: "Base art" },
        result: { layerId: "layer-warm-wash" }
      },
      {
        id: SET_CALL,
        name: "ui_sketch_set_layer_props",
        args: { target: "Warm wash", opacity: 0.85, blendMode: "screen" },
        result: { ok: true }
      }
    ]),
    ...assistantStream(FIRST_TURN, FIRST_ANSWER, 7000, 2200),
    status(9400, "connected"),

    // The correction turn. No new document, no new layer — just a smaller number.
    userMessage(10400, "Too strong — it's washing out the faces. Take it to half."),
    status(10900, "streaming"),
    assistantStart(11600, SECOND_TURN, [
      {
        id: FIX_CALL,
        name: "ui_sketch_set_layer_props",
        args: { target: "Warm wash", opacity: 0.4 }
      }
    ]),
    toolRunning(11900, FIX_CALL, "Adjusting opacity…"),
    toolRunning(14000, null),
    toolResult(14200, SECOND_TURN, [
      {
        id: FIX_CALL,
        name: "ui_sketch_set_layer_props",
        args: { target: "Warm wash", opacity: 0.4 },
        result: { ok: true }
      }
    ]),
    ...assistantStream(SECOND_TURN, SECOND_ANSWER, 14800, 4200),
    status(19400, "connected")
  ]
};
