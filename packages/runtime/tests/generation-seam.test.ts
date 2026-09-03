/**
 * `runGeneration` is the one seam every media generation goes through
 * (docs/media-generation-tracking-design.md § 5): one id on every message,
 * origin on `running`, the receipt and the assets on the terminal message,
 * `cancelled` on abort, and never bytes on the wire.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Prediction } from "@nodetool-ai/protocol";
import { ProcessingContext } from "../src/context.js";
import { BaseProvider } from "../src/providers/base-provider.js";
import type {
  Message,
  ProviderStreamItem,
  TextToImageParams
} from "../src/providers/types.js";
import { recordGenerationReceipt } from "../src/generation-receipt.js";
import { generationRegistry } from "../src/generation-registry.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

class ImageProvider extends BaseProvider {
  constructor(
    private readonly behavior: (params: TextToImageParams) => Promise<Uint8Array>
  ) {
    super("fake");
  }
  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    return this.behavior(params);
  }
  async generateMessage(): Promise<Message> {
    throw new Error("not used");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("not used");
  }
}

function predictions(ctx: ProcessingContext): Prediction[] {
  return ctx
    .getMessages()
    .filter((m): m is Prediction => m.type === "prediction");
}

beforeEach(() => generationRegistry.reset());

describe("runGeneration", () => {
  it("emits running then completed with one id and a job origin", async () => {
    const ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.registerProvider("fake", new ImageProvider(async () => PNG));
    const result = await ctx.runGeneration({
      provider: "fake",
      capability: "text_to_image",
      model: "m",
      nodeId: "n1",
      params: { prompt: "a fox" }
    });
    const [running, completed] = predictions(ctx);
    expect(running.status).toBe("running");
    expect(completed.status).toBe("completed");
    expect(running.id).toBe(result.id);
    expect(completed.id).toBe(result.id);
    expect(running.origin).toEqual({
      surface: "workflow",
      job_id: "job-1",
      node_id: "n1"
    });
    expect(completed.asset_ids).toEqual([]);
    expect(completed.data).toBeNull();
    expect(result.output).toBe(PNG);
    expect(result.assets).toEqual([]);
  });

  it("defaults the origin to the chat thread and lets the caller override", async () => {
    const ctx = new ProcessingContext({ jobId: "job-1", threadId: "t-9" });
    ctx.registerProvider("fake", new ImageProvider(async () => PNG));
    await ctx.runGeneration({
      provider: "fake",
      capability: "text_to_image",
      model: "m",
      params: { prompt: "x" },
      origin: { surface: "capability", tool_call_id: "call-3" }
    });
    expect(predictions(ctx)[0].origin).toEqual({
      surface: "capability",
      thread_id: "t-9",
      job_id: "job-1",
      node_id: null,
      tool_call_id: "call-3"
    });
  });

  it("never puts bytes on the wire", async () => {
    const ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.registerProvider("fake", new ImageProvider(async () => PNG));
    await ctx.runGeneration({
      provider: "fake",
      capability: "text_to_image",
      model: "m",
      params: { prompt: "x", images: [new Uint8Array(40)] }
    });
    for (const msg of predictions(ctx)) {
      expect(JSON.stringify(msg)).not.toContain("Uint8Array");
      expect(msg.params).toEqual({ prompt: "x", images: [{ bytes: 40 }] });
      expect(msg.data).toBeNull();
    }
  });

  it("persists the output through createAsset and names the asset", async () => {
    const ctx = new ProcessingContext({ jobId: "job-1" });
    const created: Array<Record<string, unknown>> = [];
    ctx.setModelInterfaces({
      createAsset: async (args) => {
        created.push({ ...args });
        return { id: "asset-1", content_type: args.contentType };
      }
    });
    ctx.registerProvider("fake", new ImageProvider(async () => PNG));
    const result = await ctx.runGeneration({
      provider: "fake",
      capability: "text_to_image",
      model: "m",
      params: { prompt: "x" },
      persist: { name: "fox.png" }
    });
    expect(created).toHaveLength(1);
    expect(created[0].name).toBe("fox.png");
    expect(created[0].contentType).toBe("image/png");
    expect(created[0].metadata).toEqual({ generation_id: result.id });
    expect(result.assets).toEqual([
      {
        type: "image",
        uri: "asset://asset-1.png",
        asset_id: "asset-1",
        metadata: { generation_id: result.id }
      }
    ]);
    expect(predictions(ctx)[1].asset_ids).toEqual(["asset-1"]);
  });

  it("carries the provider's receipt on the completed message", async () => {
    const ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.registerProvider(
      "fake",
      new ImageProvider(async () => {
        recordGenerationReceipt({ provider_request_id: "req-7" });
        recordGenerationReceipt({
          cost: { amount: 0.02, currency: "USD" }
        });
        return PNG;
      })
    );
    const result = await ctx.runGeneration({
      provider: "fake",
      capability: "text_to_image",
      model: "m",
      params: { prompt: "x" }
    });
    expect(result.receipt).toEqual({
      provider_request_id: "req-7",
      cost: { amount: 0.02, currency: "USD" }
    });
    expect(predictions(ctx)[1].receipt).toEqual(result.receipt);
  });

  it("keeps the receipt on a failed message and rethrows the cause", async () => {
    const ctx = new ProcessingContext({ jobId: "job-1" });
    const boom = new Error("provider exploded");
    ctx.registerProvider(
      "fake",
      new ImageProvider(async () => {
        recordGenerationReceipt({ provider_request_id: "req-8" });
        throw boom;
      })
    );
    await expect(
      ctx.runGeneration({
        provider: "fake",
        capability: "text_to_image",
        model: "m",
        params: { prompt: "x" }
      })
    ).rejects.toBe(boom);
    const failed = predictions(ctx)[1];
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("provider exploded");
    expect(failed.receipt).toEqual({ provider_request_id: "req-8" });
  });

  it("emits cancelled when the registry aborts it, and only for the owner", async () => {
    const ctx = new ProcessingContext({ jobId: "job-1", userId: "u1" });
    ctx.registerProvider(
      "fake",
      new ImageProvider(
        (params) =>
          new Promise((_, reject) => {
            params.signal?.addEventListener("abort", () =>
              reject(params.signal?.reason ?? new Error("aborted"))
            );
          })
      )
    );
    const pending = ctx
      .runGeneration({
        provider: "fake",
        capability: "text_to_image",
        model: "m",
        params: { prompt: "x" }
      })
      .catch((error: unknown) => error);
    await new Promise((r) => setTimeout(r, 0));
    const id = predictions(ctx)[0].id;
    expect(generationRegistry.cancel(id, "someone-else")).toBe(false);
    expect(generationRegistry.cancel(id, "u1")).toBe(true);
    expect(await pending).toBeInstanceOf(Error);
    expect(predictions(ctx)[1].status).toBe("cancelled");
    expect((await generationRegistry.wait(id, 10))?.status).toBe("cancelled");
  });

  it("keeps concurrent receipts apart", async () => {
    const ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.registerProvider(
      "fake",
      new ImageProvider(async (params) => {
        await new Promise((r) => setTimeout(r, params.prompt === "a" ? 5 : 1));
        recordGenerationReceipt({ provider_request_id: `req-${params.prompt}` });
        return PNG;
      })
    );
    const [a, b] = await Promise.all([
      ctx.runGeneration({
        provider: "fake",
        capability: "text_to_image",
        model: "m",
        params: { prompt: "a" }
      }),
      ctx.runGeneration({
        provider: "fake",
        capability: "text_to_image",
        model: "m",
        params: { prompt: "b" }
      })
    ]);
    expect(a.receipt?.provider_request_id).toBe("req-a");
    expect(b.receipt?.provider_request_id).toBe("req-b");
  });

  it("runProviderPrediction still returns the raw output", async () => {
    const ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.registerProvider("fake", new ImageProvider(async () => PNG));
    expect(
      await ctx.runProviderPrediction({
        provider: "fake",
        capability: "text_to_image",
        model: "m",
        params: { prompt: "x" }
      })
    ).toBe(PNG);
  });
});
