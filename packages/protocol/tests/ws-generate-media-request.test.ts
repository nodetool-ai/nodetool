import { describe, expect, it } from "vitest";
import {
  generateMediaDataSchema,
  type GenerateMediaRequest
} from "../src/ws-commands.js";

/**
 * `GenerateMediaRequest` used to be hand-written in `messages.ts` beside this
 * schema and had drifted from it on four fields the server reads
 * (`packages/websocket/src/session/commands.ts:720-782`): the `inpaint` mode,
 * `mask_asset_id`, `aspect_ratio` and `resolution`. The type is now derived
 * from the schema, so this pins the frames the two live callers send.
 */
describe("generate_media request payload", () => {
  it("accepts the inpaint frame the sketch editor sends", () => {
    // web/src/hooks/sketch/useDirectGenJob.ts:294-306
    const frame: GenerateMediaRequest = {
      mode: "inpaint",
      provider: "fal",
      model: "inpaint-1",
      prompt: "a red roof",
      source_asset_id: "src-1",
      mask_asset_id: "mask-sel",
      variations: 2
    };
    expect(generateMediaDataSchema.safeParse(frame).success).toBe(true);
  });

  it("accepts the aspect_ratio / resolution frame the timeline sends", () => {
    const frame: GenerateMediaRequest = {
      mode: "video",
      provider: "fal",
      model: "video-1",
      prompt: "a drone shot",
      aspect_ratio: "16:9",
      resolution: "1080p"
    };
    expect(generateMediaDataSchema.safeParse(frame).success).toBe(true);
  });

  it("carries the seed one variation of a set is rendered with", () => {
    // web/src/hooks/sketch/useGenerateVariations.ts — N frames alike but for
    // this field (PRD § 10.7, criterion 4).
    const frame: GenerateMediaRequest = {
      mode: "image",
      provider: "fal",
      model: "flux",
      prompt: "a ceramic dripper",
      width: 1024,
      height: 1024,
      seed: 4242,
      variations: 1
    };
    const parsed = generateMediaDataSchema.safeParse(frame);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.seed).toBe(4242);
  });

  it("rejects a mode the server does not map", () => {
    const parsed = generateMediaDataSchema.safeParse({ mode: "hologram" });
    expect(parsed.success).toBe(false);
  });

  it("accepts ordered image and video references with guide audio", () => {
    const frame: GenerateMediaRequest = {
      mode: "video",
      capability: "reference_to_video",
      reference_images: [
        { type: "image", asset_id: "image-2" },
        { type: "image", uri: "asset://image-1.png" }
      ],
      reference_videos: [
        { type: "video", asset_id: "video-2" },
        { type: "video", uri: "asset://video-1.mov" }
      ],
      use_reference_video_audio: true
    };
    expect(generateMediaDataSchema.parse(frame)).toEqual(frame);
  });

  it.each([
    { reference_images: "image-1" },
    { reference_videos: "video-1" },
    { reference_images: [{ type: "video", asset_id: "video-1" }] },
    { reference_videos: [{ type: "image", asset_id: "image-1" }] },
    { reference_videos: [null] },
    { use_reference_video_audio: "false" },
    { capability: "reference_to_image" }
  ])("rejects malformed reference input %j", (input) => {
    expect(
      generateMediaDataSchema.safeParse({ mode: "video", ...input }).success
    ).toBe(false);
  });
});
