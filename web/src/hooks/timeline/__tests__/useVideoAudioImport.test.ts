import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { createTimelineStore } from "../../../stores/timeline/TimelineStore";
import type { Asset } from "../../../stores/ApiTypes";
import { importVideoWithAudio } from "../useVideoAudioImport";

const restFetchMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../../../lib/rest-fetch", () => ({
  restFetch: (...args: unknown[]) => restFetchMock(...args)
}));

const probeMock = jest.fn<(...args: unknown[]) => Promise<number | null>>();
jest.mock("../../../utils/probeMediaDuration", () => ({
  probeMediaDurationMs: (...args: unknown[]) => probeMock(...args)
}));

function makeVideoAsset(overrides: Partial<Asset> = {}): Asset {
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
    duration: 5,
    ...overrides
  } as Asset;
}

describe("importVideoWithAudio", () => {
  beforeEach(() => {
    restFetchMock.mockReset();
    probeMock.mockReset();
    // Default: not called for assets that already carry a duration.
    probeMock.mockResolvedValue(null);
  });

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

  it("passes an abort signal to restFetch so the request can time out", async () => {
    restFetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    const videoTrackId = store.getState().tracks[0].id;

    void importVideoWithAudio(store, makeVideoAsset(), videoTrackId, 0);
    await Promise.resolve();

    expect(restFetchMock).toHaveBeenCalledTimes(1);
    const init = restFetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("corrects the video clip length from a media probe when the asset has no duration", async () => {
    restFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        has_audio: true,
        asset: { id: "aud-1", duration: 30, content_type: "audio/wav" }
      })
    });
    probeMock.mockResolvedValue(30_000);
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    const videoTrackId = store.getState().tracks[0].id;

    await importVideoWithAudio(
      store,
      makeVideoAsset({ duration: null }),
      videoTrackId,
      0
    );

    expect(probeMock).toHaveBeenCalledWith(
      "https://cdn.example.com/clip.mp4",
      "video"
    );
    const video = store
      .getState()
      .clips.find((c) => c.mediaType === "video");
    expect(video?.durationMs).toBe(30_000);
  });

  it("does not probe when the asset already has a duration", async () => {
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

    expect(probeMock).not.toHaveBeenCalled();
    const video = store
      .getState()
      .clips.find((c) => c.mediaType === "video");
    expect(video?.durationMs).toBe(5000);
  });

  it("marks the audio clip failed when the request is aborted/times out", async () => {
    restFetchMock.mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    const videoTrackId = store.getState().tracks[0].id;

    await importVideoWithAudio(store, makeVideoAsset(), videoTrackId, 0);

    expect(
      store.getState().clips.find((c) => c.mediaType === "audio")?.status
    ).toBe("failed");
  });
});
