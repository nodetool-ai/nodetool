/**
 * Hero stage 2 — the board fills in, twice.
 *
 * The six shots `heroBriefCast` wrote arrive here as planned cards. First a
 * still lands on each one (cheap, one pass), then each still animates into a
 * clip (expensive, and only after the stills read right). That two-pass order
 * is the product's whole argument for a storyboard, so the hero shows both
 * passes rather than cutting from prompt to finished video.
 *
 * The stills are inline JPEG data URIs; the clips are far too large for that,
 * so they are pinned under `demo/public/casts/promo/` and addressed as
 * `cast-asset://<key>`, resolved by the player's `resolveAssetUrl`.
 */
import type { Screenplay, Shot, VideoRef } from "@nodetool-ai/protocol";

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
import { patch, shot } from "../doc/docCastHelpers";
import {
  DOC_CAST_VERSION,
  type StoryboardCastDoc,
  type StoryboardDocCast
} from "../doc/docCastTypes";
import { HERO_MODEL, HERO_SHOTS, HERO_TITLE, at } from "./shared";

const STILLS_CALL = "hero-call-stills";
const CLIPS_CALL = "hero-call-clips";
const STILLS_MSG = "hero-sb-1";
const CLIPS_MSG = "hero-sb-2";
const ANSWER_MSG = "hero-sb-3";

const SHOTS: Shot[] = HERO_SHOTS.map((s, i) =>
  shot(s.id, i, s.slug, s.action, {
    camera: { framing: s.framing, movement: s.movement },
    duration_seconds: s.seconds
  })
);

const clipRef = (index: number): VideoRef => ({
  type: "video",
  uri: `cast-asset://${HERO_SHOTS[index].clip}`,
  duration: 2
});

/**
 * The board after `stills` stills have landed, `clips` clips have rendered,
 * and — when `rendering` names one — that shot's clip is mid-render.
 */
const board = (stills: number, clips = 0, rendering?: number): Shot[] =>
  SHOTS.map((s, i) => {
    if (i < clips) {
      return {
        ...s,
        status: "rendered" as const,
        keyframe: { type: "image" as const, uri: STORYBOARD_STILLS[i] },
        keyframe_versions: [{ type: "image" as const, uri: STORYBOARD_STILLS[i] }],
        clip: clipRef(i),
        clip_versions: [clipRef(i)]
      };
    }
    if (i < stills) {
      return {
        ...s,
        status:
          i === rendering
            ? ("clip_generating" as const)
            : ("keyframe_ready" as const),
        keyframe: { type: "image" as const, uri: STORYBOARD_STILLS[i] },
        keyframe_versions: [{ type: "image" as const, uri: STORYBOARD_STILLS[i] }]
      };
    }
    return s;
  });

const screenplay: Screenplay = {
  type: "screenplay",
  id: "hero-screenplay",
  title: "SCRAPHEART",
  logline: "One last run across the flats, with nothing left to lose.",
  style_bible: "Blown-out sun, dust in every frame, 35mm, heavy grain.",
  aspect_ratio: "16:9",
  shots: SHOTS
};

const BOARD: StoryboardCastDoc = {
  screenplay,
  shots: SHOTS,
  title: HERO_TITLE,
  brief:
    "A 12-second chase teaser: a blown blower, a stolen car, one way out.",
  style: screenplay.style_bible ?? "",
  entityIds: [],
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  activeShotId: null,
  timelineId: null
};

/** When each still lands. One a second reads as work, not as a stutter. */
const STILL_AT = [2200, 3200, 4200, 5200, 6200, 7200];
/** When each clip lands. Video costs more, so it takes visibly longer. */
const CLIP_AT = [9600, 11000, 12400, 13800, 15200, 16600];
/** Lead time on the `clip_generating` state, so a card renders before it fills. */
const CLIP_LEAD = 700;

const ANSWER = [
  "Six clips, twelve seconds, cut order intact. ",
  "Laying them on a timeline with the score under them — ",
  "trim from there and re-roll any shot without touching the rest."
];

