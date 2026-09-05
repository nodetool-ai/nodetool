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

  it("rejects a mode the server does not map", () => {
    const parsed = generateMediaDataSchema.safeParse({ mode: "hologram" });
    expect(parsed.success).toBe(false);
  });
});
