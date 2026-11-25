import { describe, it, expect } from "vitest";
import {
  checkImageRequest,
  profileAspectRatios,
  profileVideoResolutions,
  readListedMediaProfile,
  resolveVideoRequest
} from "../../src/providers/custom-media-profile.js";

describe("readListedMediaProfile", () => {
  it("reads every declared field", () => {
    expect(
      readListedMediaProfile({
        id: "m",
        sizes: ["768x768", "1280X720"],
        aspect_ratios: ["1:1", "16 : 9"],
        resolutions: ["1K"],
        durations: [5, 10],
        max_input_images: 2
      })
    ).toEqual({
      sizes: ["768x768", "1280x720"],
      aspectRatios: ["1:1", "16:9"],
      resolutions: ["1K"],
      durations: [5, 10],
      maxInputImages: 2
    });
  });

  it("declares nothing when the fields are missing", () => {
    expect(readListedMediaProfile({ id: "m", type: "image" })).toBeUndefined();
  });

  it("drops malformed values and fields that end up empty", () => {
    expect(
      readListedMediaProfile({
        id: "m",
        sizes: "768x768",
        aspect_ratios: ["wide", 3, ""],
        resolutions: [null],
        durations: [-1, "5", Number.NaN, 0],
        max_input_images: 1.5
      })
    ).toBeUndefined();
    expect(
      readListedMediaProfile({
        id: "m",
        sizes: ["768x768", "0x512", "big", "768x768"]
      })
    ).toEqual({ sizes: ["768x768"] });
  });
});

describe("picker constraints", () => {
  it("derives aspect ratios and video resolutions from sizes", () => {
    const profile = { sizes: ["1280x720", "720x1280", "1920x1080"] };
    expect(profileAspectRatios(profile)).toEqual(["16:9", "9:16"]);
    expect(profileVideoResolutions(profile)).toEqual(["720p", "1080p"]);
  });

  it("prefers declared lists over derived ones", () => {
    const profile = {
      sizes: ["1280x720"],
      aspectRatios: ["16:9", "1:1"],
      resolutions: ["HD"]
    };
    expect(profileAspectRatios(profile)).toEqual(["16:9", "1:1"]);
    expect(profileVideoResolutions(profile)).toEqual(["HD"]);
  });
});

describe("checkImageRequest", () => {
  const profile = { sizes: ["768x768"], maxInputImages: 1 };

  it("accepts a declared size and an unset one", () => {
    expect(() =>
      checkImageRequest("m", profile, { size: "768x768" })
    ).not.toThrow();
    expect(() => checkImageRequest("m", profile, { size: null })).not.toThrow();
  });

  it("refuses an undeclared size and names the declared ones", () => {
    expect(() =>
      checkImageRequest("m", profile, { size: "1024x1024" })
    ).toThrow(
      'Model "m" does not accept size 1024x1024. The endpoint lists: 768x768.'
    );
  });

  it("refuses an undeclared aspect ratio, comparing reduced ratios", () => {
    const aspects = { aspectRatios: ["16:9"] };
    expect(() =>
      checkImageRequest("m", aspects, { size: "1920x1080" })
    ).not.toThrow();
    expect(() =>
      checkImageRequest("m", aspects, { size: null, aspectRatio: "32:18" })
    ).not.toThrow();
    expect(() =>
      checkImageRequest("m", aspects, { size: "1024x1024" })
    ).toThrow(/aspect ratio 1:1/);
  });

  it("refuses an undeclared resolution, ignoring case", () => {
    const res = { resolutions: ["1K"] };
    expect(() =>
      checkImageRequest("m", res, { size: null, resolution: "1k" })
    ).not.toThrow();
    expect(() =>
      checkImageRequest("m", res, { size: null, resolution: "2K" })
    ).toThrow(/resolution 2K/);
  });

  it("refuses more input images than declared", () => {
    expect(() =>
      checkImageRequest("m", profile, { size: null, inputImages: 2 })
    ).toThrow('Model "m" accepts at most 1 input image, got 2.');
  });
});

describe("resolveVideoRequest", () => {
  const profile = {
    sizes: ["1280x720", "720x1280", "1920x1080"],
    durations: [5, 10]
  };

  it("names the declared size from aspect ratio and resolution", () => {
    expect(
      resolveVideoRequest("m", profile, {
        aspectRatio: "9:16",
        resolution: "720p",
        durationSeconds: 10
      })
    ).toEqual({ size: "720x1280", seconds: 10 });
    expect(
      resolveVideoRequest("m", profile, {
        aspectRatio: "16:9",
        resolution: "1080p"
      })
    ).toEqual({ size: "1920x1080", seconds: 5 });
  });

  it("sends the first declared values when the request leaves them unset", () => {
    expect(resolveVideoRequest("m", profile, {})).toEqual({
      size: "1280x720",
      seconds: 5
    });
  });

  it("counts frames at 24 fps when no duration is given", () => {
    expect(resolveVideoRequest("m", profile, { numFrames: 240 }).seconds).toBe(
      10
    );
  });

  it("refuses an undeclared size rather than picking a near one", () => {
    expect(() =>
      resolveVideoRequest("m", profile, {
        aspectRatio: "1:1",
        resolution: "720p"
      })
    ).toThrow(/size 1:1 at 720p/);
    expect(() =>
      resolveVideoRequest("m", profile, {
        aspectRatio: "9:16",
        resolution: "1080p"
      })
    ).toThrow(/The endpoint lists: 1280x720, 720x1280, 1920x1080/);
  });

  it("refuses an undeclared duration rather than snapping it", () => {
    expect(() =>
      resolveVideoRequest("m", profile, { durationSeconds: 8 })
    ).toThrow(
      'Model "m" does not accept a 8s duration. The endpoint lists: 5s, 10s.'
    );
  });

  it("checks declared aspect ratios and resolutions without sizes", () => {
    const lists = { aspectRatios: ["16:9"], resolutions: ["720p"] };
    expect(
      resolveVideoRequest("m", lists, {
        aspectRatio: "16:9",
        resolution: "720P"
      })
    ).toEqual({});
    expect(() =>
      resolveVideoRequest("m", lists, { aspectRatio: "9:16" })
    ).toThrow(/aspect ratio 9:16/);
    expect(() =>
      resolveVideoRequest("m", lists, { resolution: "1080p" })
    ).toThrow(/resolution 1080p/);
  });
});
