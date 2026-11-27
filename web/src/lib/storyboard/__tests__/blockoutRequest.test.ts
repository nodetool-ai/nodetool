import {
  BLOCKOUT_PROMPT_ONLY_NOTE,
  BLOCKOUT_REFERENCE_INSTRUCTION
} from "@nodetool-ai/timeline";

import { applyBlockoutToClipRequest } from "../blockoutRequest";

const REFERENCE_ASSET_ID = "0123456789abcdef0123456789abcdef";
const STILL_ASSET_ID = "fedcba9876543210fedcba9876543210";
const CAMERA = "The camera pushes in slowly.";

const base = (): Record<string, unknown> => ({
  mode: "video",
  prompt: "A woman crosses the room.",
  aspect_ratio: "16:9",
  resolution: "720p",
  variations: 1,
  source_asset_id: STILL_ASSET_ID
});

const blockout = {
  referenceAssetId: REFERENCE_ASSET_ID,
  referenceHash: "model3d-reference-v1:abc",
  cameraMove: CAMERA
};

describe("applyBlockoutToClipRequest", () => {
  it("attaches the reference video for a model that declares reference_to_video", () => {
    const request = applyBlockoutToClipRequest({
      data: base(),
      blockout,
      supportedTasks: ["text_to_video", "reference_to_video"],
      referenceImageAssetIds: [STILL_ASSET_ID, STILL_ASSET_ID]
    });

    expect(request.route).toBe("reference_video");
    expect(request.note).toBeUndefined();
    expect(request.data.capability).toBe("reference_to_video");
    expect(request.data.reference_videos).toEqual([
      { type: "video", asset_id: REFERENCE_ASSET_ID }
    ]);
    expect(request.data.reference_images).toEqual([
      { type: "image", asset_id: STILL_ASSET_ID }
    ]);
    // The server refuses a source image beside references.
    expect(request.data).not.toHaveProperty("source_asset_id");
    expect(request.data.prompt).toContain("A woman crosses the room.");
    expect(request.data.prompt).toContain(BLOCKOUT_REFERENCE_INSTRUCTION);
    expect(request.data.prompt).toContain(CAMERA);
    expect(request.data.resolution).toBe("720p");
  });

  it("keeps the full reference asset id from the clip to the request", () => {
    const clipStyle = {
      reference: {
        assetId: REFERENCE_ASSET_ID,
        dependencyHash: "model3d-reference-v1:abc",
        pass: "clay" as const
      }
    };
    const request = applyBlockoutToClipRequest({
      data: base(),
      blockout: {
        referenceAssetId: clipStyle.reference.assetId,
        referenceHash: clipStyle.reference.dependencyHash,
        cameraMove: CAMERA
      },
      supportedTasks: ["reference_to_video"],
      referenceImageAssetIds: []
    });
    const videos = request.data.reference_videos as { asset_id: string }[];
    expect(videos).toHaveLength(1);
    expect(videos[0].asset_id).toBe(REFERENCE_ASSET_ID);
    expect(videos[0].asset_id).toMatch(/^[0-9a-f]{32}$/);
    expect(request.data).not.toHaveProperty("reference_images");
  });

  it("sends no reference and writes the camera move into the prompt otherwise", () => {
    const data = base();
    const request = applyBlockoutToClipRequest({
      data,
      blockout,
      supportedTasks: ["text_to_video", "image_to_video"],
      referenceImageAssetIds: [STILL_ASSET_ID]
    });

    expect(request.route).toBe("prompt_only");
    expect(request.note).toBe(BLOCKOUT_PROMPT_ONLY_NOTE);
    expect(request.data).not.toHaveProperty("reference_videos");
    expect(request.data).not.toHaveProperty("reference_images");
    expect(request.data).not.toHaveProperty("capability");
    expect(request.data.source_asset_id).toBe(STILL_ASSET_ID);
    expect(request.data.prompt).toBe(`A woman crosses the room.\n\n${CAMERA}`);
    expect(request.data.prompt).not.toContain(BLOCKOUT_REFERENCE_INSTRUCTION);
    // The input is left as it was.
    expect(data.prompt).toBe("A woman crosses the room.");
  });

  it("falls back to the prompt when the model declares no tasks or no reference exists", () => {
    for (const supportedTasks of [undefined, null, []]) {
      expect(
        applyBlockoutToClipRequest({
          data: base(),
          blockout,
          supportedTasks,
          referenceImageAssetIds: []
        }).route
      ).toBe("prompt_only");
    }
    expect(
      applyBlockoutToClipRequest({
        data: base(),
        blockout: { referenceHash: "h", cameraMove: CAMERA },
        supportedTasks: ["reference_to_video"],
        referenceImageAssetIds: []
      }).route
    ).toBe("prompt_only");
  });
});
