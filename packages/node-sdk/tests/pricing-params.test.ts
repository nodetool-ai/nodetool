/**
 * Reading duration/resolution/audio off node property values. The property
 * names come from a census of the shipped generator manifests (recorded in
 * `src/pricing-params.ts`); these cases use values those manifests really
 * carry as defaults.
 */
import { describe, expect, it } from "vitest";
import { extractPricingParams } from "../src/pricing-params.js";

describe("extractPricingParams", () => {
  it("reads a numeric duration", () => {
    expect(extractPricingParams({ duration: 5 }).seconds).toBe(5);
  });

  it("parses the string durations the manifests ship ('5s')", () => {
    expect(extractPricingParams({ duration: "5s" }).seconds).toBe(5);
    expect(extractPricingParams({ duration: "8" }).seconds).toBe(8);
  });

  it("ignores non-durations rather than guessing", () => {
    expect(extractPricingParams({ duration: "auto" }).seconds).toBeUndefined();
    expect(extractPricingParams({ duration: 0 }).seconds).toBeUndefined();
    expect(extractPricingParams({}).seconds).toBeUndefined();
  });

  it("prefers the first duration property present, in order", () => {
    expect(
      extractPricingParams({ duration: 4, duration_seconds: 9 }).seconds
    ).toBe(4);
    expect(extractPricingParams({ video_length: 12 }).seconds).toBe(12);
  });

  it("derives seconds from num_frames ÷ fps when no duration is stated", () => {
    expect(extractPricingParams({ num_frames: 96, fps: 24 }).seconds).toBe(4);
    expect(
      extractPricingParams({ num_frames: 81, frames_per_second: 27 }).seconds
    ).toBe(3);
    expect(extractPricingParams({ num_frames: 96 }).seconds).toBeUndefined();
  });

  it("passes a stated resolution through for the calculator to normalize", () => {
    expect(extractPricingParams({ resolution: "720p" }).resolution).toBe("720p");
    expect(extractPricingParams({ resolution: "4K" }).resolution).toBe("4K");
    expect(extractPricingParams({ image_size: "1K" }).resolution).toBe("1K");
  });

  it("maps a pixel pair to the nearest tier", () => {
    expect(extractPricingParams({ size: "1024x1024" }).resolution).toBe(
      "1024x1024"
    );
    expect(extractPricingParams({ size: "1280*720" }).resolution).toBe(
      "1024x1024"
    );
    expect(extractPricingParams({ width: 2048, height: 2048 }).resolution).toBe(
      "2K"
    );
  });

  it("leaves a pixel pair that sits between tiers unset", () => {
    // 480×832 is 1.5× off the nearest tier — naming one would invent a price.
    expect(extractPricingParams({ size: "480*832" }).resolution).toBeUndefined();
  });

  it("leaves resolution unset for names that state none", () => {
    for (const value of ["auto", "square_hd", "high", "original", ""]) {
      expect(extractPricingParams({ resolution: value }).resolution).toBeUndefined();
    }
  });

  it("reads the audio axis only from the booleans that name it", () => {
    expect(extractPricingParams({ generate_audio: true }).withAudio).toBe(true);
    expect(extractPricingParams({ with_audio: false }).withAudio).toBe(false);
    // `audio` is an AudioRef input on nearly every node that has it.
    expect(extractPricingParams({ audio: { uri: "x" } }).withAudio).toBeUndefined();
  });

  it("returns nothing for a node with no pricing-relevant properties", () => {
    expect(extractPricingParams({ prompt: "hi", seed: 3 })).toEqual({});
    expect(extractPricingParams(undefined)).toEqual({});
  });
});
