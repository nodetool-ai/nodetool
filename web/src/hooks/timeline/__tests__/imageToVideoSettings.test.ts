import { describe, expect, it } from "@jest/globals";
import {
  imageToVideoRequestSeconds,
  imageToVideoSettings,
  nearestAspectRatio,
  nearestResolution,
  placeImageToVideoClip,
  snapImageToVideoDuration
} from "../imageToVideoSettings";

describe("imageToVideoRequestSeconds", () => {
  it("rounds up so the video covers the clip", () => {
    expect(imageToVideoRequestSeconds(4000)).toBe(4);
    expect(imageToVideoRequestSeconds(4200)).toBe(5);
    expect(imageToVideoRequestSeconds(300)).toBe(1);
  });
});

describe("nearestAspectRatio", () => {
  it("picks the listed ratio closest to the image", () => {
    const options = ["16:9", "9:16", "1:1"];
    expect(nearestAspectRatio(1920, 1080, options)).toBe("16:9");
    expect(nearestAspectRatio(1080, 1350, options)).toBe("1:1");
    expect(nearestAspectRatio(1080, 1920, options)).toBe("9:16");
    expect(nearestAspectRatio(1024, 1024, options)).toBe("1:1");
  });

  it("returns nothing without options or dimensions", () => {
    expect(nearestAspectRatio(1920, 1080, [])).toBeUndefined();
    expect(nearestAspectRatio(0, 0, ["16:9"])).toBeUndefined();
  });
});

describe("nearestResolution", () => {
  const options = ["1080p", "480p", "720p"];

  it("picks the largest tier the image's short side fills", () => {
    expect(nearestResolution(1920, 1080, options)).toBe("1080p");
    expect(nearestResolution(1280, 720, options)).toBe("720p");
    expect(nearestResolution(1000, 1000, options)).toBe("720p");
  });

  it("falls back to the smallest tier for a small or unmeasured image", () => {
    expect(nearestResolution(320, 240, options)).toBe("480p");
    expect(nearestResolution(0, 0, options)).toBe("480p");
  });

  it("ignores tiers it cannot read", () => {
    expect(nearestResolution(1920, 1080, ["auto"])).toBeUndefined();
  });
});

describe("snapImageToVideoDuration", () => {
  it("keeps the clip length when the model takes any duration", () => {
    expect(snapImageToVideoDuration(4200, null)).toEqual({
      requestSeconds: 5,
      clipDurationMs: 4200
    });
  });

  it("keeps the clip length when the model lists the rounded-up seconds", () => {
    expect(snapImageToVideoDuration(5000, [5, 10])).toEqual({
      requestSeconds: 5,
      clipDurationMs: 5000
    });
  });

  it("uses the shortest listed duration that covers the clip", () => {
    expect(snapImageToVideoDuration(4000, [10, 5])).toEqual({
      requestSeconds: 5,
      clipDurationMs: 5000
    });
  });

  it("uses the longest listed duration when none covers the clip", () => {
    expect(snapImageToVideoDuration(12000, [5, 10])).toEqual({
      requestSeconds: 10,
      clipDurationMs: 10000
    });
  });
});

describe("imageToVideoSettings", () => {
  it("combines duration, aspect ratio and resolution", () => {
    expect(
      imageToVideoSettings(
        { durationMs: 3000, width: 1080, height: 1920 },
        {
          durations: [3, 6],
          aspectRatios: ["16:9", "9:16"],
          resolutions: ["720p", "1080p"]
        }
      )
    ).toEqual({
      requestSeconds: 3,
      clipDurationMs: 3000,
      aspectRatio: "9:16",
      resolution: "1080p"
    });
  });
});

describe("placeImageToVideoClip", () => {
  const tracks = [
    { id: "top", type: "video" as const, index: 0, locked: false },
    { id: "pictures", type: "video" as const, index: 1, locked: false }
  ];
  const image = { trackId: "pictures", startMs: 2000 };

  it("uses the free video track directly above the image", () => {
    expect(placeImageToVideoClip(tracks, [], image, 4000)).toEqual({
      kind: "existing",
      trackId: "top"
    });
  });

  it("inserts a track above when the span is taken", () => {
    const clips = [{ trackId: "top", startMs: 5000, durationMs: 1000 }];
    expect(placeImageToVideoClip(tracks, clips, image, 4000)).toEqual({
      kind: "insert",
      atIndex: 1
    });
  });

  it("uses the track above when a clip only touches the span", () => {
    const clips = [{ trackId: "top", startMs: 6000, durationMs: 1000 }];
    expect(placeImageToVideoClip(tracks, clips, image, 4000)).toEqual({
      kind: "existing",
      trackId: "top"
    });
  });

  it("inserts a track when the image is on the top track", () => {
    expect(
      placeImageToVideoClip(tracks, [], { trackId: "top", startMs: 0 }, 1000)
    ).toEqual({ kind: "insert", atIndex: 0 });
  });

  it("skips a locked or non-video track above", () => {
    const locked = [{ ...tracks[0], locked: true }, tracks[1]];
    expect(placeImageToVideoClip(locked, [], image, 4000)).toEqual({
      kind: "insert",
      atIndex: 1
    });
  });
});
