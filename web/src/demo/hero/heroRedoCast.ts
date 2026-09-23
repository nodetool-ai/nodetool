/**
 * The redo — the agent builds the board, then the user sends it back for one
 * shot.
 *
 * The landing page's agents section says two things: the agent builds the
 * project, and a note about one shot changes that shot and nothing else. This
 * cast shows both on one board. Both passes of `heroStoryboardCast` run
 * compressed, then the user asks for shot 3 at night. The agent rewrites that
 * shot, renders its still and its clip again, and keeps the day take as a
 * version. The other five cards never change.
 *
 * The night still and clip are pinned under `demo/public/casts/promo/`
 * (`take-wheel-night.*`), made from the day take's first frame.
 */
import type { Shot, VideoRef } from "@nodetool-ai/protocol";

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
import { patch } from "../doc/docCastHelpers";
import {
  DOC_CAST_VERSION,
  type StoryboardCastDoc,
  type StoryboardDocCast
} from "../doc/docCastTypes";
import { heroStoryboardCast } from "./heroStoryboardCast";
import { HERO_MODEL, HERO_SHOTS, at } from "./shared";

const BUILD_CALL = "redo-call-build";
const EDIT_CALL = "redo-call-edit";
const STILL_CALL = "redo-call-still";
const CLIP_CALL = "redo-call-clip";

/** The shot the user sends back. */
const REDO_INDEX = 2;
const REDO_ID = HERO_SHOTS[REDO_INDEX].id;
const NIGHT_ACTION =
  "At night, a rear wheel churns loose rock, stones flaring through the headlight beams.";
export const HERO_REDO_NOTE = "Shot 3: night, headlights only.";

const SHOTS: Shot[] = heroStoryboardCast.doc.shots;

const still = (i: number) => ({ type: "image" as const, uri: STORYBOARD_STILLS[i] });
const clipRef = (key: string): VideoRef => ({
  type: "video",
  uri: `cast-asset://${key}`,
  duration: 2
});
const NIGHT_STILL = { type: "image" as const, uri: "cast-asset://take-wheel-night-still" };
const NIGHT_CLIP = clipRef("take-wheel-night");

/** The board during the build: `stills` stills, `clips` clips, one rendering. */
const built = (stills: number, clips = 0, rendering?: number): Shot[] =>
  SHOTS.map((s, i) => {
    if (i < clips) {
      const c = clipRef(HERO_SHOTS[i].clip);
      return {
        ...s,
        status: "rendered" as const,
        keyframe: still(i),
        keyframe_versions: [still(i)],
        clip: c,
        clip_versions: [c]
      };
    }
    if (i < stills) {
      return {
        ...s,
        status: i === rendering ? ("clip_generating" as const) : ("keyframe_ready" as const),
        keyframe: still(i),
        keyframe_versions: [still(i)]
      };
    }
    return s;
  });

/** The finished board with shot 3 replaced by `redo`. */
const withRedo = (redo: Partial<Shot>): Shot[] =>
  built(SHOTS.length, SHOTS.length).map((s, i) =>
    i === REDO_INDEX ? { ...s, ...redo } : s
  );

const STILL_AT = [900, 1200, 1500, 1800, 2100, 2400];
const CLIP_AT = [3000, 3450, 3900, 4350, 4800, 5250];
const CLIP_LEAD = 350;

/** The note lands here; everything after it is the redo. */
export const HERO_REDO_NOTE_MS = 7600;
const EDIT_AT = 8300;
const STILL_START = 9000;
const STILL_DONE = 10400;
const CLIP_START = 10800;
const CLIP_DONE = 12800;

const BUILD_ARGS = { storyboard_id: "sb_scrapheart" };
const EDIT_ARGS = {
  storyboard_id: "sb_scrapheart",
  ops: [{ op: "update_shot", target: REDO_ID, action: NIGHT_ACTION }]
};
const STILL_ARGS = { storyboard_id: "sb_scrapheart", targets: [REDO_ID] };
const CLIP_ARGS = { storyboard_id: "sb_scrapheart", targets: [REDO_ID] };

