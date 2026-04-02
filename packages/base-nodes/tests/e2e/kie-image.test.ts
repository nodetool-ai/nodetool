import { vi, describe, it, expect, beforeEach } from "vitest";
import { getNodeMetadata } from "@nodetool/node-sdk";

vi.mock("../../src/nodes/kie-base.js", () => ({
  getApiKey: vi.fn(() => "test-api-key"),
  kieExecuteTask: vi.fn(async () => ({
    data: "base64data",
    taskId: "task_123"
  })),
  uploadImageInput: vi.fn(async () => "https://uploaded.example.com/image.png"),
  isRefSet: vi.fn((ref: unknown) => {
    if (!ref || typeof ref !== "object") return false;
    const r = ref as Record<string, unknown>;
    return !!(r.data || r.uri);
  })
}));

import {
  Flux2ProTextToImageNode,
  Flux2ProImageToImageNode,
  Flux2FlexTextToImageNode,
  Flux2FlexImageToImageNode,
  Seedream45TextToImageNode,
  Seedream45EditNode,
  ZImageNode,
  NanoBananaNode,
  NanoBananaProNode,
  FluxKontextNode,
  GrokImagineTextToImageNode,
  GrokImagineUpscaleNode,
  QwenTextToImageNode,
  QwenImageToImageNode,
  TopazImageUpscaleNode,
  RecraftRemoveBackgroundNode,
  IdeogramCharacterNode,
  IdeogramCharacterEditNode,
  IdeogramCharacterRemixNode,
  IdeogramV3ReframeNode,
  RecraftCrispUpscaleNode,
  Imagen4FastNode,
  Imagen4UltraNode,
  Imagen4Node,
  NanoBananaEditNode,
  GPTImage4oTextToImageNode,
  GPTImage4oImageToImageNode,
  GPTImage15TextToImageNode,
  GPTImage15ImageToImageNode,
  IdeogramV3TextToImageNode,
  IdeogramV3ImageToImageNode,
  Seedream40TextToImageNode,
  Seedream40ImageToImageNode,
  KIE_IMAGE_NODES
} from "../../src/nodes/kie-image.js";
import {
  getApiKey,
  kieExecuteTask,
  uploadImageInput,
  isRefSet
} from "../../src/nodes/kie-base.js";

const fakeImage = { data: "abc123", uri: "" };
const fakeImages = [fakeImage];

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

// ============================================================================
// KIE_IMAGE_NODES export
// ============================================================================
describe("KIE_IMAGE_NODES export", () => {
  it("contains all 33 image node classes", () => {
    expect(KIE_IMAGE_NODES).toHaveLength(33);
  });

  it("every entry has a nodeType starting with kie.image.", () => {
    for (const cls of KIE_IMAGE_NODES) {
      expect((cls as any).nodeType).toMatch(/^kie\.image\./);
    }
  });
});

