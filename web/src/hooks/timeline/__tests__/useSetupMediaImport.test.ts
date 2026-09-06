import { describe, it, expect, jest } from "@jest/globals";
import { createTimelineStore } from "../../../stores/timeline/TimelineStore";
import type { Asset } from "../../../stores/ApiTypes";

const importVideoWithAudioMock =
  jest.fn<(...args: unknown[]) => Promise<void>>();
jest.mock("../useVideoAudioImport", () => ({
  importVideoWithAudio: (...args: unknown[]) =>
    importVideoWithAudioMock(...args)
}));

import { importSetupMedia } from "../useSetupMediaImport";

const asset = (id: string, contentType: string, duration = 2): Asset =>
  ({
    id,
    user_id: "u1",
    parent_id: "root",
    name: `${id}`,
    content_type: contentType,
    workflow_id: null,
    created_at: "2026-01-01T00:00:00Z",
    get_url: `https://cdn.example.com/${id}`,
    thumb_url: null,
    duration
  }) as Asset;

/**
 * PRD § 8.7 criterion 1: dropped media lands as clips in drop order, **before
 * any beat exists**. The ordering is the assertion that matters — the plan
 * written afterwards describes this footage rather than inventing shots over
 * it.
 */
describe("importSetupMedia (criterion 1)", () => {
  it("places clips in drop order before any beat exists", async () => {
    const store = createTimelineStore();
    importVideoWithAudioMock.mockReset();

    await importSetupMedia(store, [
      asset("first", "image/png"),
      asset("second", "image/jpeg", 3),
      asset("third", "audio/wav", 5)
    ]);

    const state = store.getState();
    expect(state.clips.length).toBeGreaterThan(0);
    // No beat, and no plan: the flow has not asked the Director anything yet.
    expect(state.setup?.beats).toBeUndefined();

    const picture = state.clips.filter((clip) => clip.mediaType === "image");
    expect(picture.map((clip) => clip.currentAssetId)).toEqual([
      "first",
      "second"
    ]);
    expect(picture.map((clip) => clip.startMs)).toEqual([0, 2000]);
  });

  it("moves the flow on to the format step", async () => {
    const store = createTimelineStore();
    await importSetupMedia(store, [asset("only", "image/png")]);
    expect(store.getState().setup?.stage).toBe("format");
  });

  it("puts audio on an audio track and pictures on a video track", async () => {
    const store = createTimelineStore();
    await importSetupMedia(store, [
      asset("pic", "image/png"),
      asset("sound", "audio/mpeg")
    ]);
    const state = store.getState();
    const trackType = (clipId: string) => {
      const clip = state.clips.find((candidate) => candidate.id === clipId);
      return state.tracks.find((track) => track.id === clip?.trackId)?.type;
    };
    const pic = state.clips.find((clip) => clip.currentAssetId === "pic");
    const sound = state.clips.find((clip) => clip.currentAssetId === "sound");
    expect(trackType(pic?.id ?? "")).toBe("video");
    expect(trackType(sound?.id ?? "")).toBe("audio");
  });

  it("sends a video through the existing import, so its audio comes with it", async () => {
    const store = createTimelineStore();
    importVideoWithAudioMock.mockReset();
    importVideoWithAudioMock.mockResolvedValue(undefined);

    await importSetupMedia(store, [asset("movie", "video/mp4", 4)]);

    expect(importVideoWithAudioMock).toHaveBeenCalledTimes(1);
    const [, dropped, , startMs] = importVideoWithAudioMock.mock.calls[0];
    expect((dropped as Asset).id).toBe("movie");
    expect(startMs).toBe(0);
  });

  it("reports a file it cannot place rather than dropping it silently", async () => {
    const store = createTimelineStore();
    const result = await importSetupMedia(store, [
      asset("notes", "application/pdf")
    ]);
    expect(result.skipped.map((a) => a.id)).toEqual(["notes"]);
    expect(store.getState().clips).toEqual([]);
  });
});