export const heroRedoCast: StoryboardDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "storyboard",
  id: "hero-redo",
  name: "Hero — send one shot back",
  description:
    "The agent renders the six-shot board, then re-renders only shot 3 from a one-line note.",
  createdAt: new Date(0).toISOString(),
  durationMs: 16000,
  fps: 30,
  docId: "hero-storyboard-board",
  assistantTitle: "Storyboard Assistant",
  assistantModel: HERO_MODEL,

  doc: heroStoryboardCast.doc,

  assets: [
    ...HERO_SHOTS.map((s) => ({
      key: s.clip,
      file: `${s.clip}.webm`,
      contentType: "video/webm"
    })),
    { key: "take-wheel-night", file: "take-wheel-night.webm", contentType: "video/webm" },
    { key: "take-wheel-night-still", file: "take-wheel-night.jpg", contentType: "image/jpeg" }
  ],

  events: [
    ...STILL_AT.map((t, i) => patch<StoryboardCastDoc>(t, { shots: built(i + 1) })),
    ...CLIP_AT.flatMap((t, i) => [
      patch<StoryboardCastDoc>(t - CLIP_LEAD, { shots: built(SHOTS.length, i, i) }),
      patch<StoryboardCastDoc>(t, { shots: built(SHOTS.length, i + 1) })
    ]),

    // The user picks shot 3, then sends the note.
    patch<StoryboardCastDoc>(HERO_REDO_NOTE_MS - 600, { activeShotId: REDO_ID }),
    patch<StoryboardCastDoc>(EDIT_AT, { shots: withRedo({ action: NIGHT_ACTION }) }),
    patch<StoryboardCastDoc>(STILL_START, {
      shots: withRedo({
        action: NIGHT_ACTION,
        status: "keyframe_generating",
        clip: undefined,
        clip_versions: undefined
      })
    }),
    patch<StoryboardCastDoc>(STILL_DONE, {
      shots: withRedo({
        action: NIGHT_ACTION,
        status: "keyframe_ready",
        keyframe: NIGHT_STILL,
        keyframe_versions: [still(REDO_INDEX), NIGHT_STILL],
        // The card previews an accepted clip over a new still, so the day
        // take steps aside while this shot renders again.
        clip: undefined,
        clip_versions: undefined
      })
    }),
    patch<StoryboardCastDoc>(CLIP_START, {
      shots: withRedo({
        action: NIGHT_ACTION,
        status: "clip_generating",
        keyframe: NIGHT_STILL,
        keyframe_versions: [still(REDO_INDEX), NIGHT_STILL],
        clip: undefined,
        clip_versions: undefined
      })
    }),
    patch<StoryboardCastDoc>(CLIP_DONE, {
      shots: withRedo({
        action: NIGHT_ACTION,
        status: "rendered",
        keyframe: NIGHT_STILL,
        keyframe_versions: [still(REDO_INDEX), NIGHT_STILL],
        clip: NIGHT_CLIP,
        clip_versions: [clipRef(HERO_SHOTS[REDO_INDEX].clip), NIGHT_CLIP]
      })
    })
  ],

  assistant: [
    status(0, "connected"),
    userMessage(100, "Render the stills, then animate the ones that work."),
    status(400, "streaming"),
    assistantStart(
      600,
      "redo-msg-build",
      [{ id: BUILD_CALL, name: "render_storyboard_stills", args: BUILD_ARGS }],
      at(0)
    ),
    toolRunning(700, BUILD_CALL, "Rendering stills, then clips…"),
    progress(700, 0, SHOTS.length * 2, "Rendering stills, then clips…"),
    ...[...STILL_AT, ...CLIP_AT].map((t, i) =>
      progress(t, i + 1, SHOTS.length * 2, "Rendering stills, then clips…")
    ),
    toolRunning(5400, null),
    progress(5400, 0, 0, null),
    toolResult(5400, "redo-msg-build", [
      {
        id: BUILD_CALL,
        name: "render_storyboard_stills",
        args: BUILD_ARGS,
        result: { rendered: SHOTS.length, failed: 0 }
      }
    ]),
    toolMessage(5400, BUILD_CALL, "render_storyboard_stills", "6 stills and 6 clips rendered", at(5300)),
    assistantStart(5700, "redo-msg-built", undefined, at(5700)),
    ...assistantStream("redo-msg-built", ["Six clips, twelve seconds. ", "Send any shot back with a note."], 5800, 800),
    status(6700, "connected"),

    // The redo.
    userMessage(HERO_REDO_NOTE_MS, HERO_REDO_NOTE),
    status(HERO_REDO_NOTE_MS + 200, "streaming"),
    assistantStart(
      EDIT_AT - 300,
      "redo-msg-edit",
      [{ id: EDIT_CALL, name: "edit_storyboard", args: EDIT_ARGS }],
      at(EDIT_AT - 300)
    ),
    toolRunning(EDIT_AT - 200, EDIT_CALL, "Rewriting shot 3…"),
    toolRunning(EDIT_AT + 100, null),
    toolResult(EDIT_AT + 100, "redo-msg-edit", [
      { id: EDIT_CALL, name: "edit_storyboard", args: EDIT_ARGS, result: { updated: [REDO_ID] } }
    ]),
    toolMessage(EDIT_AT + 100, EDIT_CALL, "edit_storyboard", "Shot 3 rewritten", at(EDIT_AT)),

    assistantStart(
      STILL_START - 200,
      "redo-msg-still",
      [{ id: STILL_CALL, name: "render_storyboard_stills", args: STILL_ARGS }],
      at(STILL_START - 200)
    ),
    toolRunning(STILL_START, STILL_CALL, "Rendering 1 still…"),
    progress(STILL_START, 0, 1, "Rendering 1 still…"),
    progress(STILL_DONE, 1, 1, "Rendering 1 still…"),
    toolRunning(STILL_DONE + 100, null),
    progress(STILL_DONE + 100, 0, 0, null),
    toolResult(STILL_DONE + 100, "redo-msg-still", [
      { id: STILL_CALL, name: "render_storyboard_stills", args: STILL_ARGS, result: { rendered: 1, failed: 0 } }
    ]),
    toolMessage(STILL_DONE + 100, STILL_CALL, "render_storyboard_stills", "1 of 1 stills rendered", at(STILL_DONE)),

    assistantStart(
      CLIP_START - 200,
      "redo-msg-clip",
      [{ id: CLIP_CALL, name: "render_storyboard_clips", args: CLIP_ARGS }],
      at(CLIP_START - 200)
    ),
    toolRunning(CLIP_START, CLIP_CALL, "Animating 1 clip…"),
    progress(CLIP_START, 0, 1, "Animating 1 clip…"),
    progress(CLIP_DONE, 1, 1, "Animating 1 clip…"),
    toolRunning(CLIP_DONE + 100, null),
    progress(CLIP_DONE + 100, 0, 0, null),
    toolResult(CLIP_DONE + 100, "redo-msg-clip", [
      { id: CLIP_CALL, name: "render_storyboard_clips", args: CLIP_ARGS, result: { rendered: 1, failed: 0 } }
    ]),
    toolMessage(CLIP_DONE + 100, CLIP_CALL, "render_storyboard_clips", "1 of 1 clips rendered", at(CLIP_DONE)),

    assistantStart(CLIP_DONE + 400, "redo-msg-done", undefined, at(CLIP_DONE + 400)),
    ...assistantStream(
      "redo-msg-done",
      ["Shot 3 is night now. ", "The other five are untouched, ", "and the day take is kept as a version."],
      CLIP_DONE + 500,
      1400
    ),
    status(CLIP_DONE + 2000, "connected")
  ]
};
