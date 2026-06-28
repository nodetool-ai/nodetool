import { describe, it, expect, vi } from "vitest";
import { Buffer } from "node:buffer";
import { ViewImageTool, ListImagesTool } from "../src/tools/view-image-tool.js";
import {
  extractInjectableImages,
  stripImagePayload,
  IMAGE_CONTENT_FIELD
} from "../src/tools/image-injection.js";
import {
  registerBuiltinTools,
  resetBuiltinToolsRegistration
} from "../src/tools/builtin-tools.js";
import { resolveTool } from "../src/tools/tool-registry.js";
import type { MessageContent } from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

function createMockProvider() {
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessage: vi.fn(),
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    async generateMessageTraced(...args: any[]) {
      return (this as any).generateMessage(...args);
    },
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    isContextLengthError: () => false,
    trackUsage: vi.fn(),
    getTotalCost: vi.fn().mockReturnValue(0),
    resetCost: vi.fn()
  } as any;
}

// 1x1 transparent PNG.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_B64}`;
const TINY_PNG_BYTES = new Uint8Array(Buffer.from(TINY_PNG_B64, "base64"));

function imageContext(bytes: Uint8Array | null) {
  return {
    ...createMockContext(),
    userId: "1",
    resolveAssetBytes: vi.fn(async () => ({
      bytes,
      attempts: [] as string[]
    }))
  } as any;
}

describe("image-injection helpers", () => {
  it("extracts an image_content payload into MessageContent blocks", () => {
    const extracted = extractInjectableImages({
      ok: true,
      note: "Look here",
      [IMAGE_CONTENT_FIELD]: { uri: TINY_PNG_DATA_URI, mimeType: "image/png" }
    });
    expect(extracted).not.toBeNull();
    expect(extracted!.text).toBe("Look here");
    expect(extracted!.images).toHaveLength(1);
    expect(extracted!.images[0]).toMatchObject({
      type: "image_url",
      image: { uri: TINY_PNG_DATA_URI, mimeType: "image/png" }
    });
  });

  it("extracts several images from image_contents", () => {
    const extracted = extractInjectableImages({
      image_contents: [
        { uri: "data:image/png;base64,AAAA" },
        { data: "BBBB", mimeType: "image/jpeg" }
      ]
    });
    expect(extracted!.images).toHaveLength(2);
    expect(extracted!.images[1].image.mimeType).toBe("image/jpeg");
  });

  it("returns null for ordinary results", () => {
    expect(extractInjectableImages({ result: 42 })).toBeNull();
    expect(extractInjectableImages("plain string")).toBeNull();
    expect(extractInjectableImages(null)).toBeNull();
  });

  it("strips the heavy payload but keeps a light note", () => {
    const stripped = stripImagePayload({
      ok: true,
      width: 10,
      [IMAGE_CONTENT_FIELD]: { uri: TINY_PNG_DATA_URI }
    }) as Record<string, unknown>;
    expect(stripped[IMAGE_CONTENT_FIELD]).toBeUndefined();
    expect(stripped.ok).toBe(true);
    expect(stripped.width).toBe(10);
    expect(typeof stripped.note).toBe("string");
  });
});

describe("ViewImageTool", () => {
  it("loads a data: URI into an image_content payload", async () => {
    const tool = new ViewImageTool();
    const result = (await tool.process(imageContext(null), {
      image_id: TINY_PNG_DATA_URI
    })) as Record<string, any>;

    expect(result.ok).toBe(true);
    expect(result.mimeType).toBe("image/png");
    expect(result.image_content.uri).toMatch(/^data:image\/png;base64,/);
    // The loop turns this into an injected image message.
    expect(extractInjectableImages(result)).not.toBeNull();
  });

  it("passes original bytes through unchanged at high detail (no re-encode)", async () => {
    const tool = new ViewImageTool();
    const result = (await tool.process(imageContext(TINY_PNG_BYTES), {
      image_id: "asset://abc123.png",
      detail: "high"
    })) as Record<string, any>;
    // No region/resize → ship the exact source bytes, not a codec re-encode
    // (re-encoding a compressed PNG can bloat it many-fold).
    expect(result.image_content.uri).toBe(
      `data:image/png;base64,${TINY_PNG_B64}`
    );
  });

  it("resolves an asset id via the context", async () => {
    const tool = new ViewImageTool();
    const ctx = imageContext(TINY_PNG_BYTES);
    const result = (await tool.process(ctx, {
      image_id: "asset://abc123.png",
      question: "What is in this image?"
    })) as Record<string, any>;

    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://abc123.png");
    expect(result.ok).toBe(true);
    expect(result.note).toBe("What is in this image?");
    expect(result.image_content.uri).toMatch(/^data:image\//);
  });

  it("crops to a region when sharp is available", async () => {
    const tool = new ViewImageTool();
    const result = (await tool.process(imageContext(null), {
      image_id: TINY_PNG_DATA_URI,
      region: { x: 0, y: 0, width: 1, height: 1 }
    })) as Record<string, any>;
    expect(result.ok).toBe(true);
    // width/height are populated only when the codec ran; the region note is
    // always present.
    expect(result.note).toContain("region 0,0 1×1");
  });

  it("errors on a missing image_id", async () => {
    const tool = new ViewImageTool();
    const result = (await tool.process(imageContext(null), {})) as Record<
      string,
      any
    >;
    expect(result.error).toMatch(/image_id is required/);
  });

  it("errors when an asset cannot be resolved", async () => {
    const tool = new ViewImageTool();
    const result = (await tool.process(imageContext(null), {
      image_id: "asset://missing.png"
    })) as Record<string, any>;
    expect(result.error).toMatch(/Could not load image/);
  });

  it("passes remote URLs through for the provider to fetch", async () => {
    const tool = new ViewImageTool();
    const result = (await tool.process(imageContext(null), {
      image_id: "https://example.com/cat.png"
    })) as Record<string, any>;
    expect(result.ok).toBe(true);
    expect(result.image_content.uri).toBe("https://example.com/cat.png");
  });
});

describe("ListImagesTool", () => {
  it("returns an error envelope when the asset store is unavailable", async () => {
    // No DB in the unit-test runtime → Asset.paginate throws, caught into error.
    const tool = new ListImagesTool();
    const result = (await tool.process(imageContext(null), {})) as Record<
      string,
      any
    >;
    expect(result.error ?? result.images).toBeDefined();
  });
});

describe("builtin registration", () => {
  it("registers view_image and list_images", () => {
    resetBuiltinToolsRegistration();
    const names = registerBuiltinTools();
    expect(names).toContain("view_image");
    expect(names).toContain("list_images");
    expect(resolveTool("view_image")).toBeInstanceOf(ViewImageTool);
    expect(resolveTool("list_images")).toBeInstanceOf(ListImagesTool);
  });
});
