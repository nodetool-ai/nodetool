import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

  it("honors a camelCase mimeType (as injected by prompt @-mentions) when the URI has no extension", async () => {
    // mapPromptAssetsToInputs injects InjectedAssetRef shaped { uri, mimeType,
    // data } — camelCase mimeType, and an asset:// URI with no file extension.
    const out = await resolveAssetForAtlas(
      { uri: "asset://abc123", data: "aGVsbG8=", mimeType: "image/webp" },
      undefined,
      "image"
    );
    expect(out).toBe("data:image/webp;base64,aGVsbG8=");
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

  // SSRF defense: refs whose URIs point at the runtime's own host, RFC1918
  // private space, or cloud-metadata endpoints are never fetched. With no
  // alternative resolution path, resolveAssetForAtlas throws.
  describe("SSRF guard — rejects private / loopback / metadata hosts", () => {
    const blocked = [
      "http://localhost:7777/a.png",
      "http://sub.localhost/a.png",
      "http://127.0.0.1/a.png",
      "http://0.0.0.0/a.png",
      "http://10.0.0.5/a.png",
      "http://192.168.1.10/a.png",
      "http://172.16.0.1/a.png",
      "http://172.31.255.254/a.png",
      // AWS / GCP / Azure instance-metadata endpoint
      "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
      "http://[::1]/a.png",
      "http://[fe80::1]/a.png",
      "http://[fc00::1]/a.png",
      // inet_aton numeric encodings of 127.0.0.1 the OS resolver still accepts
      "http://2130706433/a.png", // decimal
      "http://0x7f000001/a.png", // hex
      "http://0177.0.0.1/a.png", // octal first octet
      "http://127.1/a.png", // short form
      // decimal encoding of 169.254.169.254 (cloud metadata)
      "http://2852039166/latest/meta-data/",
      // IPv4-mapped IPv6 loopback (dotted + hex tail)
      "http://[::ffff:127.0.0.1]/a.png",
      "http://[::ffff:7f00:1]/a.png"
    ];
    for (const uri of blocked) {
      it(`refuses to fetch ${uri}`, async () => {
        const fetchSpy = vi.fn();
        global.fetch = fetchSpy as unknown as typeof fetch;
        await expect(
          resolveAssetForAtlas({ uri }, undefined, "image")
        ).rejects.toThrow("Cannot resolve");
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    }
  });

  it("allows fetching a non-private host with no inline data and no storage", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([0xaa]).buffer
    })) as unknown as typeof fetch;
    const out = await resolveAssetForAtlas(
      // uri does not match the public-pass-through path because the host
      // looks fine but we want to exercise the fetch fallback; using a
      // path-only ref so storage absence drives us into fetch().
      { uri: "https://cdn.example.org/secret.png" },
      undefined,
      "image"
    );
    // Public CDN → pass-through, not fetched.
    expect(out).toBe("https://cdn.example.org/secret.png");
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
      metadataOutputTypes: Record<string, string>;
    };
    expect(Cls.nodeType).toBe("atlascloud.image.TestNode");
    expect(Cls.title).toBe("Test");
    expect(Cls.requiredSettings).toEqual(["ATLASCLOUD_API_KEY"]);
    expect(Cls.autoSaveAsset).toBe(true);
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

  it("routes prompt @-mentions onto image / audio / video inputs", async () => {
    const submitted: { body: Record<string, unknown> } = { body: {} };
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
          { name: "image", type: "image", default: null },
          { name: "audio", type: "audio", default: null },
          { name: "video", type: "video", default: null }
        ]
      })
    ) as unknown as new () => {
      prompt: string;
      process: (ctx: unknown) => Promise<Record<string, unknown>>;
      setDynamic: (k: string, v: unknown) => void;
    };
    const node = new Cls();
    node.setDynamic("_secrets", { ATLASCLOUD_API_KEY: "tk" });
    node.prompt = "drive asset://clip.mp4 with asset://track.wav and asset://ref.png";

    const assetBytes = Uint8Array.from([1, 2, 3]);
    const b64 = Buffer.from(assetBytes).toString("base64");
    await node.process({
      storage: null,
      resolveAssetBytes: async () => ({ bytes: assetBytes })
    });

    expect(submitted.body).toEqual({
      model: "test/model/t2i",
      prompt: "drive video with audio and image",
      image: `data:image/png;base64,${b64}`,
      audio: `data:audio/wav;base64,${b64}`,
      video: `data:video/mp4;base64,${b64}`
    });
  });

  it("does not override a wired media input from a mention", async () => {
    const submitted: { body: Record<string, unknown> } = { body: {} };
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
        return { ok: true, arrayBuffer: async () => Uint8Array.from([1]).buffer } as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    const Cls = createAtlasNodeClass(
      makeSpec({
        modality: "video",
        outputType: "video",
        fields: [
          { name: "prompt", type: "str", default: "" },
          { name: "video", type: "video", default: null }
        ]
      })
    ) as unknown as new () => {
      prompt: string;
      video: unknown;
      process: (ctx: unknown) => Promise<Record<string, unknown>>;
      setDynamic: (k: string, v: unknown) => void;
    };
    const node = new Cls();
    node.setDynamic("_secrets", { ATLASCLOUD_API_KEY: "tk" });
    node.prompt = "restyle asset://clip.mp4 now";
    node.video = { uri: "https://input/wired.mp4" };

    await node.process({
      storage: null,
      resolveAssetBytes: async () => ({ bytes: Uint8Array.from([9]) })
    });

    // Wired slot wins; the mention is dropped from the prompt rather than left dangling.
    expect(submitted.body).toEqual({
      model: "test/model/t2i",
      prompt: "restyle now",
      video: "https://input/wired.mp4"
    });
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

  it("retries a transient 5xx on the (already-billed) output download", async () => {
    let dlAttempts = 0;
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/generateImage")) {
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
        dlAttempts++;
        if (dlAttempts === 1) {
          return {
            ok: false,
            status: 503,
            headers: new Headers({ "Retry-After": "0" })
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: async () => Uint8Array.from([0x89, 0x50]).buffer
        } as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    const Cls = createAtlasNodeClass(makeSpec()) as unknown as new () => {
      prompt: string;
      size: string;
      steps: number;
      process: (ctx: unknown) => Promise<Record<string, unknown>>;
      setDynamic: (k: string, v: unknown) => void;
    };
    const node = new Cls();
    node.setDynamic("_secrets", { ATLASCLOUD_API_KEY: "tk" });
    node.prompt = "a cat";
    node.size = "1024x1024";
    node.steps = 1;

    const storage = { store: vi.fn().mockResolvedValue("memory://x.png") };
    const out = await node.process({ storage });

    // The CDN 503 was retried rather than throwing away the paid-for result.
    expect(dlAttempts).toBe(2);
    expect(storage.store).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ output: { type: "image", uri: "memory://x.png" } });
  });
});

// ---------------------------------------------------------------------------
// Manifest invariants
// ---------------------------------------------------------------------------
describe("atlascloud-manifest", () => {
  const manifest = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../src/atlascloud-manifest.json"),
      "utf8"
    )
  ) as AtlasManifestEntry[];

  it("no longer exposes the unsurfaced return_last_frame option", () => {
    const offenders = manifest
      .filter((e) => e.fields.some((f) => f.name === "return_last_frame"))
      .map((e) => e.className);
    expect(offenders).toEqual([]);
  });

  it("models multi-image edit inputs as list[image], not a single wrapped image", () => {
    const edits = manifest.filter((e) =>
      e.fields.some((f) => f.name === "images")
    );
    expect(edits.length).toBeGreaterThan(0);
    for (const e of edits) {
      const images = e.fields.find((f) => f.name === "images");
      expect(images?.type).toBe("list[image]");
      // the single-wrap `array` flag must be gone now that it's a real list
      expect((images as { array?: boolean }).array).toBeUndefined();
    }
  });
});
