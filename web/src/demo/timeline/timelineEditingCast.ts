/**
 * "Trim, arrange, and caption a clip" tutorial cast — a synthetic, backend-free
 * capture of a short timeline-editor session: two video-track clips, a
 * caption, and a scrub through the finished cut. Exercises the real
 * `PreviewArea` + `TracksRegion` — the compositor, track lanes, clip
 * selection, zoom, and playhead — with no backend and no rendered project.
 */
import { makeSequence } from "@nodetool-ai/timeline";
import {
  EXAMPLE_IMAGE_DATA_URI,
} from "../assets/exampleImage";
import { SAMPLE_VIDEO_WEBM_DATA_URI } from "../assets/sampleMedia";
import {
  addClip,
  clip,
  patchClip,
  playRange,
  selectClips,
  track,
  zoom,
} from "./timelineCastHelpers";
import type { TimelineDemoCast } from "./timelineCastTypes";

const videoTrackId = "demo-track-video";
const captionTrackId = "demo-track-captions";

const introClipId = "demo-clip-intro";
const photoClipId = "demo-clip-photo";
const captionClipId = "demo-clip-caption";

const introAssetKey = "demo-asset-intro-video";
const photoAssetKey = "demo-asset-photo";

const introClip = clip({
  id: introClipId,
  trackId: videoTrackId,
  name: "Opening shot",
  startMs: 0,
  durationMs: 8000,
  mediaType: "video",
  sourceType: "imported",
  currentAssetId: introAssetKey,
});

export const timelineEditingCast: TimelineDemoCast = {
  version: 1,
  kind: "timeline",
  id: "timeline-trim-arrange",
  name: "Trim, arrange, and caption a clip",
  description:
    "A short timeline-editor session: add a clip, trim it, drop in a caption, then scrub the cut.",
  createdAt: "2026-01-01T00:00:00.000Z",
  durationMs: 16500,
  fps: 30,
  sequence: makeSequence({
    id: "demo-seq-trim-arrange",
    projectId: "demo-project",
    name: "Trim, arrange, and caption a clip",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 8000,
    tracks: [
      track({ id: videoTrackId, name: "Video", type: "video", index: 0 }),
      track({ id: captionTrackId, name: "Captions", type: "subtitle", index: 1 }),
    ],
    clips: [introClip],
  }),
  assets: [
    { key: introAssetKey, dataUri: SAMPLE_VIDEO_WEBM_DATA_URI, contentType: "video/webm" },
    { key: photoAssetKey, dataUri: EXAMPLE_IMAGE_DATA_URI, contentType: "image/jpeg" },
  ],
  events: [
    selectClips(600, [introClipId]),

    patchClip(2200, introClipId, { durationMs: 5000 }),

    addClip(
      3600,
      clip({
        id: photoClipId,
        trackId: videoTrackId,
        name: "Cutaway photo",
        startMs: 5000,
        durationMs: 3000,
        mediaType: "image",
        sourceType: "imported",
        currentAssetId: photoAssetKey,
      })
    ),
    selectClips(4300, [photoClipId]),

    addClip(
      5800,
      clip({
        id: captionClipId,
        trackId: captionTrackId,
        name: "Caption",
        startMs: 800,
        durationMs: 2600,
        mediaType: "audio",
        sourceType: "generated",
        caption: {
          words: [
            { word: "A", startMs: 0, endMs: 200 },
            { word: "short", startMs: 200, endMs: 700 },
            { word: "cut,", startMs: 700, endMs: 1200 },
            { word: "edited", startMs: 1300, endMs: 1900 },
            { word: "live.", startMs: 1900, endMs: 2600 },
          ],
        },
      })
    ),
    selectClips(6400, []),

    zoom(7200, 6),
    playRange(7600, 0, 8000, 8000),
  ],
};
