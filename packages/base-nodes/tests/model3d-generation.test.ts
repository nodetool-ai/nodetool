import { describe, it, expect, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import {
  ImageTo3DNode,
  TextTo3DNode
} from "../src/nodes/model3d/generation.js";
import {
  DEFAULT_IMAGE_TO_3D_MODEL,
  DEFAULT_TEXT_TO_3D_MODEL
} from "../src/nodes/model3d/defaults.js";

function makeContextWithProvider(provider: {
  textTo3D?: ReturnType<typeof vi.fn>;
  imageTo3D?: ReturnType<typeof vi.fn>;
}): ProcessingContext {
  return {
    getProvider: vi.fn().mockResolvedValue(provider)
  } as unknown as ProcessingContext;
}

describe("TextTo3DNode", () => {
  it("calls provider.textTo3D with normalized params and wraps the result", async () => {
    const meshBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]); // "glTF"
    const textTo3D = vi.fn().mockResolvedValue(meshBytes);
    const ctx = makeContextWithProvider({ textTo3D });

    const node = new TextTo3DNode();
    node.assign({
      model: {
        type: "model_3d_model",
        provider: "meshy",
        id: "meshy-4",
        name: "Meshy-4 Text-to-3D",
        supported_tasks: ["text_to_3d"],
        output_formats: ["glb"]
      },
      prompt: "A futuristic spaceship",
      negative_prompt: "blurry",
      art_style: "realistic",
      output_format: "glb",
      seed: 7,
      timeout_seconds: 600
    });

    const result = await node.process(ctx);

    expect(ctx.getProvider).toHaveBeenCalledWith("meshy");
    expect(textTo3D).toHaveBeenCalledTimes(1);
    const params = textTo3D.mock.calls[0]![0];
    expect(params).toMatchObject({
      prompt: "A futuristic spaceship",
      negativePrompt: "blurry",
      artStyle: "realistic",
      outputFormat: "glb",
      seed: 7,
      timeoutSeconds: 600
    });
    expect(params.model).toMatchObject({
      id: "meshy-4",
      provider: "meshy",
      supportedTasks: ["text_to_3d"]
    });

    expect(result).toHaveProperty("output");
    const output = result.output as Record<string, unknown>;
    expect(output.format).toBe("glb");
    expect(typeof output.data).toBe("string"); // base64-encoded
    // round-trip: decode base64 → original bytes
    const decoded = Buffer.from(output.data as string, "base64");
    expect(new Uint8Array(decoded)).toEqual(meshBytes);
  });

  it("normalizes seed=-1 → null and timeout_seconds=0 → null", async () => {
    const textTo3D = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const ctx = makeContextWithProvider({ textTo3D });
    const node = new TextTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4" },
      prompt: "x",
      seed: -1,
      timeout_seconds: 0
    });
    await node.process(ctx);
    const params = textTo3D.mock.calls[0]![0];
    expect(params.seed).toBeNull();
    expect(params.timeoutSeconds).toBeNull();
  });

  it("throws when prompt is empty", async () => {
    const ctx = makeContextWithProvider({ textTo3D: vi.fn() });
    const node = new TextTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4" },
      prompt: ""
    });
    await expect(node.process(ctx)).rejects.toThrow(/Prompt is required/);
  });

  it("throws when output_format is not supported by providers", async () => {
    const ctx = makeContextWithProvider({ textTo3D: vi.fn() });
    const node = new TextTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4" },
      prompt: "x",
      output_format: "stl"
    });
    await expect(node.process(ctx)).rejects.toThrow(
      /output_format must be one of: glb, obj, fbx, usdz/
    );
  });

  it("throws when output_format is not supported by selected model", async () => {
    const ctx = makeContextWithProvider({ textTo3D: vi.fn() });
    const node = new TextTo3DNode();
    node.assign({
      model: {
        type: "model_3d_model",
        provider: "meshy",
        id: "meshy-4",
        output_formats: ["glb"]
      },
      prompt: "x",
      output_format: "obj"
    });
    await expect(node.process(ctx)).rejects.toThrow(
      /does not support output format "obj"/
    );
  });

  it("allows provider-supported non-glb formats with the default model selection", async () => {
    const textTo3D = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const ctx = makeContextWithProvider({ textTo3D });
    const node = new TextTo3DNode();
    node.assign({
      model: DEFAULT_TEXT_TO_3D_MODEL,
      prompt: "x",
      output_format: "obj"
    });

    await expect(node.process(ctx)).resolves.toHaveProperty("output");
    expect(textTo3D.mock.calls[0]![0].outputFormat).toBe("obj");
  });

  it("throws when model has no provider", async () => {
    const ctx = makeContextWithProvider({ textTo3D: vi.fn() });
    const node = new TextTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "", id: "meshy-4" },
      prompt: "x"
    });
    await expect(node.process(ctx)).rejects.toThrow(/missing a provider/);
  });

  it("throws when model has no id", async () => {
    const ctx = makeContextWithProvider({ textTo3D: vi.fn() });
    const node = new TextTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "" },
      prompt: "x"
    });
    await expect(node.process(ctx)).rejects.toThrow(/missing a model id/);
  });

  it("throws when context is missing", async () => {
    const node = new TextTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4" },
      prompt: "x"
    });
    await expect(node.process(undefined)).rejects.toThrow(
      /requires a ProcessingContext/
    );
  });

  it("propagates provider errors", async () => {
    const textTo3D = vi
      .fn()
      .mockRejectedValue(new Error("Meshy task failed: rate limit"));
    const ctx = makeContextWithProvider({ textTo3D });
    const node = new TextTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4" },
      prompt: "x"
    });
    await expect(node.process(ctx)).rejects.toThrow(/rate limit/);
  });
});