// ============================================================================
// 1. Flux2ProTextToImageNode
// ============================================================================
describe("Flux2ProTextToImageNode", () => {
  it("has correct metadata", () => {
    expect(Flux2ProTextToImageNode.nodeType).toBe(
      "kie.image.Flux2ProTextToImage"
    );
    expect(Flux2ProTextToImageNode.title).toBeDefined();
    expect(Flux2ProTextToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Flux2ProTextToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (Flux2ProTextToImageNode as any)();
    n.assign({
      prompt: "A beautiful sunset",
      aspect_ratio: "16:9",
      resolution: "2K"
    });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "flux-2/pro-text-to-image",
      expect.objectContaining({ prompt: "A beautiful sunset" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Flux2ProTextToImageNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 2. Flux2ProImageToImageNode
// ============================================================================
describe("Flux2ProImageToImageNode", () => {
  it("has correct metadata", () => {
    expect(Flux2ProImageToImageNode.nodeType).toBe(
      "kie.image.Flux2ProImageToImage"
    );
    expect(Flux2ProImageToImageNode.title).toBeDefined();
    expect(Flux2ProImageToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Flux2ProImageToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (Flux2ProImageToImageNode as any)();
    n.assign({ prompt: "Transform this", images: fakeImages });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "flux-2/pro-image-to-image",
      expect.objectContaining({ prompt: "Transform this" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Flux2ProImageToImageNode as any)();
    n.assign({ images: fakeImages });
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 3. Flux2FlexTextToImageNode
// ============================================================================
describe("Flux2FlexTextToImageNode", () => {
  it("has correct metadata", () => {
    expect(Flux2FlexTextToImageNode.nodeType).toBe(
      "kie.image.Flux2FlexTextToImage"
    );
    expect(Flux2FlexTextToImageNode.title).toBeDefined();
    expect(Flux2FlexTextToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Flux2FlexTextToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (Flux2FlexTextToImageNode as any)();
    n.assign({ prompt: "A cat" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "flux-2/flex-text-to-image",
      expect.objectContaining({ prompt: "A cat" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Flux2FlexTextToImageNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 4. Flux2FlexImageToImageNode
// ============================================================================
describe("Flux2FlexImageToImageNode", () => {
  it("has correct metadata", () => {
    expect(Flux2FlexImageToImageNode.nodeType).toBe(
      "kie.image.Flux2FlexImageToImage"
    );
    expect(Flux2FlexImageToImageNode.title).toBeDefined();
    expect(Flux2FlexImageToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Flux2FlexImageToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (Flux2FlexImageToImageNode as any)();
    n.assign({ prompt: "Stylize", images: fakeImages });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "flux-2/flex-image-to-image",
      expect.objectContaining({ prompt: "Stylize" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Flux2FlexImageToImageNode as any)();
    n.assign({ images: fakeImages });
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 5. Seedream45TextToImageNode
// ============================================================================
describe("Seedream45TextToImageNode", () => {
  it("has correct metadata", () => {
    expect(Seedream45TextToImageNode.nodeType).toBe(
      "kie.image.Seedream45TextToImage"
    );
    expect(Seedream45TextToImageNode.title).toBeDefined();
    expect(Seedream45TextToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Seedream45TextToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (Seedream45TextToImageNode as any)();
    n.assign({ prompt: "Landscape" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "seedream/4-5-text-to-image",
      expect.objectContaining({ prompt: "Landscape" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Seedream45TextToImageNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 6. Seedream45EditNode
// ============================================================================
describe("Seedream45EditNode", () => {
  it("has correct metadata", () => {
    expect(Seedream45EditNode.nodeType).toBe("kie.image.Seedream45Edit");
    expect(Seedream45EditNode.title).toBeDefined();
    expect(Seedream45EditNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Seedream45EditNode);
  });

  it("process with valid inputs", async () => {
    const n = new (Seedream45EditNode as any)();
    n.assign({ prompt: "Make brighter", image: fakeImage });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "seedream/4-5-edit",
      expect.objectContaining({ prompt: "Make brighter" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Seedream45EditNode as any)();
    n.assign({ image: fakeImage });
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 7. ZImageNode
// ============================================================================
describe("ZImageNode", () => {
  it("has correct metadata", () => {
    expect(ZImageNode.nodeType).toBe("kie.image.ZImage");
    expect(ZImageNode.title).toBeDefined();
    expect(ZImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(ZImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (ZImageNode as any)();
    n.assign({ prompt: "Robot" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "z-image/turbo",
      expect.objectContaining({ prompt: "Robot" }),
      1500,
      200
    );
  });

  it("passes seed when >= 0", async () => {
    const n = new (ZImageNode as any)();
    n.assign({ prompt: "Robot" });
    (n as any).seed = 42;
    await n.process();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "z-image/turbo",
      expect.objectContaining({ seed: 42 }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (ZImageNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 8. NanoBananaNode
// ============================================================================
describe("NanoBananaNode", () => {
  it("has correct metadata", () => {
    expect(NanoBananaNode.nodeType).toBe("kie.image.NanoBanana");
    expect(NanoBananaNode.title).toBeDefined();
    expect(NanoBananaNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(NanoBananaNode);
  });

  it("process with valid inputs", async () => {
    const n = new (NanoBananaNode as any)();
    n.assign({ prompt: "Banana" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "nano-banana/text-to-image",
      expect.objectContaining({ prompt: "Banana" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (NanoBananaNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 9. NanoBananaProNode
// ============================================================================
describe("NanoBananaProNode", () => {
  it("has correct metadata", () => {
    expect(NanoBananaProNode.nodeType).toBe("kie.image.NanoBananaPro");
    expect(NanoBananaProNode.title).toBeDefined();
    expect(NanoBananaProNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(NanoBananaProNode);
  });

  it("process with valid inputs", async () => {
    const n = new (NanoBananaProNode as any)();
    n.assign({ prompt: "Pro banana" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "nano-banana-pro/text-to-image",
      expect.objectContaining({ prompt: "Pro banana" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (NanoBananaProNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 10. FluxKontextNode
// ============================================================================
describe("FluxKontextNode", () => {
  it("has correct metadata", () => {
    expect(FluxKontextNode.nodeType).toBe("kie.image.FluxKontext");
    expect(FluxKontextNode.title).toBeDefined();
    expect(FluxKontextNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(FluxKontextNode);
  });

  it("process text-only (no images)", async () => {
    const n = new (FluxKontextNode as any)();
    n.assign({ prompt: "Context gen", images: [] });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "flux-kontext/text-to-image",
      expect.objectContaining({ prompt: "Context gen" }),
      1500,
      200
    );
  });

  it("process with images uploads them", async () => {
    const n = new (FluxKontextNode as any)();
    n.assign({ prompt: "Context gen" });
    (n as any).images = fakeImages;
    await n.process();
    expect(uploadImageInput).toHaveBeenCalled();
  });

  it("throws on empty prompt", async () => {
    const n = new (FluxKontextNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 11. GrokImagineTextToImageNode
// ============================================================================
describe("GrokImagineTextToImageNode", () => {
  it("has correct metadata", () => {
    expect(GrokImagineTextToImageNode.nodeType).toBe(
      "kie.image.GrokImagineTextToImage"
    );
    expect(GrokImagineTextToImageNode.title).toBeDefined();
    expect(GrokImagineTextToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(GrokImagineTextToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (GrokImagineTextToImageNode as any)();
    n.assign({ prompt: "Grok it" });
    (n as any).n = 2;
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "grok-imagine/text-to-image",
      expect.objectContaining({ prompt: "Grok it", n: 2 }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (GrokImagineTextToImageNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 12. GrokImagineUpscaleNode
// ============================================================================
describe("GrokImagineUpscaleNode", () => {
  it("has correct metadata", () => {
    expect(GrokImagineUpscaleNode.nodeType).toBe(
      "kie.image.GrokImagineUpscale"
    );
    expect(GrokImagineUpscaleNode.title).toBeDefined();
    expect(GrokImagineUpscaleNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(GrokImagineUpscaleNode);
  });

  it("process with valid inputs", async () => {
    const n = new (GrokImagineUpscaleNode as any)();
    n.assign({ image: fakeImage });
    (n as any).scale_factor = 4;
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "grok-imagine/upscale",
      expect.objectContaining({ scale_factor: 4 }),
      1500,
      200
    );
  });
});

// ============================================================================
// 13. QwenTextToImageNode
// ============================================================================
describe("QwenTextToImageNode", () => {
  it("has correct metadata", () => {
    expect(QwenTextToImageNode.nodeType).toBe("kie.image.QwenTextToImage");
    expect(QwenTextToImageNode.title).toBeDefined();
    expect(QwenTextToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(QwenTextToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (QwenTextToImageNode as any)();
    n.assign({ prompt: "Qwen art" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "qwen/text-to-image",
      expect.objectContaining({ prompt: "Qwen art" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (QwenTextToImageNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 14. QwenImageToImageNode
// ============================================================================
describe("QwenImageToImageNode", () => {
  it("has correct metadata", () => {
    expect(QwenImageToImageNode.nodeType).toBe("kie.image.QwenImageToImage");
    expect(QwenImageToImageNode.title).toBeDefined();
    expect(QwenImageToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(QwenImageToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (QwenImageToImageNode as any)();
    n.assign({ prompt: "Qwen transform", image: fakeImage });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "qwen/image-to-image",
      expect.objectContaining({ prompt: "Qwen transform" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (QwenImageToImageNode as any)();
    n.assign({ image: fakeImage });
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 15. TopazImageUpscaleNode
// ============================================================================
describe("TopazImageUpscaleNode", () => {
  it("has correct metadata", () => {
    expect(TopazImageUpscaleNode.nodeType).toBe("kie.image.TopazImageUpscale");
    expect(TopazImageUpscaleNode.title).toBeDefined();
    expect(TopazImageUpscaleNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(TopazImageUpscaleNode);
  });

  it("process with valid inputs", async () => {
    const n = new (TopazImageUpscaleNode as any)();
    n.assign({ image: fakeImage, upscale_factor: "4" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "topaz/image-upscale",
      expect.objectContaining({ scale_factor: 4 }),
      1500,
      200
    );
  });
});

// ============================================================================
// 16. RecraftRemoveBackgroundNode
// ============================================================================
describe("RecraftRemoveBackgroundNode", () => {
  it("has correct metadata", () => {
    expect(RecraftRemoveBackgroundNode.nodeType).toBe(
      "kie.image.RecraftRemoveBackground"
    );
    expect(RecraftRemoveBackgroundNode.title).toBeDefined();
    expect(RecraftRemoveBackgroundNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(RecraftRemoveBackgroundNode);
  });

  it("process with valid inputs", async () => {
    const n = new (RecraftRemoveBackgroundNode as any)();
    n.assign({ image: fakeImage });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "recraft/remove-background",
      expect.objectContaining({
        image_url: "https://uploaded.example.com/image.png"
      }),
      1500,
      200
    );
  });
});

// ============================================================================
// 17. IdeogramCharacterNode
// ============================================================================
describe("IdeogramCharacterNode", () => {
  it("has correct metadata", () => {
    expect(IdeogramCharacterNode.nodeType).toBe("kie.image.IdeogramCharacter");
    expect(IdeogramCharacterNode.title).toBeDefined();
    expect(IdeogramCharacterNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(IdeogramCharacterNode);
  });

  it("process with valid inputs", async () => {
    const n = new (IdeogramCharacterNode as any)();
    n.assign({ prompt: "A warrior" });
    (n as any).character_description = "Tall elf";
    (n as any).images = fakeImages;
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "ideogram/v3-character",
      expect.objectContaining({ prompt: "A warrior" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (IdeogramCharacterNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 18. IdeogramCharacterEditNode
// ============================================================================
describe("IdeogramCharacterEditNode", () => {
  it("has correct metadata", () => {
    expect(IdeogramCharacterEditNode.nodeType).toBe(
      "kie.image.IdeogramCharacterEdit"
    );
    expect(IdeogramCharacterEditNode.title).toBeDefined();
    expect(IdeogramCharacterEditNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(IdeogramCharacterEditNode);
  });

  it("process with valid inputs (no mask)", async () => {
    const n = new (IdeogramCharacterEditNode as any)();
    n.assign({ prompt: "Edit character", image: fakeImage, mask: null });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "ideogram/v3-character-edit",
      expect.objectContaining({ prompt: "Edit character" }),
      1500,
      200
    );
  });

  it("process with mask uploads mask", async () => {
    const n = new (IdeogramCharacterEditNode as any)();
    n.assign({ prompt: "Edit character", image: fakeImage, mask: fakeImage });
    await n.process();
    // uploadImageInput called for image + mask = at least 2 times
    expect(uploadImageInput).toHaveBeenCalledTimes(2);
  });

  it("throws on empty prompt", async () => {
    const n = new (IdeogramCharacterEditNode as any)();
    n.assign({ image: fakeImage });
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });

  it("process with reference images uploads them", async () => {
    const n = new (IdeogramCharacterEditNode as any)();
    n.assign({
      prompt: "Edit character",
      image: fakeImage,
      reference_images: [fakeImage, fakeImage]
    });
    (n as any).character_description = "A warrior";
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    // image + 2 ref images = 3 uploadImageInput calls
    expect(uploadImageInput).toHaveBeenCalledTimes(3);
  });

  it("process skips null/invalid reference images", async () => {
    const n = new (IdeogramCharacterEditNode as any)();
    n.assign({
      prompt: "Edit character",
      image: fakeImage,
      images: [null, {}, "not-an-object", fakeImage]
    });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
  });
});

// ============================================================================
// 19. IdeogramCharacterRemixNode
// ============================================================================
describe("IdeogramCharacterRemixNode", () => {
  it("has correct metadata", () => {
    expect(IdeogramCharacterRemixNode.nodeType).toBe(
      "kie.image.IdeogramCharacterRemix"
    );
    expect(IdeogramCharacterRemixNode.title).toBeDefined();
    expect(IdeogramCharacterRemixNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(IdeogramCharacterRemixNode);
  });

  it("process with valid inputs", async () => {
    const n = new (IdeogramCharacterRemixNode as any)();
    n.assign({ prompt: "Remix character", image: fakeImage });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "ideogram/v3-character-remix",
      expect.objectContaining({ prompt: "Remix character" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (IdeogramCharacterRemixNode as any)();
    n.assign({ image: fakeImage });
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });

  it("process with reference images uploads them", async () => {
    const n = new (IdeogramCharacterRemixNode as any)();
    n.assign({
      prompt: "Remix character",
      image: fakeImage,
      reference_images: [fakeImage, fakeImage]
    });
    (n as any).character_description = "A wizard";
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    // image + 2 ref images = 3 uploadImageInput calls
    expect(uploadImageInput).toHaveBeenCalledTimes(3);
  });

  it("process skips null/invalid reference images in remix", async () => {
    const n = new (IdeogramCharacterRemixNode as any)();
    n.assign({
      prompt: "Remix",
      image: fakeImage,
      images: [null, {}, fakeImage]
    });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
  });
});

// ============================================================================
// 20. IdeogramV3ReframeNode
// ============================================================================
describe("IdeogramV3ReframeNode", () => {
  it("has correct metadata", () => {
    expect(IdeogramV3ReframeNode.nodeType).toBe("kie.image.IdeogramV3Reframe");
    expect(IdeogramV3ReframeNode.title).toBeDefined();
    expect(IdeogramV3ReframeNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(IdeogramV3ReframeNode);
  });

  it("process with valid inputs", async () => {
    const n = new (IdeogramV3ReframeNode as any)();
    n.assign({ image: fakeImage, resolution: "1024x1024" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "ideogram/v3-reframe",
      expect.objectContaining({
        image_url: "https://uploaded.example.com/image.png"
      }),
      1500,
      200
    );
  });
});

// ============================================================================
// 21. RecraftCrispUpscaleNode
// ============================================================================
describe("RecraftCrispUpscaleNode", () => {
  it("has correct metadata", () => {
    expect(RecraftCrispUpscaleNode.nodeType).toBe(
      "kie.image.RecraftCrispUpscale"
    );
    expect(RecraftCrispUpscaleNode.title).toBeDefined();
    expect(RecraftCrispUpscaleNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(RecraftCrispUpscaleNode);
  });

  it("process with valid inputs", async () => {
    const n = new (RecraftCrispUpscaleNode as any)();
    n.assign({ image: fakeImage });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "recraft/crisp-upscale",
      expect.objectContaining({
        image_url: "https://uploaded.example.com/image.png"
      }),
      1500,
      200
    );
  });
});

// ============================================================================
// 22. Imagen4FastNode
// ============================================================================
describe("Imagen4FastNode", () => {
  it("has correct metadata", () => {
    expect(Imagen4FastNode.nodeType).toBe("kie.image.Imagen4Fast");
    expect(Imagen4FastNode.title).toBeDefined();
    expect(Imagen4FastNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Imagen4FastNode);
  });

  it("process with valid inputs", async () => {
    const n = new (Imagen4FastNode as any)();
    n.assign({ prompt: "Fast image" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "imagen-4/fast",
      expect.objectContaining({ prompt: "Fast image" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Imagen4FastNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 23. Imagen4UltraNode
// ============================================================================
describe("Imagen4UltraNode", () => {
  it("has correct metadata", () => {
    expect(Imagen4UltraNode.nodeType).toBe("kie.image.Imagen4Ultra");
    expect(Imagen4UltraNode.title).toBeDefined();
    expect(Imagen4UltraNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Imagen4UltraNode);
  });

  it("process with valid inputs", async () => {
    const n = new (Imagen4UltraNode as any)();
    n.assign({ prompt: "Ultra image" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "imagen-4/ultra",
      expect.objectContaining({ prompt: "Ultra image" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Imagen4UltraNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 24. Imagen4Node
// ============================================================================
describe("Imagen4Node", () => {
  it("has correct metadata", () => {
    expect(Imagen4Node.nodeType).toBe("kie.image.Imagen4");
    expect(Imagen4Node.title).toBeDefined();
    expect(Imagen4Node.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Imagen4Node);
  });

  it("process with valid inputs", async () => {
    const n = new (Imagen4Node as any)();
    n.assign({ prompt: "Standard image" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "imagen-4/standard",
      expect.objectContaining({ prompt: "Standard image" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Imagen4Node as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 25. NanoBananaEditNode
// ============================================================================
describe("NanoBananaEditNode", () => {
  it("has correct metadata", () => {
    expect(NanoBananaEditNode.nodeType).toBe("kie.image.NanoBananaEdit");
    expect(NanoBananaEditNode.title).toBeDefined();
    expect(NanoBananaEditNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(NanoBananaEditNode);
  });

  it("process with valid inputs (no mask)", async () => {
    const n = new (NanoBananaEditNode as any)();
    n.assign({ prompt: "Edit banana" });
    (n as any).image = fakeImage;
    (n as any).mask = null;
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "nano-banana/edit",
      expect.objectContaining({ prompt: "Edit banana" }),
      1500,
      200
    );
  });

  it("process with mask uploads mask", async () => {
    const n = new (NanoBananaEditNode as any)();
    n.assign({ prompt: "Edit banana" });
    (n as any).image = fakeImage;
    (n as any).mask = fakeImage;
    await n.process();
    // image + mask = 2 uploads
    expect(uploadImageInput).toHaveBeenCalledTimes(2);
  });

  it("throws on empty prompt", async () => {
    const n = new (NanoBananaEditNode as any)();
    (n as any).image = fakeImage;
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 26. GPTImage4oTextToImageNode
// ============================================================================
describe("GPTImage4oTextToImageNode", () => {
  it("has correct metadata", () => {
    expect(GPTImage4oTextToImageNode.nodeType).toBe(
      "kie.image.GPTImage4oTextToImage"
    );
    expect(GPTImage4oTextToImageNode.title).toBeDefined();
    expect(GPTImage4oTextToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(GPTImage4oTextToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (GPTImage4oTextToImageNode as any)();
    n.assign({ prompt: "GPT image" });
    (n as any).quality = "hd";
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "gpt-image-4o/text-to-image",
      expect.objectContaining({ prompt: "GPT image", quality: "hd" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (GPTImage4oTextToImageNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 27. GPTImage4oImageToImageNode
// ============================================================================
describe("GPTImage4oImageToImageNode", () => {
  it("has correct metadata", () => {
    expect(GPTImage4oImageToImageNode.nodeType).toBe(
      "kie.image.GPTImage4oImageToImage"
    );
    expect(GPTImage4oImageToImageNode.title).toBeDefined();
    expect(GPTImage4oImageToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(GPTImage4oImageToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (GPTImage4oImageToImageNode as any)();
    n.assign({ prompt: "Transform GPT", images: fakeImages });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "gpt-image-4o/image-to-image",
      expect.objectContaining({ prompt: "Transform GPT" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (GPTImage4oImageToImageNode as any)();
    n.assign({ images: fakeImages });
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 28. GPTImage15TextToImageNode
// ============================================================================
describe("GPTImage15TextToImageNode", () => {
  it("has correct metadata", () => {
    expect(GPTImage15TextToImageNode.nodeType).toBe(
      "kie.image.GPTImage15TextToImage"
    );
    expect(GPTImage15TextToImageNode.title).toBeDefined();
    expect(GPTImage15TextToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(GPTImage15TextToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (GPTImage15TextToImageNode as any)();
    n.assign({ prompt: "GPT 1.5 image" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "gpt-image-1-5/text-to-image",
      expect.objectContaining({ prompt: "GPT 1.5 image" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (GPTImage15TextToImageNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 29. GPTImage15ImageToImageNode
// ============================================================================
describe("GPTImage15ImageToImageNode", () => {
  it("has correct metadata", () => {
    expect(GPTImage15ImageToImageNode.nodeType).toBe(
      "kie.image.GPTImage15ImageToImage"
    );
    expect(GPTImage15ImageToImageNode.title).toBeDefined();
    expect(GPTImage15ImageToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(GPTImage15ImageToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (GPTImage15ImageToImageNode as any)();
    n.assign({ prompt: "GPT 1.5 transform", images: fakeImages });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "gpt-image-1-5/image-to-image",
      expect.objectContaining({ prompt: "GPT 1.5 transform" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (GPTImage15ImageToImageNode as any)();
    n.assign({ images: fakeImages });
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 30. IdeogramV3TextToImageNode
// ============================================================================
describe("IdeogramV3TextToImageNode", () => {
  it("has correct metadata", () => {
    expect(IdeogramV3TextToImageNode.nodeType).toBe(
      "kie.image.IdeogramV3TextToImage"
    );
    expect(IdeogramV3TextToImageNode.title).toBeDefined();
    expect(IdeogramV3TextToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(IdeogramV3TextToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (IdeogramV3TextToImageNode as any)();
    n.assign({ prompt: "Ideogram art", negative_prompt: "ugly" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "ideogram/v3-text-to-image",
      expect.objectContaining({
        prompt: "Ideogram art",
        negative_prompt: "ugly"
      }),
      1500,
      200
    );
  });

  it("process without negative_prompt omits it", async () => {
    const n = new (IdeogramV3TextToImageNode as any)();
    n.assign({ prompt: "Ideogram art", negative_prompt: "" });
    await n.process();
    const call = (kieExecuteTask as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).not.toHaveProperty("negative_prompt");
  });

  it("throws on empty prompt", async () => {
    const n = new (IdeogramV3TextToImageNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 31. IdeogramV3ImageToImageNode
// ============================================================================
describe("IdeogramV3ImageToImageNode", () => {
  it("has correct metadata", () => {
    expect(IdeogramV3ImageToImageNode.nodeType).toBe(
      "kie.image.IdeogramV3ImageToImage"
    );
    expect(IdeogramV3ImageToImageNode.title).toBeDefined();
    expect(IdeogramV3ImageToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(IdeogramV3ImageToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (IdeogramV3ImageToImageNode as any)();
    n.assign({ prompt: "Ideogram transform", image: fakeImage });
    (n as any).image_weight = 75;
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "ideogram/v3-image-to-image",
      expect.objectContaining({
        prompt: "Ideogram transform",
        image_weight: 75
      }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (IdeogramV3ImageToImageNode as any)();
    n.assign({ image: fakeImage });
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 32. Seedream40TextToImageNode
// ============================================================================
describe("Seedream40TextToImageNode", () => {
  it("has correct metadata", () => {
    expect(Seedream40TextToImageNode.nodeType).toBe(
      "kie.image.Seedream40TextToImage"
    );
    expect(Seedream40TextToImageNode.title).toBeDefined();
    expect(Seedream40TextToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Seedream40TextToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (Seedream40TextToImageNode as any)();
    n.assign({ prompt: "Seedream 4.0" });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "seedream/4-0-text-to-image",
      expect.objectContaining({ prompt: "Seedream 4.0" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Seedream40TextToImageNode as any)();
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});

// ============================================================================
// 33. Seedream40ImageToImageNode
// ============================================================================
describe("Seedream40ImageToImageNode", () => {
  it("has correct metadata", () => {
    expect(Seedream40ImageToImageNode.nodeType).toBe(
      "kie.image.Seedream40ImageToImage"
    );
    expect(Seedream40ImageToImageNode.title).toBeDefined();
    expect(Seedream40ImageToImageNode.description).toBeDefined();
  });

  it("defaults", () => {
    expectMetadataDefaults(Seedream40ImageToImageNode);
  });

  it("process with valid inputs", async () => {
    const n = new (Seedream40ImageToImageNode as any)();
    n.assign({ prompt: "Seedream 4.0 transform", image: fakeImage });
    const result = await n.process();
    expect(result.output).toEqual({ type: "image", data: "base64data" });
    expect(uploadImageInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "seedream/4-0-image-to-image",
      expect.objectContaining({ prompt: "Seedream 4.0 transform" }),
      1500,
      200
    );
  });

  it("throws on empty prompt", async () => {
    const n = new (Seedream40ImageToImageNode as any)();
    n.assign({ image: fakeImage });
    await expect(n.process()).rejects.toThrow("Prompt cannot be empty");
  });
});
