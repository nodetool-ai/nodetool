import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createAtlasNodeClass,
  resolveAssetForAtlas,
  type AtlasManifestEntry
} from "../src/atlascloud-factory.js";

// ---------------------------------------------------------------------------
// resolveAssetForAtlas
// ---------------------------------------------------------------------------
describe("resolveAssetForAtlas", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("passes a public https URL through unchanged", async () => {
    const out = await resolveAssetForAtlas(
      { uri: "https://example.com/a.png" },
      undefined,
      "image"
    );
    expect(out).toBe("https://example.com/a.png");
  });

  it("packages inline base64 data into a data: URI with a guessed mime", async () => {
    const out = await resolveAssetForAtlas(
      { uri: "asset/image.jpg", data: "aGVsbG8=" },
      undefined,
      "image"
    );
    expect(out).toBe("data:image/jpeg;base64,aGVsbG8=");
  });

  it("uses context.storage to materialize internal URIs", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const storage = { retrieve: vi.fn().mockResolvedValue(bytes) };
    const out = await resolveAssetForAtlas(
      { uri: "/api/storage/x.png" },
      { storage } as unknown as never,
      "image"
    );
    expect(storage.retrieve).toHaveBeenCalledWith("/api/storage/x.png");
    expect(out).toBe("data:image/png;base64,AQID");
  });

  it("rejects localhost URLs (treated as not-public)", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    // localhost falls through to the fetch branch since context.storage is
    // unset; the fetch will be attempted. Pretend the URL is reachable but
    // assert it's not treated as a public URL (so we'd need to fetch bytes).
    global.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([7]).buffer
    })) as unknown as typeof fetch;
    const out = await resolveAssetForAtlas(
      { uri: "http://localhost:7777/a.png" },
      undefined,
      "image"
    );
    // The URI got fetched (treated as private), so the result is a data URI,
    // not the raw URL. This proves looksLikePublicUrl rejected localhost.
    expect(out).toBe("data:image/png;base64,Bw==");
  });

  it("returns null for an empty/null ref", async () => {
    expect(await resolveAssetForAtlas(null, undefined, "image")).toBeNull();
    expect(await resolveAssetForAtlas(undefined, undefined, "image")).toBeNull();
  });

  it("passes through a bare-string public URL", async () => {
    expect(
      await resolveAssetForAtlas("https://x.com/y.png", undefined, "image")
    ).toBe("https://x.com/y.png");
  });

  it("returns null for a bare-string non-URL", async () => {
    expect(await resolveAssetForAtlas("nope", undefined, "image")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createAtlasNodeClass — process() end-to-end
// ---------------------------------------------------------------------------
describe("createAtlasNodeClass.process", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function makeSpec(overrides: Partial<AtlasManifestEntry> = {}): AtlasManifestEntry {
    return {
      className: "TestNode",
      moduleName: "image",
      modality: "image",
      modelId: "test/model/t2i",
      outputType: "image",
      title: "Test",
      description: "Test node",
      pollInterval: 0,
      maxAttempts: 5,
      fields: [
        { name: "prompt", type: "str", default: "", required: true },
        {
          name: "size",
          type: "enum",
          default: "1024x1024",
          values: ["512x512", "1024x1024"]
        },
        { name: "steps", type: "int", default: 20 }
      ],
      ...overrides
    };
  }

  it("declares the standard provider statics on the generated class", () => {
    const Cls = createAtlasNodeClass(makeSpec()) as unknown as {
      nodeType: string;
      title: string;
      requiredSettings: string[];
      autoSaveAsset: boolean;
      exposeAsTool: boolean;
      metadataOutputTypes: Record<string, string>;
    };
    expect(Cls.nodeType).toBe("atlascloud.image.TestNode");
    expect(Cls.title).toBe("Test");
    expect(Cls.requiredSettings).toEqual(["ATLASCLOUD_API_KEY"]);
    expect(Cls.autoSaveAsset).toBe(true);
    expect(Cls.exposeAsTool).toBe(true);
    expect(Cls.metadataOutputTypes).toEqual({ output: "image" });
  });

  it("submits, polls, downloads, and persists via storage", async () => {
    const submitted: { url: string; body: unknown } = { url: "", body: null };
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/generateImage")) {
        submitted.url = u;
        submitted.body = JSON.parse(init!.body as string);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: { id: "pid-1" } })
        } as Response;
      }
      if (u.includes("/prediction/pid-1")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              data: { status: "completed", outputs: ["https://cdn/out.png"] }
            })
        } as Response;
      }
      if (u === "https://cdn/out.png") {
        return {
          ok: true,
          arrayBuffer: async () => Uint8Array.from([0x89, 0x50]).buffer
        } as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    const Cls = createAtlasNodeClass(makeSpec()) as unknown as new () => {
      _dyn: Record<string, unknown>;
      prompt: string;
      size: string;
      steps: number;
      process: (ctx: unknown) => Promise<Record<string, unknown>>;
    };
    const node = new Cls();
    // BaseNode hands secrets via the `_secrets` accessor backed by dynamic
    // state; populate the backing slot directly. (See base-node.ts.)
    (node as unknown as { setDynamic: (k: string, v: unknown) => void }).setDynamic(
      "_secrets",
      { ATLASCLOUD_API_KEY: "tk" }
    );
    node.prompt = "a cat";
    node.size = "1024x1024";
    // UI sends ints as strings — make sure coercion kicks in.
    (node as unknown as Record<string, unknown>).steps = "30";

    const storage = {
      store: vi
        .fn()
        .mockResolvedValue("memory://atlascloud-image-x.png")
    };

    const out = await node.process({ storage });

    expect(submitted.url).toBe(
      "https://api.atlascloud.ai/api/v1/model/generateImage"
    );
    // FLAT body — no nesting under `input`.
    expect(submitted.body).toEqual({
      model: "test/model/t2i",
      prompt: "a cat",
      size: "1024x1024",
      steps: 30
    });
    expect(storage.store).toHaveBeenCalledTimes(1);
    expect(out).toEqual({
      output: { type: "image", uri: "memory://atlascloud-image-x.png" }
    });
  });

  it("wraps a single-image field with array:true into [url]", async () => {
    const submitted: { body: unknown } = { body: null };
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/generateImage")) {
        submitted.body = JSON.parse(init!.body as string);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: { id: "p" } })
        } as Response;
      }
      if (u.includes("/prediction/p")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              data: { status: "completed", outputs: ["https://cdn/out.png"] }
            })
        } as Response;
      }
      if (u === "https://cdn/out.png") {
        return {
          ok: true,
          arrayBuffer: async () => Uint8Array.from([1]).buffer
        } as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    const Cls = createAtlasNodeClass(
      makeSpec({
        fields: [
          { name: "prompt", type: "str", default: "" },
          {
            name: "images",
            type: "image",
            array: true,
            default: null,
            required: true
          }
        ]
      })
    ) as unknown as new () => {
      prompt: string;
      images: unknown;
      process: (ctx: unknown) => Promise<Record<string, unknown>>;
      setDynamic: (k: string, v: unknown) => void;
    };
    const node = new Cls();
    node.setDynamic("_secrets", { ATLASCLOUD_API_KEY: "tk" });
    node.prompt = "edit this";
    node.images = { uri: "https://input/cat.jpg" };

    await node.process({ storage: null });

    expect(submitted.body).toEqual({
      model: "test/model/t2i",
      prompt: "edit this",
      // array: true should have wrapped the single ref into a one-element array
      images: ["https://input/cat.jpg"]
    });
  });

  it("resolves list[image] fields element-by-element", async () => {
    const submitted: { body: unknown } = { body: null };
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/generateVideo")) {
        submitted.body = JSON.parse(init!.body as string);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: { id: "v" } })
        } as Response;
      }
      if (u.includes("/prediction/v")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              data: { status: "completed", outputs: ["https://cdn/out.mp4"] }
            })
        } as Response;
      }
      if (u === "https://cdn/out.mp4") {
        return {
          ok: true,
          arrayBuffer: async () => Uint8Array.from([1, 2]).buffer
        } as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    const Cls = createAtlasNodeClass(
      makeSpec({
        modality: "video",
        outputType: "video",
        fields: [
          { name: "prompt", type: "str", default: "" },
          {
            name: "reference_images",
            type: "list[image]",
            default: null
          }
        ]
      })
    ) as unknown as new () => {
      prompt: string;
      reference_images: unknown;
      process: (ctx: unknown) => Promise<Record<string, unknown>>;
      setDynamic: (k: string, v: unknown) => void;
    };
    const node = new Cls();
    node.setDynamic("_secrets", { ATLASCLOUD_API_KEY: "tk" });
    node.prompt = "compose";
    node.reference_images = [
      { uri: "https://a/1.jpg" },
      { uri: "https://b/2.png" }
    ];

    const out = await node.process({ storage: null });

    expect(submitted.body).toEqual({
      model: "test/model/t2i",
      prompt: "compose",
      reference_images: ["https://a/1.jpg", "https://b/2.png"]
    });
    // No storage given → output is a base64-embedded video ref.
    expect((out.output as Record<string, unknown>).type).toBe("video");
    expect((out.output as Record<string, unknown>).uri).toBe("");
    expect((out.output as Record<string, unknown>).data).toBeTruthy();
  });

  it("propagates structured AtlasCloud job failures", async () => {
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/generateImage")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: { id: "p" } })
        } as Response;
      }
      if (u.includes("/prediction/p")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              data: { status: "failed", error: "moderation flagged" }
            })
        } as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    const Cls = createAtlasNodeClass(makeSpec()) as unknown as new () => {
      prompt: string;
      size: string;
      steps: number;
      process: (ctx: unknown) => Promise<unknown>;
      setDynamic: (k: string, v: unknown) => void;
    };
    const node = new Cls();
    node.setDynamic("_secrets", { ATLASCLOUD_API_KEY: "tk" });
    node.prompt = "x";
    node.size = "1024x1024";
    node.steps = 1;

    await expect(node.process({ storage: null })).rejects.toThrow(
      "AtlasCloud job failed: moderation flagged"
    );
  });
});