describe("ImageTo3DNode", () => {
  it("decodes base64 image data, calls imageTo3D, wraps result", async () => {
    const meshBytes = new Uint8Array([0xab, 0xcd, 0xef]);
    const imageTo3D = vi.fn().mockResolvedValue(meshBytes);
    const ctx = makeContextWithProvider({ imageTo3D });

    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02
    ]);
    const node = new ImageTo3DNode();
    node.assign({
      model: {
        type: "model_3d_model",
        provider: "meshy",
        id: "meshy-4-image"
      },
      image: {
        type: "image",
        uri: "",
        data: Buffer.from(png).toString("base64")
      },
      output_format: "glb",
      seed: 42,
      timeout_seconds: 600
    });

    const result = await node.process(ctx);

    expect(imageTo3D).toHaveBeenCalledTimes(1);
    const [bytesArg, paramsArg] = imageTo3D.mock.calls[0]!;
    expect(bytesArg).toEqual(png);
    expect(paramsArg).toMatchObject({
      outputFormat: "glb",
      seed: 42,
      timeoutSeconds: 600
    });
    expect(paramsArg.model.provider).toBe("meshy");

    const output = result.output as Record<string, unknown>;
    expect(output.format).toBe("glb");
    expect(
      new Uint8Array(Buffer.from(output.data as string, "base64"))
    ).toEqual(meshBytes);
  });

  it("forwards optional prompt only when set", async () => {
    const imageTo3D = vi
      .fn()
      .mockResolvedValue(new Uint8Array([1]));
    const ctx = makeContextWithProvider({ imageTo3D });
    const node = new ImageTo3DNode();
    node.assign({
      model: {
        type: "model_3d_model",
        provider: "rodin",
        id: "rodin-gen-1"
      },
      image: { type: "image", data: Buffer.from([0xff, 0xd8, 0xff]).toString("base64") },
      prompt: "guide me"
    });
    await node.process(ctx);
    expect(imageTo3D.mock.calls[0]![1].prompt).toBe("guide me");
  });

  it("passes null prompt when prompt is empty", async () => {
    const imageTo3D = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const ctx = makeContextWithProvider({ imageTo3D });
    const node = new ImageTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4-image" },
      image: { type: "image", data: Buffer.from([0xff, 0xd8, 0xff]).toString("base64") },
      prompt: ""
    });
    await node.process(ctx);
    expect(imageTo3D.mock.calls[0]![1].prompt).toBeNull();
  });

  it("throws when image is empty", async () => {
    const imageTo3D = vi.fn();
    const ctx = makeContextWithProvider({ imageTo3D });
    const node = new ImageTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4-image" },
      image: { type: "image", uri: "", data: null }
    });
    await expect(node.process(ctx)).rejects.toThrow(
      /Image input has no data or uri|Image input is empty/
    );
    expect(imageTo3D).not.toHaveBeenCalled();
  });

  it("throws when output_format is not supported by providers", async () => {
    const imageTo3D = vi.fn();
    const ctx = makeContextWithProvider({ imageTo3D });
    const node = new ImageTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4-image" },
      image: { type: "image", data: Buffer.from([1]).toString("base64") },
      output_format: "ply"
    });
    await expect(node.process(ctx)).rejects.toThrow(
      /output_format must be one of: glb, obj, fbx, usdz/
    );
  });

  it("throws when output_format is not supported by selected model", async () => {
    const imageTo3D = vi.fn();
    const ctx = makeContextWithProvider({ imageTo3D });
    const node = new ImageTo3DNode();
    node.assign({
      model: {
        type: "model_3d_model",
        provider: "meshy",
        id: "meshy-4-image",
        output_formats: ["glb"]
      },
      image: { type: "image", data: Buffer.from([1]).toString("base64") },
      output_format: "obj"
    });
    await expect(node.process(ctx)).rejects.toThrow(
      /does not support output format "obj"/
    );
  });

  it("allows provider-supported non-glb formats with the default image model selection", async () => {
    const imageTo3D = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const ctx = makeContextWithProvider({ imageTo3D });
    const node = new ImageTo3DNode();
    node.assign({
      model: DEFAULT_IMAGE_TO_3D_MODEL,
      image: { type: "image", data: Buffer.from([0xff, 0xd8, 0xff]).toString("base64") },
      output_format: "obj"
    });

    await expect(node.process(ctx)).resolves.toHaveProperty("output");
    expect(imageTo3D.mock.calls[0]![1].outputFormat).toBe("obj");
  });

  it("resolves storage uri via context.storage", async () => {
    const meshBytes = new Uint8Array([7, 7, 7]);
    const imageTo3D = vi.fn().mockResolvedValue(meshBytes);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const ctx = {
      getProvider: vi.fn().mockResolvedValue({ imageTo3D }),
      storage: {
        retrieve: vi.fn().mockResolvedValue(png)
      }
    } as unknown as ProcessingContext;

    const node = new ImageTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4-image" },
      image: { type: "image", uri: "memory://abc.png" }
    });
    await node.process(ctx);
    expect(
      (ctx as unknown as { storage: { retrieve: ReturnType<typeof vi.fn> } })
        .storage.retrieve
    ).toHaveBeenCalledWith("memory://abc.png");
    expect(imageTo3D.mock.calls[0]![0]).toEqual(png);
  });

  it("throws when context is missing", async () => {
    const node = new ImageTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4-image" },
      image: { type: "image", data: "abc" }
    });
    await expect(node.process(undefined)).rejects.toThrow(
      /requires a ProcessingContext/
    );
  });
});
