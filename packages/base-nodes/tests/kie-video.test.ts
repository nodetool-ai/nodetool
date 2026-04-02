import { vi, describe, it, expect, beforeEach } from "vitest";
import { getNodeMetadata } from "@nodetool/node-sdk";

vi.mock("../src/nodes/kie-base.js", () => ({
  getApiKey: vi.fn(() => "test-api-key"),
  kieExecuteTask: vi.fn(async () => ({
    data: "dmlkZW9kYXRh",
    taskId: "task_456"
  })),
  uploadImageInput: vi.fn(async () => "https://uploaded.example.com/image.png"),
  uploadAudioInput: vi.fn(async () => "https://uploaded.example.com/audio.mp3"),
  uploadVideoInput: vi.fn(async () => "https://uploaded.example.com/video.mp4"),
  isRefSet: vi.fn((ref: unknown) => {
    if (!ref || typeof ref !== "object") return false;
    const r = ref as Record<string, unknown>;
    return !!(r.data || r.uri);
  })
}));

import {
  KlingTextToVideoNode,
  KlingImageToVideoNode,
  KlingAIAvatarStandardNode,
  KlingAIAvatarProNode,
  GrokImagineTextToVideoNode,
  GrokImagineImageToVideoNode,
  SeedanceV1LiteTextToVideoNode,
  SeedanceV1ProTextToVideoNode,
  SeedanceV1LiteImageToVideoNode,
  SeedanceV1ProImageToVideoNode,
  SeedanceV1ProFastImageToVideoNode,
  HailuoTextToVideoProNode,
  HailuoTextToVideoStandardNode,
  HailuoImageToVideoProNode,
  HailuoImageToVideoStandardNode,
  Kling25TurboTextToVideoNode,
  Kling25TurboImageToVideoNode,
  Sora2ProTextToVideoNode,
  Sora2ProImageToVideoNode,
  Sora2ProStoryboardNode,
  Sora2TextToVideoNode,
  WanMultiShotTextToVideoProNode,
  Wan26TextToVideoNode,
  Wan26ImageToVideoNode,
  Wan26VideoToVideoNode,
  TopazVideoUpscaleNode,
  InfinitalkV1Node,
  Veo31TextToVideoNode,
  RunwayGen3AlphaTextToVideoNode,
  RunwayGen3AlphaImageToVideoNode,
  RunwayGen3AlphaExtendVideoNode,
  RunwayAlephVideoNode,
  LumaModifyVideoNode,
  Veo31ImageToVideoNode,
  Veo31ReferenceToVideoNode,
  KlingMotionControlNode,
  Kling21TextToVideoNode,
  Kling21ImageToVideoNode,
  Wan25TextToVideoNode,
  Wan25ImageToVideoNode,
  WanAnimateNode,
  WanSpeechToVideoNode,
  Wan22TextToVideoNode,
  Wan22ImageToVideoNode,
  Hailuo02TextToVideoNode,
  Hailuo02ImageToVideoNode,
  Sora2WatermarkRemoverNode
} from "../src/nodes/kie-video.js";

import {
  kieExecuteTask,
  uploadImageInput,
  uploadAudioInput,
  uploadVideoInput
} from "../src/nodes/kie-base.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SECRETS = { KIE_API_KEY: "test" };
const IMG_REF = { data: "imgdata", uri: "" };
const AUDIO_REF = { data: "audiodata", uri: "" };
const VIDEO_REF = { data: "videodata", uri: "" };
const EXPECTED_OUTPUT = { output: { type: "video", data: "dmlkZW9kYXRh" } };

function metadataDefaults(NodeCls: any) {
  const metadata = getNodeMetadata(NodeCls);
  return Object.fromEntries(
    metadata.properties
      .filter((prop) => Object.prototype.hasOwnProperty.call(prop, "default"))
      .map((prop) => [prop.name, prop.default])
  );
}

