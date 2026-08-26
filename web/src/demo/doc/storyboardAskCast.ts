/**
 * "The assistant asks before it spends" tutorial cast.
 *
 * The brief is under-specified — trailer slot or social — and the two answers
 * cost different money. So the first turn renders nothing: it asks, and the
 * dock goes idle while the board stays empty. The user's answer picks the
 * aspect ratio and the shot count, and only then does the shot list land,
 * still as planned cards with no frame rendered.
 *
 * Backend-free by construction: nothing in this cast generates an image.
 */
import type { Screenplay, Shot } from "@nodetool-ai/protocol";

import { PROVIDER_IDS } from "../../stores/ApiTypes";
import {
  assistantStart,
  assistantStream,
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

const QUESTION_TURN = "storyboard-ask-1";
const PLAN_TURN = "storyboard-ask-2";
const SCREENPLAY_CALL = "storyboard-ask-screenplay";

const SHOTS: Shot[] = [
  shot(
    "ask-shot-1",
    0,
    "The blower",
    "The supercharger spits fire straight down the lens, framed tall.",
    {
      camera: { framing: "close-up", movement: "static" },
      duration_seconds: 3
    }
  ),
  shot(
    "ask-shot-2",
    1,
    "The chain",
    "The raider hauls the buggy in, sparks climbing the frame.",
    {
      camera: { framing: "medium", movement: "handheld" },
      duration_seconds: 3
    }
  ),
  shot(
    "ask-shot-3",
    2,
    "The getaway",
    "The car breaks across the dry lake and is gone off the top of frame.",
    { camera: { framing: "wide", movement: "tilt up" }, duration_seconds: 4 }
  )
];

const screenplay: Screenplay = {
  type: "screenplay",
  id: "screenplay-social-1",
  title: "SCRAPHEART",
  logline: "One last run across the flats, with nothing left to lose.",
  style_bible: "Blown-out sun, dust in every frame, 35mm, heavy grain.",
  aspect_ratio: "9:16",
  shots: SHOTS
};

const EMPTY_BOARD: StoryboardCastDoc = {
  screenplay: null,
  shots: [],
  title: "SCRAPHEART — Social Cutdown",
  brief: "A teaser I can cut in a day.",
  style: "",
  entityIds: [],
  aspectRatio: "16:9",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  activeShotId: null,
  timelineId: null
};

const QUESTION = [
  "Two ways to cut this, and they ",
  "cost different money. Six quick ",
  "shots at 16:9 for the trailer slot, ",
  "or three longer verticals for social? ",
  "Say which and I'll board it."
];

const ANSWER = [
  "Three verticals, ten seconds: ",
  "the blower, the chain, the getaway. ",
  "Planned only — no frame rendered yet. ",
  "Say go when the shots read right."
];

export const storyboardAskCast: StoryboardDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "storyboard",
  id: "storyboard-ask",
  name: "The assistant asks before it spends",
  description:
    "An under-specified brief gets a question, not a guess: the board stays empty until the answer picks the format.",
  createdAt: new Date(0).toISOString(),
  durationMs: 19000,
  fps: 30,
  docId: "demo-storyboard-ask",
  assistantTitle: "Storyboard Assistant",
  assistantModel: {
    type: "language_model",
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: PROVIDER_IDS.ANTHROPIC
  },

  doc: EMPTY_BOARD,

  events: [
    // The only document change in the cast, and it lands after the answer:
    // the aspect ratio the user chose, and the shots it implied.
    patch(12200, {
      screenplay,
      shots: SHOTS,
      aspectRatio: "9:16"
    })
  ],

  assistant: [
    status(0, "connected"),
    userMessage(400, "Board a teaser for the short — something I can cut in a day."),
    status(900, "streaming"),

    // First turn: a question, no tool calls, nothing rendered.
    assistantStart(1600, QUESTION_TURN),
    ...assistantStream(QUESTION_TURN, QUESTION, 1900, 3200),
    // The dock goes idle and waits. This beat is the tutorial.
    status(5400, "connected"),

    userMessage(7200, "Vertical, three shots. Save the frames for the good one."),
    status(7600, "streaming"),
    assistantStart(8400, PLAN_TURN, [
      {
        id: SCREENPLAY_CALL,
        name: "ui_storyboard_set_screenplay",
        args: { title: "SCRAPHEART", aspect_ratio: "9:16", shots: 3 }
      }
    ]),
    toolRunning(8700, SCREENPLAY_CALL, "Writing the shot list…"),
    toolRunning(12000, null),
    toolResult(12200, PLAN_TURN, [
      {
        id: SCREENPLAY_CALL,
        name: "ui_storyboard_set_screenplay",
        args: { title: "SCRAPHEART", aspect_ratio: "9:16", shots: 3 },
        result: { shots: 3, aspect_ratio: "9:16", rendered: 0 }
      }
    ]),
    ...assistantStream(PLAN_TURN, ANSWER, 12800, 4200),
    status(17400, "connected")
  ]
};
