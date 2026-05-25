import { describe, it, expect } from "vitest";
import {
  UpscaleImageNode,
  RemoveBackgroundNode,
  RelightImageNode,
  VectorizeImageNode,
  VideoToVideoNode,
  LipSyncNode
} from "../src/index.js";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

function captureContext(output: unknown) {
  const calls: any[] = [];
  return {
    calls,
    context: {
      runProviderPrediction: async (req: any) => {
        calls.push(req);
        return output;
      }
    } as any
  };
}

const imageRefData = { type: "image", data: b64(PNG_BYTES) };
const videoRefData = { type: "video", data: b64(new Uint8Array([1, 2, 3, 4])) };
const audioRefData = { type: "audio", data: b64(new Uint8Array([5, 6, 7, 8])) };

describe("UpscaleImageNode", () => {
  it("routes to the upscale_image capability with scale + image bytes", async () => {
    const { context, calls } = captureContext(PNG_BYTES);
    const n = new (UpscaleImageNode as any)();
    n.assign({
      image: imageRefData,
      scale: 4,
      prompt: "sharp",
      model: { provider: "fal_ai", id: "fal-ai/clarity-upscaler" }
    });
    const result = await n.process(context);

    expect(calls).toHaveLength(1);
    expect(calls[0].capability).toBe("upscale_image");
    expect(calls[0].model).toBe("fal-ai/clarity-upscaler");
    expect(calls[0].params.scale).toBe(4);
    expect(calls[0].params.image).toBeInstanceOf(Uint8Array);
    expect((result.output as any).type).toBe("image");
  });

  it("throws when the input image is empty", async () => {
    const { context } = captureContext(PNG_BYTES);
    const n = new (UpscaleImageNode as any)();
    n.assign({ image: { type: "image" }, model: { provider: "fal_ai", id: "m" } });
    await expect(n.process(context)).rejects.toThrow(/empty/i);
  });
});

describe("RemoveBackgroundNode", () => {
  it("routes to the remove_background capability", async () => {
    const { context, calls } = captureContext(PNG_BYTES);
    const n = new (RemoveBackgroundNode as any)();
    n.assign({
      image: imageRefData,
      model: { provider: "fal_ai", id: "fal-ai/bria/background/remove" }
    });
    const result = await n.process(context);

    expect(calls[0].capability).toBe("remove_background");
    expect(calls[0].params.image).toBeInstanceOf(Uint8Array);
    expect((result.output as any).type).toBe("image");
  });
});

describe("RelightImageNode", () => {
  it("routes to the relight_image capability with prompt", async () => {
    const { context, calls } = captureContext(PNG_BYTES);
    const n = new (RelightImageNode as any)();
    n.assign({
      image: imageRefData,
      prompt: "warm sunset light",
      model: { provider: "fal_ai", id: "fal-ai/image-apps-v2/relighting" }
    });
    const result = await n.process(context);

    expect(calls[0].capability).toBe("relight_image");
    expect(calls[0].params.prompt).toBe("warm sunset light");
    expect((result.output as any).type).toBe("image");
  });
});

describe("VectorizeImageNode", () => {
  it("decodes the provider SVG bytes into an svg element", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const { context, calls } = captureContext(new TextEncoder().encode(svg));
    const n = new (VectorizeImageNode as any)();
    n.assign({
      image: imageRefData,
      model: { provider: "fal_ai", id: "fal-ai/recraft/vectorize" }
    });
    const result = await n.process(context);

    expect(calls[0].capability).toBe("vectorize_image");
    expect((result.output as any).content).toBe(svg);
  });
});

describe("VideoToVideoNode", () => {
  it("routes to the video_to_video capability with strength", async () => {
    const out = new Uint8Array([9, 9, 9]);
    const { context, calls } = captureContext(out);
    const n = new (VideoToVideoNode as any)();
    n.assign({
      video: videoRefData,
      prompt: "make it claymation",
      strength: 0.8,
      model: { provider: "fal_ai", id: "fal-ai/ltx-2-19b/distilled/video-to-video" }
    });
    const result = await n.process(context);

    expect(calls[0].capability).toBe("video_to_video");
    expect(calls[0].params.strength).toBe(0.8);
    expect(calls[0].params.video).toBeInstanceOf(Uint8Array);
    expect((result.output as any).type).toBe("video");
  });
});

describe("LipSyncNode", () => {
  it("routes to the lip_sync capability with both video and audio bytes", async () => {
    const out = new Uint8Array([1, 1, 1]);
    const { context, calls } = captureContext(out);
    const n = new (LipSyncNode as any)();
    n.assign({
      video: videoRefData,
      audio: audioRefData,
      model: { provider: "fal_ai", id: "fal-ai/sync-lipsync/v2" }
    });
    const result = await n.process(context);

    expect(calls[0].capability).toBe("lip_sync");
    expect(calls[0].params.video).toBeInstanceOf(Uint8Array);
    expect(calls[0].params.audio).toBeInstanceOf(Uint8Array);
    expect((result.output as any).type).toBe("video");
  });

  it("throws when the audio is empty", async () => {
    const { context } = captureContext(new Uint8Array([1]));
    const n = new (LipSyncNode as any)();
    n.assign({
      video: videoRefData,
      audio: { type: "audio" },
      model: { provider: "fal_ai", id: "m" }
    });
    await expect(n.process(context)).rejects.toThrow(/empty/i);
  });
});
