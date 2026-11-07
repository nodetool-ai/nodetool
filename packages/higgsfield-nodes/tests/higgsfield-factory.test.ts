import { describe, expect, it, vi } from "vitest";
import type { Prediction } from "@nodetool-ai/protocol";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import manifest from "../src/higgsfield-manifest.json";
import { createHiggsfieldNodeClass, type HiggsfieldManifestEntry } from "../src/higgsfield-factory.js";

const CINEMA = "higgsfield/cinema-studio/4.0";
const SOUL = "higgsfield-ai/soul/v2/standard";

function spec(modelId: string): HiggsfieldManifestEntry {
  const entry = (manifest as HiggsfieldManifestEntry[]).find((candidate) => candidate.modelId === modelId);
  if (!entry) throw new Error(`${modelId} is missing from the manifest`);
  return entry;
}

function contextWith(provider: ScriptedProvider): { ctx: ProcessingContext; store: ReturnType<typeof vi.fn> } {
  const store = vi.fn(async (key: string) => `memory://${key}`);
  const storage = { store, retrieve: async () => null, delete: async () => undefined, list: async () => ({ entries: [] }) };
  const ctx = new ProcessingContext({ jobId: "job-1", storage: storage as never });
  ctx.setProviderResolver(() => provider);
  return { ctx, store };
}

describe("Higgsfield node factory", () => {
  it("omits unset optional presets from the submitted payload", async () => {
    const provider = new ScriptedProvider([], { providerId: "higgsfield", endpoints: { [CINEMA]: new Error("stop after submit") } });
    const { ctx } = contextWith(provider);
    const Node = createHiggsfieldNodeClass(spec(CINEMA));
    const node = new Node({ prompt: "A detective walks through rain", genre: "noir" });

    await expect(node.process(ctx)).rejects.toThrow("stop after submit");

    expect(provider.endpointCalls).toHaveLength(1);
    expect(provider.endpointCalls[0]).toMatchObject({
      model: CINEMA,
      input: {
        prompt: "A detective walks through rain",
        duration: 5,
        resolution: "720p",
        aspect_ratio: "16:9",
        generate_audio: true,
        genre: "noir"
      }
    });
    expect(provider.endpointCalls[0]?.route).toBeUndefined();
  });

  it("runs through the generation seam and records a prediction for the model", async () => {
    const provider = new ScriptedProvider([], {
      providerId: "higgsfield",
      endpoints: { [CINEMA]: { output: { status: "completed", video: { url: "https://cdn.example/out.mp4" } }, requestId: "req-1" } },
      downloads: { "https://cdn.example/out.mp4": Uint8Array.from([1, 2]) }
    });
    const { ctx, store } = contextWith(provider);
    const node = new (createHiggsfieldNodeClass(spec(CINEMA)))({ prompt: "Rain" });

    const out = await node.process(ctx);

    const predictions = ctx.getMessages().filter((message): message is Prediction => message.type === "prediction");
    expect(predictions.at(-1)).toMatchObject({ status: "completed", provider: "higgsfield", capability: "text_to_video", model: CINEMA });
    expect(provider.downloadCalls.map((call) => call.url)).toEqual(["https://cdn.example/out.mp4"]);
    expect(store).toHaveBeenCalledWith("higgsfield-video-req-1-0", Uint8Array.from([1, 2]), "video/mp4");
    expect(out).toEqual({ output: { type: "video", uri: "memory://higgsfield-video-req-1-0" } });
  });

  it("uploads inline media through the provider and passes public URLs through", async () => {
    const provider = new ScriptedProvider([], {
      providerId: "higgsfield",
      endpoints: { "alibaba/qwen-image-3/edit": { output: { status: "completed", images: [{ url: "https://cdn.example/out.png" }] } } },
      uploadUrl: (_upload, index) => `https://cdn.example/upload-${index}`,
      downloads: { "https://cdn.example/out.png": Uint8Array.from([3]) }
    });
    const { ctx } = contextWith(provider);
    const node = new (createHiggsfieldNodeClass(spec("alibaba/qwen-image-3/edit")))({
      prompt: "Edit",
      image_urls: [
        { type: "image", uri: "", data: Uint8Array.from([9, 9]), asset_id: null },
        { type: "image", uri: "https://public.example/ref.png", data: null, asset_id: null }
      ]
    });

    await node.process(ctx);

    expect(provider.uploadCalls).toMatchObject([{ bytes: Uint8Array.from([9, 9]), mimeType: "image/png" }]);
    expect(provider.endpointCalls[0]?.input.image_urls).toEqual(["https://cdn.example/upload-1", "https://public.example/ref.png"]);
  });

  it("returns every output of a many-output model, downloaded through the provider", async () => {
    const provider = new ScriptedProvider([], {
      providerId: "higgsfield",
      endpoints: {
        [SOUL]: { output: { status: "completed", images: [{ url: "https://cdn.example/a.png" }, { url: "https://cdn.example/b.png" }] }, requestId: "req-2" }
      },
      downloads: { "https://cdn.example/a.png": Uint8Array.from([1]), "https://cdn.example/b.png": Uint8Array.from([2]) }
    });
    const { ctx } = contextWith(provider);
    const node = new (createHiggsfieldNodeClass(spec(SOUL)))({ prompt: "Portrait" });

    const out = await node.process(ctx);

    expect(out).toEqual({
      output: [
        { type: "image", uri: "memory://higgsfield-image-req-2-0" },
        { type: "image", uri: "memory://higgsfield-image-req-2-1" }
      ]
    });
  });

  it("fails without a processing context instead of reading a key itself", async () => {
    const node = new (createHiggsfieldNodeClass(spec(CINEMA)))({ prompt: "Rain" });
    await expect(node.process()).rejects.toThrow("a processing context is required");
  });
});
