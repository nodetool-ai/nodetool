import { describe, it, expect, vi } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import {
  postprocessingArray,
  refToBase64,
  refToBytes,
  reveGenerate
} from "../src/reve-base.js";

describe("refToBytes / refToBase64", () => {
  it("decodes base64 string data", async () => {
    const bytes = await refToBytes({ data: Buffer.from("hi").toString("base64") });
    expect(Buffer.from(bytes).toString()).toBe("hi");
  });

  it("strips a data: URI prefix from inline data", async () => {
    const data = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    const bytes = await refToBytes({ data });
    expect(Buffer.from(bytes).toString()).toBe("png");
  });

  it("decodes a data: URI in the uri field", async () => {
    const uri = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    expect(await refToBase64({ uri })).toBe(Buffer.from("png").toString("base64"));
  });

  it("reads a concrete temporary storage URI without an asset lookup", async () => {
    const retrieve = vi.fn().mockResolvedValue(Uint8Array.from([7, 8, 9]));
    const resolveAssetBytes = vi.fn();
    const uri = "memory://temporary/image.png";
    const bytes = await refToBytes(
      { uri },
      { storage: { retrieve }, resolveAssetBytes } as never
    );
    expect([...bytes]).toEqual([7, 8, 9]);
    expect(retrieve).toHaveBeenCalledWith(uri);
    expect(resolveAssetBytes).not.toHaveBeenCalled();
  });

  it("refuses raw storage fallback when asset resolution has no bytes", async () => {
    const storage = {
      retrieve: vi.fn().mockResolvedValue(Uint8Array.from([7, 8, 9]))
    };
    const ctx = {
      storage,
      resolveAssetBytes: vi.fn().mockResolvedValue({ bytes: null })
    };
    await expect(refToBytes({ uri: "asset://x" }, ctx as never)).rejects.toThrow(
      "Image has no data or URI"
    );
    expect(storage.retrieve).not.toHaveBeenCalled();
  });

  it("falls through a zero-length data buffer to the uri", async () => {
    // `if (r.data)` was truthy for an empty Uint8Array, so a ref carrying an
    // empty buffer alongside a good uri resolved to zero bytes.
    const uri = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    const bytes = await refToBytes({ data: new Uint8Array(0), uri });
    expect(Buffer.from(bytes).toString()).toBe("png");
  });

  it("resolves an asset:// ref via context.resolveAssetBytes when storage returns null", async () => {
    const ctx = {
      storage: { retrieve: vi.fn().mockResolvedValue(null) },
      resolveAssetBytes: vi
        .fn()
        .mockResolvedValue({ bytes: Uint8Array.from([137, 80, 78, 71]) })
    };
    const bytes = await refToBytes(
      { type: "image", uri: "asset://asset-123" },
      ctx
    );
    expect([...bytes]).toEqual([137, 80, 78, 71]);
    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://asset-123", {
      requireOwnedAsset: true
    });
  });

  it("throws without data or uri", async () => {
    await expect(refToBytes({})).rejects.toThrow("Image has no data or URI");
  });
});

describe("postprocessingArray", () => {
  it("maps none to an empty array", () => {
    expect(postprocessingArray("none")).toEqual([]);
    expect(postprocessingArray(undefined)).toEqual([]);
  });
  it("wraps a single operation", () => {
    expect(postprocessingArray("upscale")).toEqual(["upscale"]);
  });
});

describe("reveGenerate", () => {
  function scripted(output: unknown): {
    provider: ScriptedProvider;
    context: ProcessingContext;
  } {
    const provider = new ScriptedProvider([], {
      providerId: "reve",
      endpoints: { "*": { output, requestId: "req_1" } }
    });
    const context = new ProcessingContext({ jobId: "job-1" });
    context.setProviderResolver(() => provider);
    return { provider, context };
  }

  it("calls the provider endpoint for the model and strips empty fields", async () => {
    const { provider, context } = scripted({
      image: "QkFTRTY0",
      request_id: "req_1"
    });

    const res = await reveGenerate(
      context,
      "create",
      // SAFETY: an untyped graph value reaches the body the same way.
      {
        prompt: "a cat",
        aspect_ratio: "3:2",
        postprocessing: [],
        bogus: ""
      } as never,
      "node-1"
    );

    expect(res.image).toBe("QkFTRTY0");
    expect(provider.endpointCalls[0]).toMatchObject({
      model: "reve-create",
      input: { prompt: "a cat", aspect_ratio: "3:2" }
    });
    expect(provider.endpointCalls[0].input).toEqual({
      prompt: "a cat",
      aspect_ratio: "3:2"
    });
    const prediction = context
      .getMessages()
      .filter((m) => m.type === "prediction")
      .at(-1);
    expect(prediction).toMatchObject({
      status: "completed",
      provider: "reve",
      capability: "text_to_image",
      model: "reve-create",
      node_id: "node-1"
    });
  });

  it("throws when the reply has no image", async () => {
    const { context } = scripted({ image: "" });
    await expect(reveGenerate(context, "edit", { edit_instruction: "x" })).rejects.toThrow(
      "Reve returned no image"
    );
  });

  it("forwards the run's cancellation to the provider", async () => {
    const provider = new ScriptedProvider([], {
      providerId: "reve",
      endpoints: { "*": { output: { image: "QkFTRTY0" } } }
    });
    const controller = new AbortController();
    const context = new ProcessingContext({ jobId: "job-1" });
    context.signal = controller.signal;
    context.setProviderResolver(() => provider);
    controller.abort(new Error("cancelled"));
    await expect(reveGenerate(context, "remix", { prompt: "x" })).rejects.toThrow(
      "cancelled"
    );
    expect(provider.endpointCalls[0].signal?.aborted).toBe(true);
  });
});
