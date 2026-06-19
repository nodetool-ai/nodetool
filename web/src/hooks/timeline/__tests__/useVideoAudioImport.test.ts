import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { createTimelineStore } from "../../../stores/timeline/TimelineStore";
import type { Asset } from "../../../stores/ApiTypes";
import { importVideoWithAudio } from "../useVideoAudioImport";

const restFetchMock = jest.fn();
jest.mock("../../../lib/rest-fetch", () => ({
  restFetch: (...args: unknown[]) => restFetchMock(...args)
}));

function makeVideoAsset(): Asset {
  return {
    id: "vid-1",
    user_id: "u1",
    parent_id: "root",
    name: "clip.mp4",
    content_type: "video/mp4",
    workflow_id: null,
    created_at: "2024-01-01T00:00:00Z",
    get_url: "https://cdn.example.com/clip.mp4",
    thumb_url: null,
    duration: 5
  } as Asset;
}

describe("importVideoWithAudio", () => {
  beforeEach(() => restFetchMock.mockReset());

  it("adds a video clip and a linked placeholder audio clip immediately", async () => {
    restFetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    const videoTrackId = store.getState().tracks[0].id;

    void importVideoWithAudio(store, makeVideoAsset(), videoTrackId, 1000);
    await Promise.resolve();

    const clips = store.getState().clips;
    expect(clips).toHaveLength(2);
    const video = clips.find((c) => c.mediaType === "video");
    const audio = clips.find((c) => c.mediaType === "audio");
    expect(video?.startMs).toBe(1000);
    expect(audio?.startMs).toBe(1000);
    expect(audio?.status).toBe("generating");
    expect(audio?.currentAssetId).toBeUndefined();
    expect(video?.linkId).toBeDefined();
    expect(audio?.linkId).toBe(video?.linkId);
  });

  it("fills in the audio clip when extraction succeeds", async () => {
    restFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        has_audio: true,
        asset: { id: "aud-1", duration: 5, content_type: "audio/wav" }
      })
    });
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    const videoTrackId = store.getState().tracks[0].id;

    await importVideoWithAudio(store, makeVideoAsset(), videoTrackId, 0);

    const audio = store.getState().clips.find((c) => c.mediaType === "audio");
    expect(audio?.currentAssetId).toBe("aud-1");
    expect(audio?.status).toBe("generated");
  });

  it("removes the placeholder when the video has no audio", async () => {
    restFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ has_audio: false })
    });
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    const videoTrackId = store.getState().tracks[0].id;

    await importVideoWithAudio(store, makeVideoAsset(), videoTrackId, 0);

    const clips = store.getState().clips;
    expect(clips.filter((c) => c.mediaType === "audio")).toHaveLength(0);
    expect(clips.find((c) => c.mediaType === "video")?.linkId).toBeUndefined();
    // Audio track was created by the import and is now empty → removed.
    expect(store.getState().tracks.filter((t) => t.type === "audio")).toHaveLength(0);
  });

  it("marks the audio clip failed on error", async () => {
    restFetchMock.mockResolvedValue({ ok: false, status: 500 });
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    const videoTrackId = store.getState().tracks[0].id;

    await importVideoWithAudio(store, makeVideoAsset(), videoTrackId, 0);

    expect(
      store.getState().clips.find((c) => c.mediaType === "audio")?.status
    ).toBe("failed");
  });
});
