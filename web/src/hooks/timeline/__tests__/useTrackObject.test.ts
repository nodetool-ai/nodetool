import { makeClip } from "@nodetool-ai/timeline";
import type { VideoModel } from "../../../stores/ApiTypes";
import {
  trackObjectSourceWindow,
  validateTrackObjectRequest,
  type TrackObjectSelection
} from "../useTrackObject";

const model: VideoModel = {
  type: "video_model",
  id: "tracker-1",
  name: "Tracker",
  provider: "provider-1"
};

const clip = makeClip({
  id: "clip-1",
  trackId: "track-1",
  name: "Shot",
  mediaType: "video",
  sourceType: "imported",
  currentAssetId: "asset-1",
  startMs: 10_000,
  durationMs: 4_000,
  inPointMs: 2_000,
  speedMultiplier: 2
});

const selection: TrackObjectSelection = {
  clipId: clip.id,
  sourceAssetId: "asset-1",
  sourceMs: 2_000,
  region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
};

describe("track object request validation", () => {
  it("builds a source window from the clip's media clock", () => {
    expect(trackObjectSourceWindow(clip, selection.sourceMs)).toEqual({
      startMs: 2_000,
      endMs: 10_000
    });
  });

  it("anchors the source window at the selected source time", () => {
    const laterSelection = { ...selection, sourceMs: 6_000 };
    expect(
      validateTrackObjectRequest("timeline-1", clip, laterSelection, model)
    ).toEqual({
      ok: true,
      request: {
        clip_id: "clip-1",
        provider: "provider-1",
        model: "tracker-1",
        name: "Shot",
        initial_region: laterSelection.region,
        start_ms: 6_000,
        end_ms: 10_000,
        direction: "forward"
      }
    });
  });

  it.each([
    ["no selection", null, "Select a subject in the preview first."],
    [
      "stale source",
      { ...selection, sourceAssetId: "asset-2" },
      "The source changed. Select the subject again."
    ],
    [
      "invalid region",
      { ...selection, region: { ...selection.region!, x: 0.8 } },
      "Select a valid subject rectangle in the preview."
    ],
    [
      "invalid source window",
      { ...selection, sourceMs: 10_000 },
      "The clip has no valid source tracking window."
    ]
  ])("refuses %s without creating a request", (_label, value, error) => {
    const result = validateTrackObjectRequest(
      "timeline-1",
      clip,
      value as TrackObjectSelection | null,
      model
    );
    expect(result).toEqual({ ok: false, error });
  });

  it("refuses when provider/model discovery has no executable model", () => {
    expect(
      validateTrackObjectRequest("timeline-1", clip, selection, undefined)
    ).toEqual({
      ok: false,
      error: "No executable subject-tracking model is available."
    });
  });
});
