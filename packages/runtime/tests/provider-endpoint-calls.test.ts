/**
 * Endpoint calls: the raw vendor call on `BaseProvider` and the one context
 * entry point node packs use for it (docs/plans/provider-endpoint-interface.md).
 * `callProviderEndpoint` must open exactly one generation record, none inside
 * an enclosing seam, forward cancellation, and fill the request id from the
 * receipt. No test reaches the network: the provider is scripted and the
 * default download's fetch is mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prediction } from "@nodetool-ai/protocol";
import { ProcessingContext } from "../src/context.js";
import { BaseProvider } from "../src/providers/base-provider.js";
import { ScriptedProvider } from "../src/providers/scripted-provider.js";
import { recordGenerationReceipt } from "../src/generation-receipt.js";
import { generationRegistry } from "../src/generation-registry.js";
import { fetchExternalMedia } from "../src/external-media-fetch.js";
import type { Message, ProviderStreamItem } from "../src/providers/types.js";

vi.mock("../src/external-media-fetch.js", () => ({
  fetchExternalMedia: vi.fn(),
  privateMediaFetchAllowed: () => false
}));

const fetchMock = vi.mocked(fetchExternalMedia);

class PlainProvider extends BaseProvider {
  constructor() {
    super("plain");
  }
  async generateMessage(): Promise<Message> {
    throw new Error("not used");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("not used");
  }
}

const FLUX = "fal-ai/flux/dev";
const OUTPUT = { images: [{ url: "https://cdn.example/out.png" }] };

function predictions(ctx: ProcessingContext): Prediction[] {
  return ctx
    .getMessages()
    .filter((m): m is Prediction => m.type === "prediction");
}

function contextWith(provider: BaseProvider): ProcessingContext {
  const ctx = new ProcessingContext({ jobId: "job-1" });
  ctx.setProviderResolver(() => provider);
  return ctx;
}

beforeEach(() => {
  generationRegistry.reset();
  fetchMock.mockReset();
});

describe("BaseProvider endpoint defaults", () => {
  it("does not claim endpoint support and refuses calls and uploads", async () => {
    const provider = new PlainProvider();
    expect(provider.supportsEndpointCalls()).toBe(false);
    await expect(
      provider.callEndpoint({ model: FLUX, input: {} })
    ).rejects.toThrow("plain does not support endpoint calls");
    await expect(
      provider.uploadMedia({ bytes: new Uint8Array([1]), mimeType: "image/png" })
    ).rejects.toThrow("plain does not support media uploads");
  });

  it("downloads through fetchExternalMedia and forwards the signal", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([7, 8, 9])));
    const controller = new AbortController();

    const bytes = await new PlainProvider().downloadMedia(
      "https://cdn.example/out.png",
      controller.signal
    );

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([7, 8, 9]);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://cdn.example/out.png",
      { signal: controller.signal }
    );
  });

  it("passes no init without a signal and fails on an HTTP error", async () => {
    fetchMock.mockResolvedValue(new Response("gone", { status: 404 }));

    await expect(
      new PlainProvider().downloadMedia("https://cdn.example/missing.png")
    ).rejects.toThrow("plain media download failed: HTTP 404");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://cdn.example/missing.png",
      undefined
    );
  });
});

describe("ProcessingContext.callProviderEndpoint", () => {
  it("opens exactly one generation record through the seam", async () => {
    const provider = new ScriptedProvider([], {
      providerId: "fal_ai",
      endpoints: { [FLUX]: { output: OUTPUT, metadata: { credits: 2 } } }
    });
    const ctx = contextWith(provider);

    const result = await ctx.callProviderEndpoint({
      provider: "fal_ai",
      capability: "text_to_image",
      model: FLUX,
      input: { prompt: "a fox" },
      route: "queue",
      nodeId: "node-1"
    });

    expect(result).toEqual({
      output: OUTPUT,
      requestId: "scripted-request-1",
      metadata: { credits: 2 }
    });
    const messages = predictions(ctx);
    expect(messages.map((m) => m.status)).toEqual(["running", "completed"]);
    expect(new Set(messages.map((m) => m.id)).size).toBe(1);
    for (const message of messages) {
      expect(message).toMatchObject({
        provider: "fal_ai",
        capability: "text_to_image",
        model: FLUX,
        node_id: "node-1",
        params: { prompt: "a fox" },
        origin: { surface: "workflow", node_id: "node-1" }
      });
    }
    expect(messages[1].data).toEqual(OUTPUT);
    expect(messages[1].receipt).toEqual({
      provider_request_id: "scripted-request-1"
    });
    expect(provider.endpointCalls).toHaveLength(1);
    expect(provider.endpointCalls[0]).toMatchObject({
      model: FLUX,
      input: { prompt: "a fox" },
      route: "queue"
    });
    expect(provider.endpointCalls[0].signal).toBeInstanceOf(AbortSignal);
  });

  // MiniMax answers with hex audio and Together with base64 images. The node
  // needs the whole reply, but every listener receives the message.
  it("redacts large vendor payloads on the prediction message only", async () => {
    const audio = "ab".repeat(50_000);
    const reply = {
      data: { audio, status: 2 },
      trace_id: "t-1",
      image: `data:image/png;base64,${"A".repeat(100)}`
    };
    const provider = new ScriptedProvider([], {
      providerId: "minimax",
      endpoints: { "speech-02-hd": { output: reply } }
    });
    const ctx = contextWith(provider);

    const result = await ctx.callProviderEndpoint({
      provider: "minimax",
      capability: "text_to_speech",
      model: "speech-02-hd",
      input: { text: "hello" }
    });

    expect(result.output).toEqual(reply);
    const completed = predictions(ctx).find((m) => m.status === "completed");
    expect(completed?.data).toEqual({
      data: { audio: { truncated: true, length: audio.length }, status: 2 },
      trace_id: "t-1",
      image: { bytes: reply.image.length, truncated: true }
    });
  });

  it("fills requestId from the receipt when the provider leaves it null", async () => {
    const provider = new ScriptedProvider([], {
      endpoints: {
        [FLUX]: () => {
          recordGenerationReceipt({ provider_request_id: "vendor-42" });
          return { output: OUTPUT, requestId: null };
        }
      }
    });
    const ctx = contextWith(provider);

    const result = await ctx.callProviderEndpoint({
      provider: "fal_ai",
      capability: "text_to_image",
      model: FLUX,
      input: {}
    });

    expect(result.requestId).toBe("vendor-42");
    expect(predictions(ctx)[1].receipt).toEqual({
      provider_request_id: "vendor-42"
    });
  });

  it.each([
    ["an ephemeral seam", undefined],
    [
      "a seam with provider request options",
      { webhookUrl: "https://hooks.example/fal" }
    ]
  ])("opens no second record inside %s", async (_label, options) => {
    const accepted = vi.fn().mockResolvedValue(options);
    const ctx = new ProcessingContext({
      jobId: "job-1",
      generationLifecycle: { onGenerationAccepted: accepted }
    });
    const provider = new ScriptedProvider([], {
      endpoints: { [FLUX]: { output: OUTPUT, requestId: null } }
    });
    ctx.setProviderResolver(() => provider);
    const caller = new AbortController();

    const outer = await ctx.runGenerationWith(
      { provider: "outer", capability: "text_to_video", model: "outer-model" },
      async () => {
        recordGenerationReceipt({ provider_request_id: "outer-request" });
        return ctx.callProviderEndpoint({
          provider: "fal_ai",
          capability: "text_to_image",
          model: FLUX,
          input: {},
          signal: caller.signal
        });
      },
      { withoutProvider: true }
    );

    expect(outer.output.requestId).toBe("outer-request");
    expect(accepted).toHaveBeenCalledTimes(1);
    const messages = predictions(ctx);
    expect(messages.map((m) => [m.provider, m.status])).toEqual([
      ["outer", "running"],
      ["outer", "completed"]
    ]);
    expect(provider.endpointCalls[0].signal).toBe(caller.signal);
  });

  it("forwards the caller's abort signal and records the cancellation", async () => {
    const seen: AbortSignal[] = [];
    const provider = new ScriptedProvider([], {
      endpoints: {
        [FLUX]: (request) =>
          new Promise((_resolve, reject) => {
            const signal = request.signal;
            if (!signal) {
              reject(new Error("no signal"));
              return;
            }
            seen.push(signal);
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true
            });
          })
      }
    });
    const ctx = contextWith(provider);
    const caller = new AbortController();

    const call = ctx.callProviderEndpoint({
      provider: "fal_ai",
      capability: "text_to_image",
      model: FLUX,
      input: {},
      signal: caller.signal
    });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    caller.abort(new Error("stopped by caller"));

    await expect(call).rejects.toThrow("stopped by caller");
    expect(seen[0].aborted).toBe(true);
    expect(predictions(ctx).map((m) => m.status)).toEqual([
      "running",
      "cancelled"
    ]);
  });

  it.each([
    ["the default methods", () => new PlainProvider(), "plain"],
    ["a scripted provider without endpoint replies", () => new ScriptedProvider([], {}), "fake"]
  ])(
    "refuses a provider without endpoint support (%s) before opening a record",
    async (_label, make, id) => {
      const ctx = contextWith(make());

      await expect(
        ctx.callProviderEndpoint({
          provider: "fal_ai",
          capability: "text_to_image",
          model: FLUX,
          input: {}
        })
      ).rejects.toThrow(`${id} does not support endpoint calls`);
      expect(predictions(ctx)).toEqual([]);
    }
  );
});

describe("ProcessingContext provider media", () => {
  it("uploads and downloads through the resolved provider", async () => {
    const provider = new ScriptedProvider([], {
      downloads: { "https://cdn.example/out.png": new Uint8Array([4, 2]) }
    });
    const resolver = vi.fn(() => provider);
    const ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.setProviderResolver(resolver);

    const url = await ctx.uploadProviderMedia({
      provider: "fal_ai",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      filename: "in.png"
    });
    const downloaded = await ctx.downloadProviderMedia({
      provider: "fal_ai",
      url: "https://cdn.example/out.png"
    });

    expect(url).toBe("https://scripted.invalid/uploads/1/in.png");
    expect([...downloaded]).toEqual([4, 2]);
    expect(resolver).toHaveBeenCalledExactlyOnceWith("fal_ai");
    expect(provider.uploadCalls).toEqual([
      {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/png",
        filename: "in.png",
        url
      }
    ]);
    expect(provider.downloadCalls).toEqual([
      { url: "https://cdn.example/out.png" }
    ]);
    expect(predictions(ctx)).toEqual([]);
  });
});
