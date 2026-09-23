/**
 * The redo's last beat — the cut picks up the new take.
 *
 * Opens on the finished teaser cut from `heroTimelineCast`, with every clip
 * already on the track. Shot 3's clip swaps to the night take the board just
 * rendered, and the playhead runs across it. The clips on either side do not
 * move: a redo changes one shot, not the edit.
 */
import { makeSequence } from "@nodetool-ai/timeline";

import {
  clip,
  patchClip,
  playRange,
  seek,
  selectClips,
  track,
  zoom
} from "../timeline/timelineCastHelpers";
import type { TimelineDemoCast } from "../timeline/timelineCastTypes";
import { HERO_SHOTS } from "./shared";

const VIDEO_TRACK = "hero-track-video";
const AUDIO_TRACK = "hero-track-score";
const BOARD_ID = "hero-storyboard-board";
const CLIP_MS = 2000;
const CUT_MS = CLIP_MS * HERO_SHOTS.length;
const REDO_INDEX = 2;
const REDO_CLIP = `hero-clip-${REDO_INDEX + 1}`;

export const heroRedoTimelineCast: TimelineDemoCast = {
  version: 1,
  kind: "timeline",
  id: "hero-redo-timeline",
  name: "Hero — the cut takes the new shot",
  description:
    "The finished cut swaps shot 3 for its night take, and the playhead runs across it.",
  createdAt: "2026-01-01T00:00:00.000Z",
  durationMs: 6000,
  fps: 30,
  sequence: makeSequence({
    id: "hero-seq-scrapheart",
    projectId: "hero-project",
    name: "SCRAPHEART — teaser cut",
    fps: 24,
    width: 1280,
    height: 720,
    durationMs: CUT_MS,
    tracks: [
      track({ id: VIDEO_TRACK, name: "Video", type: "video", index: 0 }),
      track({ id: AUDIO_TRACK, name: "Score", type: "audio", index: 1 })
    ],
    clips: [
      ...HERO_SHOTS.map((s, i) =>
        clip({
          id: `hero-clip-${i + 1}`,
          trackId: VIDEO_TRACK,
          name: s.slug,
          startMs: i * CLIP_MS,
          durationMs: CLIP_MS,
          mediaType: "video",
          sourceType: "generated",
          currentAssetId: s.clip,
          storyboardBoardId: BOARD_ID,
          storyboardShotId: s.id
        })
      ),
      clip({
        id: "hero-clip-score",
        trackId: AUDIO_TRACK,
        name: "Score",
        startMs: 0,
        durationMs: CUT_MS,
        mediaType: "audio",
        sourceType: "imported",
        currentAssetId: "hero-score"
      })
    ]
  }),
  assets: [
    ...HERO_SHOTS.map((s) => ({
      key: s.clip,
      file: `${s.clip}.webm`,
      contentType: "video/webm"
    })),
    { key: "take-wheel-night", file: "take-wheel-night.webm", contentType: "video/webm" },
    { key: "hero-score", file: "trailer-music.mp3", contentType: "audio/mpeg" }
  ],
  events: [
    // The playhead parks on shot 3, so the preview shows the day frame turn
    // to night, then plays the new take into the next shot.
    zoom(0, 9),
    seek(0, 4100),
    selectClips(300, [REDO_CLIP]),
    patchClip(1200, REDO_CLIP, { currentAssetId: "take-wheel-night" }),
    playRange(1900, 4100, 7300, 3200),
    selectClips(5300, [])
  ]
};
