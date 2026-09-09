import Replicate from "replicate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AtlasCloudProvider } from "../../src/providers/atlascloud-provider.js";
import { ReplicateProvider } from "../../src/providers/replicate-provider.js";
import { withReplicateRetry } from "../../src/providers/replicate-retry.js";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
const uri = (bytes: Uint8Array, mime: string): string =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
const model = (provider: string, id: string) => ({ provider, id, name: id });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function atlas() {
  const bodies: unknown[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/generateVideo")) {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ data: { id: "job" } });
    }
    if (String(url).includes("/prediction/job")) {
      return Response.json({ data: { status: "completed", outputs: ["https://cdn.atlascloud.ai/result.mp4"] } });
    }
    return new Response(new Uint8Array([9]));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { bodies, fetchMock, provider: new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "test" }) };
}

describe("AtlasCloud reference video requests", () => {
  it.each([
    { images: [png], videos: [] },
    { images: [], videos: [webm] },
    { images: [png, png], videos: [webm, webm] }
  ])("preserves separate reference arrays and video MIME: %j", async (inputs) => {
    const { provider, bodies } = atlas();
    await provider.referenceToVideo(inputs, {
      model: model("atlascloud", "bytedance/seedance-2.0/reference-to-video"),
      prompt: "Use image 1 and video 1",
      negativePrompt: "no text"
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ model: "bytedance/seedance-2.0/reference-to-video", prompt: "Use image 1 and video 1" });
    if (inputs.images.length) expect(bodies[0]).toHaveProperty("reference_images", inputs.images.map((bytes) => uri(bytes, "image/png")));
    else expect(bodies[0]).not.toHaveProperty("reference_images");
    if (inputs.videos.length) expect(bodies[0]).toHaveProperty("reference_videos", inputs.videos.map((bytes) => uri(bytes, "video/webm")));
    else expect(bodies[0]).not.toHaveProperty("reference_videos");
    expect(bodies[0]).not.toHaveProperty("image");
    expect(bodies[0]).not.toHaveProperty("negative_prompt");
  });

  it("groups typed references in the declared mixed array", async () => {
    const { provider, bodies } = atlas();
    await provider.referenceToVideo({ images: [png, png], videos: [webm] }, {
      model: model("atlascloud", "alibaba/wan-3.0/reference-to-video"), prompt: "Keep the cast"
    });
    expect(bodies[0]).toHaveProperty("refers", [
      { url: uri(png, "image/png"), type: "image" },
      { url: uri(png, "image/png"), type: "image" },
      { url: uri(webm, "video/webm"), type: "video" }
    ]);
    expect(bodies[0]).not.toHaveProperty("reference_images");
    expect(bodies[0]).not.toHaveProperty("reference_videos");
  });

  it("maps generic images on a reference endpoint without caller task metadata", async () => {
    const { provider, bodies } = atlas();
    await provider.referenceToVideo({ images: [png], videos: [] }, {
      model: model("atlascloud", "google/veo3.1/reference-to-video"), prompt: "Keep the cast"
    });
    expect(bodies[0]).toHaveProperty("images", [uri(png, "image/png")]);
  });

  it("rejects unsupported kind and forced start-frame calls before network", async () => {
    const { provider, fetchMock } = atlas();
    const selected = model("atlascloud", "google/veo3.1/reference-to-video");
    await expect(provider.referenceToVideo({ images: [png], videos: [webm] }, { model: selected, prompt: "x" })).rejects.toThrow("reference video");
    await expect(provider.imageToVideo(png, { model: selected, prompt: "x" })).rejects.toThrow("does not support image_to_video");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Replicate reference video requests", () => {
  it.each([
    { images: [png], videos: [] },
    { images: [], videos: [webm] },
    { images: [png, png], videos: [webm, webm] }
  ])("maps the full typed request without source fields: %j", async (inputs) => {
    const run = vi.spyOn(Replicate.prototype, "run").mockResolvedValue(["data:video/mp4;base64,CQ=="]);
    const provider = new ReplicateProvider({ REPLICATE_API_TOKEN: "test" });
    const controller = new AbortController();
    await expect(provider.referenceToVideo(inputs, {
      model: model("replicate", "wan-video/wan-2.7-r2v"), prompt: "Keep the cast",
      signal: controller.signal
    })).resolves.toEqual(new Uint8Array([9]));
    expect(run).toHaveBeenCalledWith("wan-video/wan-2.7-r2v", {
      input: {
        prompt: "Keep the cast",
        ...(inputs.images.length ? { reference_images: inputs.images.map((bytes) => uri(bytes, "image/png")) } : {}),
        ...(inputs.videos.length ? { reference_videos: inputs.videos.map((bytes) => uri(bytes, "video/webm")) } : {})
      },
      signal: expect.any(AbortSignal)
    });
  });

  it("rejects video references for an image-only model before SDK submission", async () => {
    const run = vi.spyOn(Replicate.prototype, "run");
    const provider = new ReplicateProvider({ REPLICATE_API_TOKEN: "test" });
    await expect(provider.referenceToVideo({ images: [png], videos: [webm] }, {
      model: model("replicate", "xai/grok-imagine-r2v"), prompt: "x"
    })).rejects.toThrow("does not support reference videos");
    expect(run).not.toHaveBeenCalled();
  });

  it("does not submit an already cancelled reference request", async () => {
    const run = vi.spyOn(Replicate.prototype, "run");
    const provider = new ReplicateProvider({ REPLICATE_API_TOKEN: "test" });
    await expect(provider.referenceToVideo({ images: [png], videos: [] }, {
      model: model("replicate", "wan-video/wan-2.7-r2v"), prompt: "x", signal: AbortSignal.abort()
    })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it("cancels rate-limit waits before another billable submission", async () => {
    const controller = new AbortController();
    const run = vi.fn(async () => {
      controller.abort();
      throw { response: { status: 429 } };
    });
    await expect(withReplicateRetry("test", run, controller.signal)).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
