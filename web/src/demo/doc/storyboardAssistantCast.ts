/**
 * "Direct a storyboard with the assistant" tutorial cast.
 *
 * The Storyboard Assistant is asked for a six-shot chase teaser: it writes the
 * screenplay (`ui_storyboard_set_screenplay`), then renders the keyframes
 * (`ui_storyboard_generate_keyframe`) shot by shot, so the board fills in one
 * card at a time in the real `StoryboardBoard`.
 *
 * The board is SCRAPHEART, the same teaser the marketing chat casts direct —
 * one project seen from two surfaces, which is the claim the storyboard tab
 * makes on the landing page.
 *
 * Backend-free: every still is an inline JPEG data URI generated from the
 * shots already shipped with the site, so replay renders no frames and spends
 * no credits.
 */
import type { Screenplay, Shot } from "@nodetool-ai/protocol";

import { PROVIDER_IDS } from "../../stores/ApiTypes";
import { STORYBOARD_STILLS } from "../assets/storyboardStills";
import {
  assistantStart,
  assistantStream,
  progress,
  status,
  toolMessage,
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
/** The answer is its own message: it follows the tool results, as in a real turn. */
const ANSWER_ID = "storyboard-assistant-2";
const SCREENPLAY_CALL = "storyboard-call-screenplay";
const KEYFRAME_CALL = "storyboard-call-keyframes";

const SHOTS: Shot[] = [
  shot(
    "shot-1",
    0,
    "The blower",
    "The supercharger spits fire down the straight, the chase car closing behind.",
    {
      camera: { framing: "close-up", movement: "tracking" },
      duration_seconds: 4
    }
  ),
  shot(
    "shot-2",
    1,
    "The chain",
    "A masked raider hauls the buggy in on a chain, sparks off the tire.",
    {
      camera: { framing: "medium", movement: "tracking" },
      duration_seconds: 4
    }
  ),
  shot(
    "shot-3",
    2,
    "The rock bed",
    "A rear wheel churns loose rock, stones thrown at the lens.",
    {
      camera: { framing: "close-up", movement: "handheld" },
      duration_seconds: 3
    }
  ),
  shot(
    "shot-4",
    3,
    "The chopper",
    "The rider guns the chopper flat out through the ruins.",
    {
      camera: { framing: "wide", movement: "tracking" },
      duration_seconds: 4
    }
  ),
  shot(
    "shot-5",
    4,
    "The cut",
    "A grinder throws sparks off a frame rail in the wreck yard.",
    { camera: { framing: "close-up", movement: "static" }, duration_seconds: 4 }
  ),
  shot(
    "shot-6",
    5,
    "The getaway",
    "The car breaks loose across the dry lake and is gone.",
    {
      camera: { framing: "wide", movement: "slow pull out" },
      duration_seconds: 5
    }
  )
];

/** Shots 0..count-1 carrying their rendered still. */
const rendered = (count: number): Shot[] =>
  SHOTS.map((s, i) =>
    i < count
      ? {
          ...s,
          status: "keyframe_ready" as const,
          keyframe: { type: "image", uri: STORYBOARD_STILLS[i] },
          keyframe_versions: [{ type: "image", uri: STORYBOARD_STILLS[i] }]
        }
      : s
  );

const screenplay: Screenplay = {
  type: "screenplay",
  id: "screenplay-1",
  title: "SCRAPHEART",
  logline: "One last run across the flats, with nothing left to lose.",
  style_bible: "Blown-out sun, dust in every frame, 35mm, heavy grain.",
  aspect_ratio: "16:9",
  shots: SHOTS
};

const BOARD: StoryboardCastDoc = {
  screenplay: null,
  shots: [],
  title: "SCRAPHEART — Desert Chase (Teaser)",
  brief: "A 24-second chase teaser: a blown blower, a stolen car, one way out.",
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
  "Six shots, twenty-four seconds: ",
  "the blower, the chain, the rock bed, ",
  "the chopper, the cut, the getaway. ",
  "Stills are in — ",
  "say go and I'll render the clips."
];

/** When each still lands. One every 2.2 s reads as work, not as a stutter. */
const STILL_AT = [8600, 10800, 13000, 15200, 17400, 19600];

/**
 * Wall clock for the tool chain. Only differences matter: the chain counts a
 * call complete when its result message arrives, and times it from the
 * assistant message that made the call.
 */
const EPOCH = Date.parse("2026-08-24T10:00:00.000Z");
const at = (ms: number): string => new Date(EPOCH + ms).toISOString();

export const storyboardAssistantCast: StoryboardDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "storyboard",
  id: "storyboard-assistant",
  name: "Direct a storyboard with the assistant",
  description:
    "Ask the Storyboard Assistant for a teaser: it writes the shot list, then renders a still for every shot.",
  createdAt: new Date(0).toISOString(),
  durationMs: 25000,
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
    ...STILL_AT.map((t, i) =>
      patch(t, { shots: rendered(i + 1), activeShotId: SHOTS[i].id })
    )
  ],

  assistant: [
    status(0, "connected"),
    userMessage(
      400,
      "Board a 24-second chase teaser: a blown blower, a stolen car, one way out. Then render the stills."
    ),
    status(900, "streaming"),

    assistantStart(
      1600,
      ASSISTANT_ID,
      [
        {
          id: SCREENPLAY_CALL,
          name: "ui_storyboard_set_screenplay",
          args: { shotCount: SHOTS.length, aspectRatio: "16:9" }
        }
      ],
      at(0)
    ),
    toolRunning(1800, SCREENPLAY_CALL, "Writing the shot list…"),
    toolRunning(4400, null),
    toolResult(4600, ASSISTANT_ID, [
      {
        id: SCREENPLAY_CALL,
        name: "ui_storyboard_set_screenplay",
        args: { shotCount: SHOTS.length, aspectRatio: "16:9" },
        result: { shotIds: SHOTS.map((s) => s.id) }
      },
      {
        id: KEYFRAME_CALL,
        name: "ui_storyboard_generate_keyframe",
        args: { shots: "all" }
      }
    ]),
    toolMessage(
      4600,
      SCREENPLAY_CALL,
      "ui_storyboard_set_screenplay",
      `${SHOTS.length} shots written`,
      at(2900)
    ),
    toolRunning(5200, KEYFRAME_CALL, "Rendering stills…"),
    progress(5200, 0, SHOTS.length, "Rendering stills…"),
    ...STILL_AT.map((t, i) =>
      progress(t, i + 1, SHOTS.length, "Rendering stills…")
    ),
    toolRunning(19600, null),
    progress(19800, 0, 0, null),
    toolResult(19800, ASSISTANT_ID, [
      {
        id: SCREENPLAY_CALL,
        name: "ui_storyboard_set_screenplay",
        args: { shotCount: SHOTS.length, aspectRatio: "16:9" },
        result: { shotIds: SHOTS.map((s) => s.id) }
      },
      {
        id: KEYFRAME_CALL,
        name: "ui_storyboard_generate_keyframe",
        args: { shots: "all" },
        result: { rendered: SHOTS.length, failed: 0 }
      }
    ]),

    toolMessage(
      19800,
      KEYFRAME_CALL,
      "ui_storyboard_generate_keyframe",
      `${SHOTS.length} of ${SHOTS.length} stills rendered`,
      at(18100)
    ),

    assistantStart(20200, ANSWER_ID, undefined, at(18500)),
    ...assistantStream(ANSWER_ID, ANSWER, 20400, 3400),
    status(24000, "connected")
  ]
};
