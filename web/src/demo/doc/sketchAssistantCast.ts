/**
 * "Edit a sketch with the assistant" tutorial cast.
 *
 * The Sketch Assistant is asked for a vignette and a warmer look; it calls
 * `ui_sketch_add_layer` and `ui_sketch_set_layer_props`, and the layer stack
 * changes in the real editor — toolbar, layers panel, status bar — as the
 * calls land. The panel's row for the new layer is selected while the
 * assistant works on it, the way it would be if you had added it yourself.
 *
 * Backend-free: the generated art is an inline SVG data URI, so replay never
 * paints a stroke or spends a credit.
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

const ASSISTANT_ID = "sketch-assistant-1";
const ADD_CALL = "sketch-call-add-layer";
const PROPS_CALL = "sketch-call-set-props";

/** A radial darkening, as an inline SVG — a vignette with no bytes to fetch. */
const VIGNETTE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
    '<defs><radialGradient id="v" cx="50%" cy="50%" r="70%">' +
    '<stop offset="55%" stop-color="#000" stop-opacity="0"/>' +
    '<stop offset="100%" stop-color="#000" stop-opacity="0.85"/>' +
    "</radialGradient></defs>" +
    '<rect width="100%" height="100%" fill="url(#v)"/></svg>'
)}`;

const base = sketchLayer("layer-base", "Base art", {
  data: EXAMPLE_IMAGE_DATA_URI,
  contentBounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
});

const vignette = sketchLayer("layer-vignette", "Vignette", {
  data: VIGNETTE,
  opacity: 1,
  blendMode: "multiply",
  contentBounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
});

const ANSWER = [
  "Added a Vignette layer above the art ",
  "and set it to multiply at 70% ",
  "so the edges fall off without ",
  "muddying the centre."
];

export const sketchAssistantCast: SketchDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "sketch",
  id: "sketch-assistant",
  name: "Edit a sketch with the assistant",
  description:
    "Ask the Sketch Assistant for a vignette: it adds the layer and dials in blend mode and opacity.",
  createdAt: new Date(0).toISOString(),
  durationMs: 16000,
  fps: 30,
  docId: "demo-sketch-1",
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
    // The assistant's add_layer call lands: a new layer on top, still at full
    // strength and normal blend — deliberately wrong, so the fix reads.
    patch(5200, {
      document: sketchDocument(
        WIDTH,
        HEIGHT,
        [base, { ...vignette, opacity: 1, blendMode: "normal" }],
        vignette.id
      ),
      editor: {
        activeTool: "select",
        zoom: 1,
        foregroundColor: "#f2b28c",
        selectedLayerIds: [vignette.id]
      }
    }),
    // set_layer_props dials it in: the panel's opacity and blend controls for
    // the selected row are what changes.
    patch(9400, {
      document: sketchDocument(
        WIDTH,
        HEIGHT,
        [base, { ...vignette, opacity: 0.7, blendMode: "multiply" }],
        vignette.id
      )
    })
  ],

  assistant: [
    status(0, "connected"),
    userMessage(400, "Darken the edges a bit — a soft vignette, nothing heavy."),
    status(900, "streaming"),

    assistantStart(1600, ASSISTANT_ID, [
      {
        id: ADD_CALL,
        name: "ui_sketch_add_layer",
        args: { name: "Vignette", above: "Base art" }
      }
    ]),
    toolRunning(1800, ADD_CALL, "Adding a layer…"),
    toolRunning(5000, null),
    toolResult(5200, ASSISTANT_ID, [
      {
        id: ADD_CALL,
        name: "ui_sketch_add_layer",
        args: { name: "Vignette", above: "Base art" },
        result: { layerId: "layer-vignette" }
      },
      {
        id: PROPS_CALL,
        name: "ui_sketch_set_layer_props",
        args: { target: "Vignette", opacity: 0.7, blendMode: "multiply" }
      }
    ]),
    toolRunning(5600, PROPS_CALL, "Setting blend mode…"),
    toolRunning(9200, null),
    toolResult(9400, ASSISTANT_ID, [
      {
        id: ADD_CALL,
        name: "ui_sketch_add_layer",
        args: { name: "Vignette", above: "Base art" },
        result: { layerId: "layer-vignette" }
      },
      {
        id: PROPS_CALL,
        name: "ui_sketch_set_layer_props",
        args: { target: "Vignette", opacity: 0.7, blendMode: "multiply" },
        result: { ok: true }
      }
    ]),

    ...assistantStream(ASSISTANT_ID, ANSWER, 10000, 3800),
    status(14200, "connected")
  ]
};
