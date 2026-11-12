import { describe, expect, it } from "vitest";
import {
  MUSIC_SAMPLE_RATE,
  generateMediaDataSchema,
  musicGenerationRequestSchema,
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
  it.each(["start", "end"] as const)("preserves the %s extension mode and added duration", (mode) => {
    const frame: GenerateMediaRequest = {
      mode: "video_extend", extension_mode: mode, duration: 3,
      source_asset_id: "source", model: "extension-model"
    };
    expect(generateMediaDataSchema.parse(frame)).toEqual(frame);
    expect(generateMediaDataSchema.safeParse({ ...frame, extension_mode: "middle" }).success).toBe(false);
  });
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

describe("music request segments", () => {
  const music = {
    task: "text2music",
    bpm: 120,
    beats_per_bar: 4,
    beat_unit: 4,
    candidates: 1,
    request_frames: 10 * MUSIC_SAMPLE_RATE
  };

  it("accepts a segment index for a replay, and segments without one", () => {
    const replay = { ...music, segments: [{ start_frame: 2 * 96000, end_frame: 3 * 96000, index: 2 }] };
    expect(musicGenerationRequestSchema.parse(replay).segments).toEqual(replay.segments);
    const plain = { ...music, segments: [{ start_frame: 0, end_frame: 96000 }] };
    expect(musicGenerationRequestSchema.parse(plain).segments?.[0]?.index).toBeUndefined();
  });

  it("refuses an index that would place the clip before frame 0", () => {
    const early = { ...music, segments: [{ start_frame: 96000, end_frame: 192000, index: 2 }] };
    expect(musicGenerationRequestSchema.safeParse(early).success).toBe(false);
    expect(musicGenerationRequestSchema.safeParse({ ...early, window_start_frame: 96000 }).success).toBe(true);
  });

  it.each([-1, 1.5])("refuses the segment index %s", (index) => {
    const bad = { ...music, segments: [{ start_frame: 0, end_frame: 96000, index }] };
    expect(musicGenerationRequestSchema.safeParse(bad).success).toBe(false);
  });
});
