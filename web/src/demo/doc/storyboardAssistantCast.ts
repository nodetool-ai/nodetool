/**
 * "Direct a storyboard with the assistant" tutorial cast.
 *
 * The Storyboard Assistant is asked for a three-shot teaser: it writes the
 * screenplay (`ui_storyboard_set_screenplay`), then renders the keyframes
 * (`ui_storyboard_generate_keyframe`) shot by shot, so the board fills in one
 * card at a time in the real `StoryboardBoard`.
 *
 * Backend-free: every still is an inline SVG data URI, so replay renders no
 * frames and spends no credits.
 */
import type { Screenplay, Shot } from "@nodetool-ai/protocol";

import { PROVIDER_IDS } from "../../stores/ApiTypes";
import {
  assistantStart,
  assistantStream,
  progress,
  status,
  toolResult,
  toolRunning,
  userMessage
} from "../chat/chatCastHelpers";
import { patch, shot } from "./docCastHelpers";
import {
  DOC_CAST_VERSION,
  type StoryboardCastDoc,
  type StoryboardDocCast
} from "./docCastTypes";

const ASSISTANT_ID = "storyboard-assistant-1";
const SCREENPLAY_CALL = "storyboard-call-screenplay";
const KEYFRAME_CALL = "storyboard-call-keyframes";

/** A flat two-tone still, inline — enough to read as a rendered frame. */
const still = (top: string, bottom: string, label: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">' +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${top}"/>` +
      `<stop offset="100%" stop-color="${bottom}"/></linearGradient></defs>` +
      '<rect width="100%" height="100%" fill="url(#g)"/>' +
      `<text x="48" y="492" font-family="sans-serif" font-size="34" fill="#ffffffcc">${label}</text>` +
      "</svg>"
  )}`;

const SHOTS: Shot[] = [
  shot(
    "shot-1",
    0,
    "Lighthouse at dusk",
    "A lighthouse cuts the fog, its beam sweeping a cold sea.",
    { camera: { framing: "wide", movement: "slow push in" }, duration_seconds: 4 }
  ),
  shot("shot-2", 1, "Keeper's hands", "Weathered hands wind the lamp mechanism.", {
    camera: { framing: "close-up" },
    duration_seconds: 3
  }),
  shot("shot-3", 2, "The beam finds a sail", "The beam lands on a small sail far out.", {
    camera: { framing: "wide", movement: "static" },
    duration_seconds: 5
  })
];

const KEYFRAMES = [
  still("#1e3a5f", "#0b1220", "Lighthouse at dusk"),
  still("#4a3418", "#150e05", "Keeper's hands"),
  still("#123", "#04070d", "The beam finds a sail")
];

/** Shots 0..count-1 carrying their rendered still. */
const rendered = (count: number): Shot[] =>
  SHOTS.map((s, i) =>
    i < count
      ? {
          ...s,
          status: "keyframe_ready" as const,
          keyframe: { type: "image", uri: KEYFRAMES[i] },
          keyframe_versions: [{ type: "image", uri: KEYFRAMES[i] }]
        }
      : s
  );

const screenplay: Screenplay = {
  type: "screenplay",
  id: "screenplay-1",
  title: "The Keeper",
  logline: "A lighthouse keeper's last night on the rock.",
  style_bible: "Cold blues, single warm source, 35mm, heavy grain.",
  aspect_ratio: "16:9",
  shots: SHOTS
};

const BOARD: StoryboardCastDoc = {
  screenplay: null,
  shots: [],
  title: "The Keeper",
  brief: "A 12-second teaser for a short film about a lighthouse keeper.",
  style: "",
  entityIds: [],
  aspectRatio: "16:9",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  activeShotId: null,
  timelineId: null
};

const ANSWER = [
  "Three shots, twelve seconds: ",
  "the light, the hands, the sail. ",
  "Stills are in — ",
  "say go and I'll render the clips."
];

export const storyboardAssistantCast: StoryboardDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "storyboard",
  id: "storyboard-assistant",
  name: "Direct a storyboard with the assistant",
  description:
    "Ask the Storyboard Assistant for a teaser: it writes the shot list, then renders a still for every shot.",
  createdAt: new Date(0).toISOString(),
  durationMs: 21000,
  fps: 30,
  docId: "demo-storyboard-1",
  assistantTitle: "Storyboard Assistant",
  assistantModel: {
    type: "language_model",
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: PROVIDER_IDS.ANTHROPIC
  },

  doc: BOARD,

  events: [
    // set_screenplay: the board gets its shot list, nothing rendered yet.
    patch(4600, {
      screenplay,
      shots: SHOTS,
      style: screenplay.style_bible ?? "",
      activeShotId: "shot-1"
    }),
    // Then one still at a time, each card flipping to keyframe_ready.
    patch(9000, { shots: rendered(1), activeShotId: "shot-1" }),
    patch(12200, { shots: rendered(2), activeShotId: "shot-2" }),
    patch(15400, { shots: rendered(3), activeShotId: "shot-3" })
  ],

  assistant: [
    status(0, "connected"),
    userMessage(
      400,
      "Board a 12-second teaser: a lighthouse keeper's last night. Then render the stills."
    ),
    status(900, "streaming"),

    assistantStart(1600, ASSISTANT_ID, [
      {
        id: SCREENPLAY_CALL,
        name: "ui_storyboard_set_screenplay",
        args: { shotCount: 3, aspectRatio: "16:9" }
      }
    ]),
    toolRunning(1800, SCREENPLAY_CALL, "Writing the shot list…"),
    toolRunning(4400, null),
    toolResult(4600, ASSISTANT_ID, [
      {
        id: SCREENPLAY_CALL,
        name: "ui_storyboard_set_screenplay",
        args: { shotCount: 3, aspectRatio: "16:9" },
        result: { shotIds: SHOTS.map((s) => s.id) }
      },
      {
        id: KEYFRAME_CALL,
        name: "ui_storyboard_generate_keyframe",
        args: { shots: "all" }
      }
    ]),
    toolRunning(5200, KEYFRAME_CALL, "Rendering stills…"),
    progress(5200, 0, 3, "Rendering stills…"),
    progress(9000, 1, 3, "Rendering stills…"),
    progress(12200, 2, 3, "Rendering stills…"),
    progress(15400, 3, 3, "Rendering stills…"),
    toolRunning(15400, null),
    progress(15600, 0, 0, null),
    toolResult(15600, ASSISTANT_ID, [
      {
        id: SCREENPLAY_CALL,
        name: "ui_storyboard_set_screenplay",
        args: { shotCount: 3, aspectRatio: "16:9" },
        result: { shotIds: SHOTS.map((s) => s.id) }
      },
      {
        id: KEYFRAME_CALL,
        name: "ui_storyboard_generate_keyframe",
        args: { shots: "all" },
        result: { rendered: 3, failed: 0 }
      }
    ]),

    ...assistantStream(ASSISTANT_ID, ANSWER, 16200, 3400),
    status(19800, "connected")
  ]
};
