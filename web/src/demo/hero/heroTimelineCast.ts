/**
 * Hero stage 3 — the board becomes a cut.
 *
 * The six clips `heroStoryboardCast` rendered land on the video track in cut
 * order, carrying their board provenance, then the score lands under them and
 * the cut plays. Nothing is generated here: assembly is the one step in the
 * loop that costs nothing, which is why it can run end to end in three
 * seconds of screen time.
 *
 * Media are the pinned files under `demo/public/casts/promo/`, resolved by
 * the player's `resolveAssetUrl`.
 */
import { makeSequence } from "@nodetool-ai/timeline";

import {
  addClip,
  clip,
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
const SCORE_CLIP = "hero-clip-score";
const BOARD_ID = "hero-storyboard-board";

/** Every rendered take is two seconds, so the cut is twelve. */
const CLIP_MS = 2000;
const CUT_MS = CLIP_MS * HERO_SHOTS.length;

/** When each clip lands on the track. */
const LAND_AT = [500, 1100, 1700, 2300, 2900, 3500];

export const heroTimelineCast: TimelineDemoCast = {
  version: 1,
  kind: "timeline",
  id: "hero-timeline",
  name: "Hero — assemble the cut",
  description:
    "The six rendered clips land on the timeline in cut order, the score goes under them, and the cut plays.",
  createdAt: "2026-01-01T00:00:00.000Z",
  durationMs: 12000,
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
    clips: []
  }),
  assets: [
    ...HERO_SHOTS.map((s) => ({
      key: s.clip,
      file: `${s.clip}.webm`,
      contentType: "video/webm"
    })),
    { key: "hero-score", file: "trailer-music.mp3", contentType: "audio/mpeg" }
  ],
  events: [
    ...HERO_SHOTS.map((s, i) =>
      addClip(
        LAND_AT[i],
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
      )
    ),

    // The score lands under the whole cut.
    addClip(
      4200,
      clip({
        id: SCORE_CLIP,
        trackId: AUDIO_TRACK,
        name: "Score",
        startMs: 0,
        durationMs: CUT_MS,
        mediaType: "audio",
        sourceType: "imported",
        currentAssetId: "hero-score"
      })
    ),

    selectClips(4900, []),
    zoom(5000, 9),

    // Play it: the playhead runs the whole cut, twice as fast as real time so
    // the hero can show all six shots inside its own window.
    playRange(5200, 0, CUT_MS, 6000),
    seek(11400, CUT_MS - 400)
  ]
};