export const heroStoryboardCast: StoryboardDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "storyboard",
  id: "hero-storyboard",
  name: "Hero — stills, then clips",
  description:
    "The six-shot board renders a still for every shot, then animates each still into a clip.",
  createdAt: new Date(0).toISOString(),
  durationMs: 21000,
  fps: 30,
  docId: "hero-storyboard-board",
  assistantTitle: "Storyboard Assistant",
  assistantModel: HERO_MODEL,

  doc: BOARD,

  assets: [
    ...HERO_SHOTS.map((s) => ({
      key: s.clip,
      file: `${s.clip}.webm`,
      contentType: "video/webm"
    }))
  ],

  events: [
    // Pass one: a still per card.
    ...STILL_AT.map((t, i) =>
      patch<StoryboardCastDoc>(t, { shots: board(i + 1) })
    ),
    // Pass two: each still goes to `clip_generating`, then holds a clip.
    ...CLIP_AT.flatMap((t, i) => [
      patch<StoryboardCastDoc>(t - CLIP_LEAD, {
        shots: board(SHOTS.length, i, i)
      }),
      patch<StoryboardCastDoc>(t, { shots: board(SHOTS.length, i + 1) })
    ])
  ],

  assistant: [
    status(0, "connected"),
    userMessage(200, "Render the stills, then animate the ones that work."),
    status(700, "streaming"),

    assistantStart(
      1200,
      STILLS_MSG,
      [
        {
          id: STILLS_CALL,
          name: "render_storyboard_stills",
          args: { storyboard_id: "sb_scrapheart", model: "fal-ai/flux/dev" }
        }
      ],
      at(0)
    ),
    toolRunning(1400, STILLS_CALL, "Rendering stills…"),
    progress(1400, 0, SHOTS.length, "Rendering stills…"),
    ...STILL_AT.map((t, i) =>
      progress(t, i + 1, SHOTS.length, "Rendering stills…")
    ),
    toolRunning(7300, null),
    progress(7400, 0, 0, null),
    toolResult(7400, STILLS_MSG, [
      {
        id: STILLS_CALL,
        name: "render_storyboard_stills",
        args: { storyboard_id: "sb_scrapheart", model: "fal-ai/flux/dev" },
        result: { rendered: SHOTS.length, failed: 0 }
      }
    ]),
    toolMessage(
      7400,
      STILLS_CALL,
      "render_storyboard_stills",
      `${SHOTS.length} of ${SHOTS.length} stills rendered`,
      at(7200)
    ),

    assistantStart(
      7900,
      CLIPS_MSG,
      [
        {
          id: CLIPS_CALL,
          name: "render_storyboard_clips",
          message: "Animating each still into a clip",
          args: {
            storyboard_id: "sb_scrapheart",
            model: "fal-ai/bytedance/seedance-2.0",
            mode: "keyframe"
          }
        }
      ],
      at(7900)
    ),
    toolRunning(8100, CLIPS_CALL, "Animating stills into clips…"),
    progress(8100, 0, SHOTS.length, "Animating stills into clips…"),
    ...CLIP_AT.map((t, i) =>
      progress(t, i + 1, SHOTS.length, "Animating stills into clips…")
    ),
    toolRunning(16700, null),
    progress(16800, 0, 0, null),
    toolResult(16800, CLIPS_MSG, [
      {
        id: CLIPS_CALL,
        name: "render_storyboard_clips",
        message: "Animating each still into a clip",
        args: {
          storyboard_id: "sb_scrapheart",
          model: "fal-ai/bytedance/seedance-2.0",
          mode: "keyframe"
        },
        result: { rendered: SHOTS.length, failed: 0 }
      }
    ]),
    toolMessage(
      16800,
      CLIPS_CALL,
      "render_storyboard_clips",
      `${SHOTS.length} of ${SHOTS.length} clips rendered`,
      at(16600)
    ),

    assistantStart(17200, ANSWER_MSG, undefined, at(17000)),
    ...assistantStream(ANSWER_MSG, ANSWER, 17400, 3000),
    status(20600, "connected")
  ]
};
