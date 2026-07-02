/**
 * Promo cast — Act 2 of the landing-page product video (demo/src/promo).
 *
 * The four takes generated on the canvas in Act 1 (`../promoTrailerCast.ts`)
 * are assembled into a cut on the real timeline editor: clips land on the
 * video track, two get swapped, one gets trimmed, the score lands on the
 * audio track, and the cut plays back. Then the generate-at-the-playhead
 * beat: a fifth clip appears at the playhead as `queued → generating →
 * generated` — the same states a real direct-gen clip walks through.
 *
 * All media are pinned files under `demo/public/casts/promo/` (real segments
 * of `marketing/public/movie_trailer_example.mp4`), resolved by the player's
 * `resolveAssetUrl`. The clip/asset keys match Act 1 so the two acts show the
 * same footage.
 */
import { makeSequence } from "@nodetool-ai/timeline";
import {
  addClip,
  clip,
  patchClip,
  playRange,
  seek,
  selectClips,
  track,
  zoom,
} from "./timelineCastHelpers";
import type { TimelineDemoCast } from "./timelineCastTypes";

const videoTrackId = "promo-track-video";
const audioTrackId = "promo-track-audio";

const driftId = "promo-clip-drift";
const wheelId = "promo-clip-wheel";
const sparksId = "promo-clip-sparks";
const riderId = "promo-clip-rider";
const musicId = "promo-clip-music";
const chainedId = "promo-clip-chained";

export const PROMO_PLAYHEAD_PROMPT =
  "Wasteland warrior drags a war buggy by chains, dust storm, golden hour";
export const PROMO_PLAYHEAD_MODEL = "fal-ai/bytedance/seedance-2.0";

/** Cast-time (ms) marks the promo scenes key their overlays to. */
export const PROMO_TIMELINE_MARKS = {
  /** All four takes are on the track and arranged. */
  cutAssembled: 6600,
  /** First playback of the assembled cut starts. */
  playCut: 7000,
  /** Playhead parked at the end, ready for the generate beat. */
  playheadParked: 10000,
  /** The generated clip lands on the track (queued). */
  clipQueued: 13000,
  /** The generated clip flips to `generated` with real media. */
  clipReady: 14400,
} as const;

export const promoTimelineCast: TimelineDemoCast = {
  version: 1,
  kind: "timeline",
  id: "promo-timeline",
  name: "Promo — cut the trailer on the timeline",
  description:
    "Assemble the four generated takes into a cut, then generate a missing shot at the playhead.",
  createdAt: "2026-01-01T00:00:00.000Z",
  durationMs: 17000,
  fps: 30,
  sequence: makeSequence({
    id: "promo-seq-trailer-cut",
    projectId: "promo-project",
    name: "Wasteland — trailer cut",
    fps: 24,
    width: 1280,
    height: 720,
    durationMs: 10000,
    tracks: [
      track({ id: videoTrackId, name: "Video", type: "video", index: 0 }),
      track({ id: audioTrackId, name: "Score", type: "audio", index: 1 }),
    ],
    clips: [],
  }),
  assets: [
    { key: "take-drift", file: "take-drift.webm", contentType: "video/webm" },
    { key: "take-wheel", file: "take-wheel.webm", contentType: "video/webm" },
    { key: "take-sparks", file: "take-sparks.webm", contentType: "video/webm" },
    { key: "take-rider", file: "take-rider.webm", contentType: "video/webm" },
    { key: "shot-chained", file: "shot-chained.webm", contentType: "video/webm" },
    { key: "trailer-music", file: "trailer-music.mp3", contentType: "audio/mpeg" },
  ],
  events: [
    // ── Build the cut: the four Act-1 takes land on the video track. ──────
    addClip(
      400,
      clip({
        id: driftId,
        trackId: videoTrackId,
        name: "Opening drift",
        startMs: 0,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "generated",
        currentAssetId: "take-drift",
      })
    ),
    addClip(
      1300,
      clip({
        id: wheelId,
        trackId: videoTrackId,
        name: "Wheel churn",
        startMs: 2000,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "generated",
        currentAssetId: "take-wheel",
      })
    ),
    addClip(
      2100,
      clip({
        id: sparksId,
        trackId: videoTrackId,
        name: "Grinder sparks",
        startMs: 4000,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "generated",
        currentAssetId: "take-sparks",
      })
    ),

    // Rearrange: sparks reads better before the wheel — swap them.
    selectClips(2800, [sparksId]),
    patchClip(3400, sparksId, { startMs: 2000 }),
    patchClip(3450, wheelId, { startMs: 4000 }),

    addClip(
      4200,
      clip({
        id: riderId,
        trackId: videoTrackId,
        name: "Rider in the ruins",
        startMs: 6000,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "generated",
        currentAssetId: "take-rider",
      })
    ),

    // Trim: tighten the rider shot.
    selectClips(4800, [riderId]),
    patchClip(5400, riderId, { durationMs: 1800 }),

    // Score lands on the audio track under the whole cut.
    addClip(
      5900,
      clip({
        id: musicId,
        trackId: audioTrackId,
        name: "Score",
        startMs: 0,
        durationMs: 7800,
        mediaType: "audio",
        sourceType: "imported",
        currentAssetId: "trailer-music",
      })
    ),

    selectClips(6600, []),
    zoom(6700, 14),
    playRange(7000, 0, 7800, 2800),

    // ── Generate at the playhead: park at the end of the cut. ─────────────
    seek(PROMO_TIMELINE_MARKS.playheadParked, 7800),

    // (The prompt bar overlay types between these marks — demo/src/promo.)
    addClip(
      PROMO_TIMELINE_MARKS.clipQueued,
      clip({
        id: chainedId,
        trackId: videoTrackId,
        name: "Chained hauler",
        startMs: 7800,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "generated",
        status: "queued",
        prompt: PROMO_PLAYHEAD_PROMPT,
        model: PROMO_PLAYHEAD_MODEL,
      })
    ),
    patchClip(13400, chainedId, { status: "generating" }),
    patchClip(PROMO_TIMELINE_MARKS.clipReady, chainedId, {
      status: "generated",
      currentAssetId: "shot-chained",
    }),
    patchClip(14500, musicId, { durationMs: 9800 }),

    // Play the new shot: the cut now runs through the generated clip.
    selectClips(14800, [chainedId]),
    playRange(15200, 7600, 9800, 1600),
  ],
};