function expectMetadataDefaults(NodeCls: any) {
  expect(new NodeCls().serialize()).toEqual(metadataDefaults(NodeCls));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1. KlingTextToVideoNode
// ===========================================================================
describe("KlingTextToVideoNode", () => {
  it("metadata", () => {
    expect(KlingTextToVideoNode.nodeType).toBe("kie.video.KlingTextToVideo");
    expect(KlingTextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(KlingTextToVideoNode);
  });

  it("process succeeds with valid prompt", async () => {
    const n = new (KlingTextToVideoNode as any)();
    n.assign({ prompt: "A flying eagle" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(kieExecuteTask).toHaveBeenCalled();
  });

  it("throws on empty prompt", async () => {
    const n = new (KlingTextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 2. KlingImageToVideoNode
// ===========================================================================
describe("KlingImageToVideoNode", () => {
  it("metadata", () => {
    expect(KlingImageToVideoNode.nodeType).toBe("kie.video.KlingImageToVideo");
    expect(KlingImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(KlingImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (KlingImageToVideoNode as any)();
    n.assign({ prompt: "Animate this", image1: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });

  it("throws when no images provided", async () => {
    const n = new (KlingImageToVideoNode as any)();
    n.assign({ prompt: "Animate" });
    await expect(n.process()).rejects.toThrow("At least one image is required");
  });
});

// ===========================================================================
// 3. KlingAIAvatarStandardNode
// ===========================================================================
describe("KlingAIAvatarStandardNode", () => {
  it("metadata", () => {
    expect(KlingAIAvatarStandardNode.nodeType).toBe(
      "kie.video.KlingAIAvatarStandard"
    );
    expect(KlingAIAvatarStandardNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(KlingAIAvatarStandardNode);
  });

  it("process with image and audio", async () => {
    const n = new (KlingAIAvatarStandardNode as any)();
    n.assign({ image: IMG_REF, audio: AUDIO_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
    expect(uploadAudioInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. KlingAIAvatarProNode
// ===========================================================================
describe("KlingAIAvatarProNode", () => {
  it("metadata", () => {
    expect(KlingAIAvatarProNode.nodeType).toBe("kie.video.KlingAIAvatarPro");
    expect(KlingAIAvatarProNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(KlingAIAvatarProNode);
  });

  it("process with image and audio", async () => {
    const n = new (KlingAIAvatarProNode as any)();
    n.assign({ image: IMG_REF, audio: AUDIO_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
    expect(uploadAudioInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 5. GrokImagineTextToVideoNode
// ===========================================================================
describe("GrokImagineTextToVideoNode", () => {
  it("metadata", () => {
    expect(GrokImagineTextToVideoNode.nodeType).toBe(
      "kie.video.GrokImagineTextToVideo"
    );
    expect(GrokImagineTextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(GrokImagineTextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (GrokImagineTextToVideoNode as any)();
    n.assign({ prompt: "A sunset" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (GrokImagineTextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 6. GrokImagineImageToVideoNode
// ===========================================================================
describe("GrokImagineImageToVideoNode", () => {
  it("metadata", () => {
    expect(GrokImagineImageToVideoNode.nodeType).toBe(
      "kie.video.GrokImagineImageToVideo"
    );
    expect(GrokImagineImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(GrokImagineImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (GrokImagineImageToVideoNode as any)();
    n.assign({ prompt: "Animate", image: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 7. SeedanceV1LiteTextToVideoNode
// ===========================================================================
describe("SeedanceV1LiteTextToVideoNode", () => {
  it("metadata", () => {
    expect(SeedanceV1LiteTextToVideoNode.nodeType).toBe(
      "kie.video.SeedanceV1LiteTextToVideo"
    );
    expect(SeedanceV1LiteTextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(SeedanceV1LiteTextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (SeedanceV1LiteTextToVideoNode as any)();
    n.assign({ prompt: "A river" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (SeedanceV1LiteTextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 8. SeedanceV1ProTextToVideoNode
// ===========================================================================
describe("SeedanceV1ProTextToVideoNode", () => {
  it("metadata", () => {
    expect(SeedanceV1ProTextToVideoNode.nodeType).toBe(
      "kie.video.SeedanceV1ProTextToVideo"
    );
    expect(SeedanceV1ProTextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(SeedanceV1ProTextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (SeedanceV1ProTextToVideoNode as any)();
    n.assign({ prompt: "A mountain" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (SeedanceV1ProTextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 9. SeedanceV1LiteImageToVideoNode
// ===========================================================================
describe("SeedanceV1LiteImageToVideoNode", () => {
  it("metadata", () => {
    expect(SeedanceV1LiteImageToVideoNode.nodeType).toBe(
      "kie.video.SeedanceV1LiteImageToVideo"
    );
    expect(SeedanceV1LiteImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(SeedanceV1LiteImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (SeedanceV1LiteImageToVideoNode as any)();
    n.assign({ image1: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });

  it("throws when no images provided", async () => {
    const n = new (SeedanceV1LiteImageToVideoNode as any)();
    await expect(n.process()).rejects.toThrow("At least one image is required");
  });
});

// ===========================================================================
// 10. SeedanceV1ProImageToVideoNode
// ===========================================================================
describe("SeedanceV1ProImageToVideoNode", () => {
  it("metadata", () => {
    expect(SeedanceV1ProImageToVideoNode.nodeType).toBe(
      "kie.video.SeedanceV1ProImageToVideo"
    );
    expect(SeedanceV1ProImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(SeedanceV1ProImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (SeedanceV1ProImageToVideoNode as any)();
    n.assign({ image1: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });

  it("throws when no images provided", async () => {
    const n = new (SeedanceV1ProImageToVideoNode as any)();
    await expect(n.process()).rejects.toThrow("At least one image is required");
  });
});

// ===========================================================================
// 11. SeedanceV1ProFastImageToVideoNode
// ===========================================================================
describe("SeedanceV1ProFastImageToVideoNode", () => {
  it("metadata", () => {
    expect(SeedanceV1ProFastImageToVideoNode.nodeType).toBe(
      "kie.video.SeedanceV1ProFastImageToVideo"
    );
    expect(SeedanceV1ProFastImageToVideoNode.title).toBeTruthy();
  });

  it("defaults — no prompt field", () => {
    expectMetadataDefaults(SeedanceV1ProFastImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (SeedanceV1ProFastImageToVideoNode as any)();
    n.assign({ image1: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });

  it("throws when no images provided", async () => {
    const n = new (SeedanceV1ProFastImageToVideoNode as any)();
    await expect(n.process()).rejects.toThrow("At least one image is required");
  });
});

// ===========================================================================
// 12. HailuoTextToVideoProNode
// ===========================================================================
describe("HailuoTextToVideoProNode", () => {
  it("metadata", () => {
    expect(HailuoTextToVideoProNode.nodeType).toBe(
      "kie.video.HailuoTextToVideoPro"
    );
    expect(HailuoTextToVideoProNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(HailuoTextToVideoProNode);
  });

  it("process succeeds", async () => {
    const n = new (HailuoTextToVideoProNode as any)();
    n.assign({ prompt: "A city at night" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (HailuoTextToVideoProNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });

  it("throws on 1080P with duration 10", async () => {
    const n = new (HailuoTextToVideoProNode as any)();
    n.assign({ prompt: "Test", resolution: "1080P", duration: "10" });
    await expect(n.process()).rejects.toThrow(
      "1080P resolution with 10s duration is not supported"
    );
  });
});

// ===========================================================================
// 13. HailuoTextToVideoStandardNode
// ===========================================================================
describe("HailuoTextToVideoStandardNode", () => {
  it("metadata", () => {
    expect(HailuoTextToVideoStandardNode.nodeType).toBe(
      "kie.video.HailuoTextToVideoStandard"
    );
    expect(HailuoTextToVideoStandardNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(HailuoTextToVideoStandardNode);
  });

  it("process succeeds", async () => {
    const n = new (HailuoTextToVideoStandardNode as any)();
    n.assign({ prompt: "A forest" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (HailuoTextToVideoStandardNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });

  it("throws on 1080P with duration 10", async () => {
    const n = new (HailuoTextToVideoStandardNode as any)();
    n.assign({ prompt: "Test", resolution: "1080P", duration: "10" });
    await expect(n.process()).rejects.toThrow(
      "1080P resolution with 10s duration is not supported"
    );
  });
});

// ===========================================================================
// 14. HailuoImageToVideoProNode
// ===========================================================================
describe("HailuoImageToVideoProNode", () => {
  it("metadata", () => {
    expect(HailuoImageToVideoProNode.nodeType).toBe(
      "kie.video.HailuoImageToVideoPro"
    );
    expect(HailuoImageToVideoProNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(HailuoImageToVideoProNode);
  });

  it("process with image", async () => {
    const n = new (HailuoImageToVideoProNode as any)();
    n.assign({ image: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });

  it("throws on 1080P with duration 10", async () => {
    const n = new (HailuoImageToVideoProNode as any)();
    n.assign({ image: IMG_REF, resolution: "1080P", duration: "10" });
    await expect(n.process()).rejects.toThrow(
      "1080P resolution with 10s duration is not supported"
    );
  });
});

// ===========================================================================
// 15. HailuoImageToVideoStandardNode
// ===========================================================================
describe("HailuoImageToVideoStandardNode", () => {
  it("metadata", () => {
    expect(HailuoImageToVideoStandardNode.nodeType).toBe(
      "kie.video.HailuoImageToVideoStandard"
    );
    expect(HailuoImageToVideoStandardNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(HailuoImageToVideoStandardNode);
  });

  it("process with image", async () => {
    const n = new (HailuoImageToVideoStandardNode as any)();
    n.assign({ image: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });

  it("throws on 1080P with duration 10", async () => {
    const n = new (HailuoImageToVideoStandardNode as any)();
    n.assign({ image: IMG_REF, resolution: "1080P", duration: "10" });
    await expect(n.process()).rejects.toThrow(
      "1080P resolution with 10s duration is not supported"
    );
  });
});

// ===========================================================================
// 16. Kling25TurboTextToVideoNode
// ===========================================================================
describe("Kling25TurboTextToVideoNode", () => {
  it("metadata", () => {
    expect(Kling25TurboTextToVideoNode.nodeType).toBe(
      "kie.video.Kling25TurboTextToVideo"
    );
    expect(Kling25TurboTextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Kling25TurboTextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (Kling25TurboTextToVideoNode as any)();
    n.assign({ prompt: "A car racing" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (Kling25TurboTextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 17. Kling25TurboImageToVideoNode
// ===========================================================================
describe("Kling25TurboImageToVideoNode", () => {
  it("metadata", () => {
    expect(Kling25TurboImageToVideoNode.nodeType).toBe(
      "kie.video.Kling25TurboImageToVideo"
    );
    expect(Kling25TurboImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Kling25TurboImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (Kling25TurboImageToVideoNode as any)();
    n.assign({ prompt: "Animate", image: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 18. Sora2ProTextToVideoNode
// ===========================================================================
describe("Sora2ProTextToVideoNode", () => {
  it("metadata", () => {
    expect(Sora2ProTextToVideoNode.nodeType).toBe(
      "kie.video.Sora2ProTextToVideo"
    );
    expect(Sora2ProTextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Sora2ProTextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (Sora2ProTextToVideoNode as any)();
    n.assign({ prompt: "A whale breaching" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (Sora2ProTextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 19. Sora2ProImageToVideoNode
// ===========================================================================
describe("Sora2ProImageToVideoNode", () => {
  it("metadata", () => {
    expect(Sora2ProImageToVideoNode.nodeType).toBe(
      "kie.video.Sora2ProImageToVideo"
    );
    expect(Sora2ProImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Sora2ProImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (Sora2ProImageToVideoNode as any)();
    n.assign({ prompt: "Animate", image: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 20. Sora2ProStoryboardNode
// ===========================================================================
describe("Sora2ProStoryboardNode", () => {
  it("metadata", () => {
    expect(Sora2ProStoryboardNode.nodeType).toBe(
      "kie.video.Sora2ProStoryboard"
    );
    expect(Sora2ProStoryboardNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Sora2ProStoryboardNode);
  });

  it("process succeeds with prompt", async () => {
    const n = new (Sora2ProStoryboardNode as any)();
    n.assign({ images: [IMG_REF] });
    // Sora2ProStoryboard accesses (this as any).prompt — set directly on instance
    n.prompt = "A story";
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (Sora2ProStoryboardNode as any)();
    n.prompt = "";
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 21. Sora2TextToVideoNode
// ===========================================================================
describe("Sora2TextToVideoNode", () => {
  it("metadata", () => {
    expect(Sora2TextToVideoNode.nodeType).toBe("kie.video.Sora2TextToVideo");
    expect(Sora2TextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Sora2TextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (Sora2TextToVideoNode as any)();
    n.assign({ prompt: "A spaceship launch" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (Sora2TextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 22. WanMultiShotTextToVideoProNode
// ===========================================================================
describe("WanMultiShotTextToVideoProNode", () => {
  it("metadata", () => {
    expect(WanMultiShotTextToVideoProNode.nodeType).toBe(
      "kie.video.WanMultiShotTextToVideoPro"
    );
    expect(WanMultiShotTextToVideoProNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(WanMultiShotTextToVideoProNode);
  });

  it("process succeeds", async () => {
    const n = new (WanMultiShotTextToVideoProNode as any)();
    n.assign({ prompt: "A multi-shot video" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (WanMultiShotTextToVideoProNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 23. Wan26TextToVideoNode
// ===========================================================================
describe("Wan26TextToVideoNode", () => {
  it("metadata", () => {
    expect(Wan26TextToVideoNode.nodeType).toBe("kie.video.Wan26TextToVideo");
    expect(Wan26TextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Wan26TextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (Wan26TextToVideoNode as any)();
    n.assign({ prompt: "A waterfall" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (Wan26TextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 24. Wan26ImageToVideoNode
// ===========================================================================
describe("Wan26ImageToVideoNode", () => {
  it("metadata", () => {
    expect(Wan26ImageToVideoNode.nodeType).toBe("kie.video.Wan26ImageToVideo");
    expect(Wan26ImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Wan26ImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (Wan26ImageToVideoNode as any)();
    n.assign({ prompt: "Animate", image1: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 25. Wan26VideoToVideoNode
// ===========================================================================
describe("Wan26VideoToVideoNode", () => {
  it("metadata", () => {
    expect(Wan26VideoToVideoNode.nodeType).toBe("kie.video.Wan26VideoToVideo");
    expect(Wan26VideoToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Wan26VideoToVideoNode);
  });

  it("process with video", async () => {
    const n = new (Wan26VideoToVideoNode as any)();
    n.assign({ prompt: "Transform", video1: VIDEO_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadVideoInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 26. TopazVideoUpscaleNode
// ===========================================================================
describe("TopazVideoUpscaleNode", () => {
  it("metadata", () => {
    expect(TopazVideoUpscaleNode.nodeType).toBe("kie.video.TopazVideoUpscale");
    expect(TopazVideoUpscaleNode.title).toBeTruthy();
  });

  it("defaults — no prompt", () => {
    expectMetadataDefaults(TopazVideoUpscaleNode);
  });

  it("process with video", async () => {
    const n = new (TopazVideoUpscaleNode as any)();
    n.assign({ video: VIDEO_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadVideoInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 27. InfinitalkV1Node
// ===========================================================================
describe("InfinitalkV1Node", () => {
  it("metadata", () => {
    expect(InfinitalkV1Node.nodeType).toBe("kie.video.InfinitalkV1");
    expect(InfinitalkV1Node.title).toBeTruthy();
  });

  it("defaults — empty", () => {
    expectMetadataDefaults(InfinitalkV1Node);
  });

  it("process with image and audio", async () => {
    const n = new (InfinitalkV1Node as any)();
    n.assign({ image: IMG_REF, audio: AUDIO_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
    expect(uploadAudioInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 28. Veo31TextToVideoNode
// ===========================================================================
describe("Veo31TextToVideoNode", () => {
  it("metadata", () => {
    expect(Veo31TextToVideoNode.nodeType).toBe("kie.video.Veo31TextToVideo");
    expect(Veo31TextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Veo31TextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (Veo31TextToVideoNode as any)();
    n.assign({ prompt: "A galaxy" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (Veo31TextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 29. RunwayGen3AlphaTextToVideoNode
// ===========================================================================
describe("RunwayGen3AlphaTextToVideoNode", () => {
  it("metadata", () => {
    expect(RunwayGen3AlphaTextToVideoNode.nodeType).toBe(
      "kie.video.RunwayGen3AlphaTextToVideo"
    );
    expect(RunwayGen3AlphaTextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(RunwayGen3AlphaTextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (RunwayGen3AlphaTextToVideoNode as any)();
    n.assign({ prompt: "A robot walking" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (RunwayGen3AlphaTextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 30. RunwayGen3AlphaImageToVideoNode
// ===========================================================================
describe("RunwayGen3AlphaImageToVideoNode", () => {
  it("metadata", () => {
    expect(RunwayGen3AlphaImageToVideoNode.nodeType).toBe(
      "kie.video.RunwayGen3AlphaImageToVideo"
    );
    expect(RunwayGen3AlphaImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(RunwayGen3AlphaImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (RunwayGen3AlphaImageToVideoNode as any)();
    n.assign({ prompt: "Animate", image: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 31. RunwayGen3AlphaExtendVideoNode
// ===========================================================================
describe("RunwayGen3AlphaExtendVideoNode", () => {
  it("metadata", () => {
    expect(RunwayGen3AlphaExtendVideoNode.nodeType).toBe(
      "kie.video.RunwayGen3AlphaExtendVideo"
    );
    expect(RunwayGen3AlphaExtendVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(RunwayGen3AlphaExtendVideoNode);
  });

  it("process with video", async () => {
    const n = new (RunwayGen3AlphaExtendVideoNode as any)();
    n.assign({ prompt: "Continue" });
    // Source uses (this as any).video via uploadVideoInput — set directly on instance
    n.video = VIDEO_REF;
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadVideoInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 32. RunwayAlephVideoNode
// ===========================================================================
describe("RunwayAlephVideoNode", () => {
  it("metadata", () => {
    expect(RunwayAlephVideoNode.nodeType).toBe("kie.video.RunwayAlephVideo");
    expect(RunwayAlephVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(RunwayAlephVideoNode);
  });

  it("process without image", async () => {
    const n = new (RunwayAlephVideoNode as any)();
    n.assign({ prompt: "A scene" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).not.toHaveBeenCalled();
  });

  it("process with optional image", async () => {
    const n = new (RunwayAlephVideoNode as any)();
    n.assign({ prompt: "A scene" });
    // Source uses (this as any).image via isRefSet — set directly on instance
    n.image = IMG_REF;
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 33. LumaModifyVideoNode
// ===========================================================================
describe("LumaModifyVideoNode", () => {
  it("metadata", () => {
    expect(LumaModifyVideoNode.nodeType).toBe("kie.video.LumaModifyVideo");
    expect(LumaModifyVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(LumaModifyVideoNode);
  });

  it("process with video", async () => {
    const n = new (LumaModifyVideoNode as any)();
    n.assign({ prompt: "Add effects", video: VIDEO_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadVideoInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 34. Veo31ImageToVideoNode
// ===========================================================================
describe("Veo31ImageToVideoNode", () => {
  it("metadata", () => {
    expect(Veo31ImageToVideoNode.nodeType).toBe("kie.video.Veo31ImageToVideo");
    expect(Veo31ImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Veo31ImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (Veo31ImageToVideoNode as any)();
    n.assign({ prompt: "Animate", image1: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 35. Veo31ReferenceToVideoNode
// ===========================================================================
describe("Veo31ReferenceToVideoNode", () => {
  it("metadata", () => {
    expect(Veo31ReferenceToVideoNode.nodeType).toBe(
      "kie.video.Veo31ReferenceToVideo"
    );
    expect(Veo31ReferenceToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Veo31ReferenceToVideoNode);
  });

  it("process with reference images", async () => {
    const n = new (Veo31ReferenceToVideoNode as any)();
    n.assign({ prompt: "Generate", image1: IMG_REF, image2: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// 36. KlingMotionControlNode
// ===========================================================================
describe("KlingMotionControlNode", () => {
  it("metadata", () => {
    expect(KlingMotionControlNode.nodeType).toBe(
      "kie.video.KlingMotionControl"
    );
    expect(KlingMotionControlNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(KlingMotionControlNode);
  });

  it("process with image", async () => {
    const n = new (KlingMotionControlNode as any)();
    n.assign({ prompt: "Pan left", image: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 37. Kling21TextToVideoNode
// ===========================================================================
describe("Kling21TextToVideoNode", () => {
  it("metadata", () => {
    expect(Kling21TextToVideoNode.nodeType).toBe(
      "kie.video.Kling21TextToVideo"
    );
    expect(Kling21TextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Kling21TextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (Kling21TextToVideoNode as any)();
    n.assign({ prompt: "A dolphin jumping" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (Kling21TextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 38. Kling21ImageToVideoNode
// ===========================================================================
describe("Kling21ImageToVideoNode", () => {
  it("metadata", () => {
    expect(Kling21ImageToVideoNode.nodeType).toBe(
      "kie.video.Kling21ImageToVideo"
    );
    expect(Kling21ImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Kling21ImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (Kling21ImageToVideoNode as any)();
    n.assign({ prompt: "Animate", image1: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 39. Wan25TextToVideoNode
// ===========================================================================
describe("Wan25TextToVideoNode", () => {
  it("metadata", () => {
    expect(Wan25TextToVideoNode.nodeType).toBe("kie.video.Wan25TextToVideo");
    expect(Wan25TextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Wan25TextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (Wan25TextToVideoNode as any)();
    n.assign({ prompt: "A sunset over the ocean" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (Wan25TextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 40. Wan25ImageToVideoNode
// ===========================================================================
describe("Wan25ImageToVideoNode", () => {
  it("metadata", () => {
    expect(Wan25ImageToVideoNode.nodeType).toBe("kie.video.Wan25ImageToVideo");
    expect(Wan25ImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Wan25ImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (Wan25ImageToVideoNode as any)();
    n.assign({ prompt: "Animate", image1: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 41. WanAnimateNode
// ===========================================================================
describe("WanAnimateNode", () => {
  it("metadata", () => {
    expect(WanAnimateNode.nodeType).toBe("kie.video.WanAnimate");
    expect(WanAnimateNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(WanAnimateNode);
  });

  it("process with image", async () => {
    const n = new (WanAnimateNode as any)();
    n.assign({ prompt: "Bring to life", image: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 42. WanSpeechToVideoNode
// ===========================================================================
describe("WanSpeechToVideoNode", () => {
  it("metadata", () => {
    expect(WanSpeechToVideoNode.nodeType).toBe("kie.video.WanSpeechToVideo");
    expect(WanSpeechToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(WanSpeechToVideoNode);
  });

  it("process with image and audio", async () => {
    const n = new (WanSpeechToVideoNode as any)();
    n.assign({ image: IMG_REF, audio: AUDIO_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
    expect(uploadAudioInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 43. Wan22TextToVideoNode
// ===========================================================================
describe("Wan22TextToVideoNode", () => {
  it("metadata", () => {
    expect(Wan22TextToVideoNode.nodeType).toBe("kie.video.Wan22TextToVideo");
    expect(Wan22TextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Wan22TextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (Wan22TextToVideoNode as any)();
    n.assign({ prompt: "A snow scene" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (Wan22TextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 44. Wan22ImageToVideoNode
// ===========================================================================
describe("Wan22ImageToVideoNode", () => {
  it("metadata", () => {
    expect(Wan22ImageToVideoNode.nodeType).toBe("kie.video.Wan22ImageToVideo");
    expect(Wan22ImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Wan22ImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (Wan22ImageToVideoNode as any)();
    n.assign({ prompt: "Animate", image: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 45. Hailuo02TextToVideoNode
// ===========================================================================
describe("Hailuo02TextToVideoNode", () => {
  it("metadata", () => {
    expect(Hailuo02TextToVideoNode.nodeType).toBe(
      "kie.video.Hailuo02TextToVideo"
    );
    expect(Hailuo02TextToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Hailuo02TextToVideoNode);
  });

  it("process succeeds", async () => {
    const n = new (Hailuo02TextToVideoNode as any)();
    n.assign({ prompt: "A dance" });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
  });

  it("throws on empty prompt", async () => {
    const n = new (Hailuo02TextToVideoNode as any)();
    n.assign({ prompt: "" });
    await expect(n.process()).rejects.toThrow("Prompt is required");
  });
});

// ===========================================================================
// 46. Hailuo02ImageToVideoNode
// ===========================================================================
describe("Hailuo02ImageToVideoNode", () => {
  it("metadata", () => {
    expect(Hailuo02ImageToVideoNode.nodeType).toBe(
      "kie.video.Hailuo02ImageToVideo"
    );
    expect(Hailuo02ImageToVideoNode.title).toBeTruthy();
  });

  it("defaults", () => {
    expectMetadataDefaults(Hailuo02ImageToVideoNode);
  });

  it("process with image", async () => {
    const n = new (Hailuo02ImageToVideoNode as any)();
    n.assign({ prompt: "Animate", image: IMG_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadImageInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// 47. Sora2WatermarkRemoverNode
// ===========================================================================
describe("Sora2WatermarkRemoverNode", () => {
  it("metadata", () => {
    expect(Sora2WatermarkRemoverNode.nodeType).toBe(
      "kie.video.Sora2WatermarkRemover"
    );
    expect(Sora2WatermarkRemoverNode.title).toBeTruthy();
  });

  it("defaults — empty", () => {
    expectMetadataDefaults(Sora2WatermarkRemoverNode);
  });

  it("process with video", async () => {
    const n = new (Sora2WatermarkRemoverNode as any)();
    n.assign({ video: VIDEO_REF });
    const result = await n.process();
    expect(result).toEqual(EXPECTED_OUTPUT);
    expect(uploadVideoInput).toHaveBeenCalled();
  });
});

// ===========================================================================
// Cross-cutting: all 47 nodes have kie.video.* nodeType prefix
// ===========================================================================
describe("All KIE video nodes", () => {
  const allNodeClasses = [
    KlingTextToVideoNode,
    KlingImageToVideoNode,
    KlingAIAvatarStandardNode,
    KlingAIAvatarProNode,
    GrokImagineTextToVideoNode,
    GrokImagineImageToVideoNode,
    SeedanceV1LiteTextToVideoNode,
    SeedanceV1ProTextToVideoNode,
    SeedanceV1LiteImageToVideoNode,
    SeedanceV1ProImageToVideoNode,
    SeedanceV1ProFastImageToVideoNode,
    HailuoTextToVideoProNode,
    HailuoTextToVideoStandardNode,
    HailuoImageToVideoProNode,
    HailuoImageToVideoStandardNode,
    Kling25TurboTextToVideoNode,
    Kling25TurboImageToVideoNode,
    Sora2ProTextToVideoNode,
    Sora2ProImageToVideoNode,
    Sora2ProStoryboardNode,
    Sora2TextToVideoNode,
    WanMultiShotTextToVideoProNode,
    Wan26TextToVideoNode,
    Wan26ImageToVideoNode,
    Wan26VideoToVideoNode,
    TopazVideoUpscaleNode,
    InfinitalkV1Node,
    Veo31TextToVideoNode,
    RunwayGen3AlphaTextToVideoNode,
    RunwayGen3AlphaImageToVideoNode,
    RunwayGen3AlphaExtendVideoNode,
    RunwayAlephVideoNode,
    LumaModifyVideoNode,
    Veo31ImageToVideoNode,
    Veo31ReferenceToVideoNode,
    KlingMotionControlNode,
    Kling21TextToVideoNode,
    Kling21ImageToVideoNode,
    Wan25TextToVideoNode,
    Wan25ImageToVideoNode,
    WanAnimateNode,
    WanSpeechToVideoNode,
    Wan22TextToVideoNode,
    Wan22ImageToVideoNode,
    Hailuo02TextToVideoNode,
    Hailuo02ImageToVideoNode,
    Sora2WatermarkRemoverNode
  ] as any[];

  it("has exactly 47 node classes", () => {
    expect(allNodeClasses.length).toBe(47);
  });

  it.each(allNodeClasses.map((c) => [c.nodeType, c]))(
    "%s starts with kie.video.",
    (_type, cls) => {
      expect(cls.nodeType).toMatch(/^kie\.video\./);
    }
  );

  it.each(allNodeClasses.map((c) => [c.nodeType, c]))(
    "%s has a non-empty title",
    (_type, cls) => {
      expect(typeof cls.title).toBe("string");
      expect(cls.title.length).toBeGreaterThan(0);
    }
  );

  it.each(allNodeClasses.map((c) => [c.nodeType, c]))(
    "%s serialize() returns an object",
    (_type, cls) => {
      const n = new cls();
      const d = n.serialize();
      expect(typeof d).toBe("object");
    }
  );
});
