/**
 * The `assets` capability module.
 *
 * Beyond the drift/category/spec-parity checks every ported namespace gets,
 * two things are specific to this module. `view_image`'s result shape is a
 * contract with the executors — they strip `image_content` out and forward the
 * pixels as provider image blocks — so it is pinned here. And `list_images` /
 * `view_image` are the two capabilities whose identity is a Zod schema, so the
 * argument check that used to live in `Tool.execute` is asserted where it lives
 * now: inside the implementation, with the same failure envelope.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { Buffer } from "node:buffer";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/runtime";
import { Asset, initTestDb } from "@nodetool-ai/models";
import {
  ASSET_CAPABILITIES,
  module as assetsModule
} from "../src/capabilities/assets.js";
import { extractInjectableImages } from "../src/tools/image-injection.js";
import {
  UNGATED,
  createCapabilityRun,
  toolFromCapability
} from "../src/capabilities/index.js";
import {
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import type { Tool } from "../src/tools/base-tool.js";
import type { PackageAssetLister } from "../src/tools/mcp-tools.js";

const USER = "user-assets";

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function makeContext(
  extra: Partial<Record<string, unknown>> = {}
): ProcessingContext {
  return {
    userId: USER,
    storage: new InMemoryStorageAdapter(),
    ...extra
  } as unknown as ProcessingContext;
}

function asTool(
  name: string,
  context: ProcessingContext,
  listPackageAssets?: PackageAssetLister
): Tool {
  const entry = ASSET_CAPABILITIES.find((e) => e.spec.name === name);
  if (!entry) throw new Error(`no assets capability named "${name}"`);
  return toolFromCapability(entry.spec, entry.impl, () =>
    createCapabilityRun({ context, gate: UNGATED, listPackageAssets })
  );
}

beforeEach(() => {
  initTestDb();
});

describe("assets capability module", () => {
  it("is registered and drift-clean", async () => {
    const loaded = await loadCapabilityModule("assets");
    expect(loaded).toBe(assetsModule);
    expect(capabilityModuleIssues("assets", loaded)).toEqual([]);
  });

  it("carries the wire names the tools carried", () => {
    expect(ASSET_CAPABILITIES.map((e) => e.spec.name)).toEqual([
      "list_assets",
      "get_asset",
      "save_asset",
      "read_asset",
      "asset_search",
      "asset_list",
      "list_images",
      "view_image",
      "update_asset"
    ]);
  });

  it("classifies every capability the way the gate does today", () => {
    for (const entry of ASSET_CAPABILITIES) {
      expect(entry.spec.category).toBe(permissionCategoryFor(entry.spec.name));
    }
  });

  it("renders as a Tool, spec for spec", () => {
    const belt: Tool[] = [
      toolForCapabilityName("list_assets"),
      toolForCapabilityName("get_asset"),
      toolForCapabilityName("save_asset"),
      toolForCapabilityName("read_asset"),
      toolForCapabilityName("asset_search"),
      toolForCapabilityName("asset_list"),
      toolForCapabilityName("list_images"),
      toolForCapabilityName("view_image")
    ];
    for (const tool of belt) {
      const entry = ASSET_CAPABILITIES.find((e) => e.spec.name === tool.name);
      expect(entry).toBeDefined();
      expect(tool.description).toBe(entry!.spec.description);
      expect(tool.inputSchema).toEqual(entry!.spec.inputSchema);
    }
  });

  it("keeps the user-facing message templates", () => {
    const byName = (name: string) =>
      ASSET_CAPABILITIES.find((e) => e.spec.name === name)!.spec;
    expect(byName("list_assets").userMessage?.({})).toBe("Listing assets");
    expect(byName("list_assets").userMessage?.({ query: "cat" })).toBe(
      "Searching assets for 'cat'"
    );
    expect(byName("view_image").userMessage?.({ image_id: "a1" })).toBe(
      "Viewing image a1"
    );
  });
});

describe("assets capabilities against the database", () => {
  it("lists, searches and reads back an asset row", async () => {
    const asset = (await Asset.create({
      user_id: USER,
      name: "cover.png",
      content_type: "image/png"
    })) as Asset;

    const ctx = makeContext();
    const listed = (await asTool("list_assets", ctx).process(ctx, {})) as {
      assets: Array<Record<string, unknown>>;
    };
    expect(listed.assets.map((a) => a.id)).toContain(asset.id);

    const got = (await asTool("get_asset", ctx).process(ctx, {
      asset_id: asset.id
    })) as Record<string, unknown>;
    expect(got.name).toBe("cover.png");
    expect(got.uri).toBe(`asset://${asset.id}.png`);

    const searched = (await asTool("asset_search", ctx).process(ctx, {
      query: "cover"
    })) as { assets: Array<Record<string, unknown>> };
    expect(searched.assets.map((a) => a.asset_id)).toContain(asset.id);
  });

  it("routes package assets to the injected lister", async () => {
    const ctx = makeContext();
    const lister = vi.fn(async () => [{ name: "shipped.png" }]);
    const result = (await asTool("list_assets", ctx, lister).process(ctx, {
      source: "package"
    })) as Record<string, unknown>;
    expect(lister).toHaveBeenCalled();
    expect(result.assets).toEqual([{ name: "shipped.png" }]);
  });

  it("says so when no package lister is on the run", async () => {
    const ctx = makeContext();
    const result = (await asTool("list_assets", ctx).process(ctx, {
      source: "package"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("not available in this process");
  });

  it("round-trips content through save_asset and read_asset", async () => {
    const ctx = makeContext();
    const saved = (await asTool("save_asset", ctx).process(ctx, {
      name: "notes.md",
      content: "# hello"
    })) as Record<string, unknown>;
    expect(saved.success).toBe(true);

    const read = (await asTool("read_asset", ctx).process(ctx, {
      name: "notes.md"
    })) as Record<string, unknown>;
    expect(read.success).toBe(true);
    expect(read.content).toBe("# hello");
  });

  it("returns an asset_uri that carries the file extension", async () => {
    let created = 1;
    // `asset://<id>` alone types nothing: a chat embed of a saved mp4 rendered
    // as an image and showed a blank tile.
    // The library path: a context that persists through `createAsset`.
    const ctx = makeContext({
      hasModelInterface: (name: string) => name === "createAsset",
      createAsset: async () => ({ id: `as_${created++}` })
    });
    const saved = (await asTool("save_asset", ctx).process(ctx, {
      name: "panda.mp4",
      content_base64: Buffer.from([0, 1, 2, 3]).toString("base64"),
      content_type: "video/mp4"
    })) as Record<string, unknown>;
    expect(saved.success).toBe(true);
    expect(saved.asset_uri).toBe(`asset://${String(saved.asset_id)}.mp4`);

    // No extension on the name — the content type still names one.
    const unnamed = (await asTool("save_asset", ctx).process(ctx, {
      name: "panda clip",
      content_base64: Buffer.from([0, 1, 2, 3]).toString("base64"),
      content_type: "video/mp4"
    })) as Record<string, unknown>;
    expect(unnamed.asset_uri).toBe(`asset://${String(unnamed.asset_id)}.mp4`);

    // Neither names one — no suffix is better than a wrong one.
    const opaque = (await asTool("save_asset", ctx).process(ctx, {
      name: "blob",
      content_base64: Buffer.from([0, 1, 2, 3]).toString("base64"),
      content_type: "application/x-thing"
    })) as Record<string, unknown>;
    expect(opaque.asset_uri).toBe(`asset://${String(opaque.asset_id)}`);
  });

  it("copies a stored file into the library from a /api/storage/ source, without base64", async () => {
    // The regression: a tool downloaded a video to storage and returned its
    // asset_url; the model's only way to make it a library asset was
    // read_asset → 600 KB of base64 → save_asset. `source` is that copy,
    // done host-side.
    // The chat's storage answers `/api/storage/<key>` retrievals directly;
    // the in-memory adapter speaks `memory://`, so fake the one method the
    // resolver reads and keep the adapter's `store` for the saved copy.
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 24]);
    const inner = new InMemoryStorageAdapter();
    const storage = {
      store: inner.store.bind(inner),
      retrieve: async (uri: string) =>
        uri === "/api/storage/downloads/abc.mp4"
          ? bytes
          : inner.retrieve(uri)
    };
    const ctx = makeContext({ storage });
    const saved = (await asTool("save_asset", ctx).process(ctx, {
      name: "clip.mp4",
      source: "/api/storage/downloads/abc.mp4"
    })) as Record<string, unknown>;
    expect(saved.success).toBe(true);
    expect(saved.content_type).toBe("video/mp4");
    expect(saved.size).toBe(bytes.byteLength);

    const read = (await asTool("read_asset", ctx).process(ctx, {
      name: "clip.mp4"
    })) as Record<string, unknown>;
    expect(read.success).toBe(true);
    expect(read.binary).toBe(true);
    expect(read.size).toBe(bytes.byteLength);
  });

  it("copies an http(s) source through the SSRF-screened fetch", async () => {
    const original = globalThis.fetch;
    const body = new Uint8Array([1, 2, 3, 4]);
    globalThis.fetch = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "image/png" }
        })
    ) as unknown as typeof fetch;
    try {
      const ctx = makeContext();
      const saved = (await asTool("save_asset", ctx).process(ctx, {
        name: "shot.png",
        source: "https://api.apify.com/v2/key-value-stores/x/records/shot.png"
      })) as Record<string, unknown>;
      expect(saved.success).toBe(true);
      expect(saved.content_type).toBe("image/png");
      expect(saved.size).toBe(4);

      const refused = (await asTool("save_asset", ctx).process(ctx, {
        name: "loopback.bin",
        source: "http://127.0.0.1:7777/anything"
      })) as Record<string, unknown>;
      expect(refused.success).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("refuses a source that resolves to zero bytes", async () => {
    // A storage adapter that answers with an empty buffer instead of null is
    // what turned a failed copy into a 0-byte asset reported as saved.
    const ctx = makeContext({
      storage: {
        retrieve: async () => new Uint8Array(0),
        store: async (key: string) => `mem://${key}`,
        uriForKey: (key: string) => `mem://${key}`
      }
    });

    const saved = (await asTool("save_asset", ctx).process(ctx, {
      name: "stitched.mp4",
      source: "supabase://nodetool-temp/assets/missing.mp4",
      content_type: "video/mp4"
    })) as Record<string, unknown>;
    expect(saved.success).toBe(false);
    expect(String(saved.error)).toContain("0 bytes");
  });

  it("refuses base64 that decodes to nothing", async () => {
    const ctx = makeContext();
    const saved = (await asTool("save_asset", ctx).process(ctx, {
      name: "empty.mp4",
      content_base64: "",
      content_type: "video/mp4"
    })) as Record<string, unknown>;
    expect(saved.success).toBe(false);
  });

  it("refuses more than one content form and names a missing source", async () => {
    const ctx = makeContext();
    const both = (await asTool("save_asset", ctx).process(ctx, {
      name: "x.txt",
      content: "a",
      source: "/api/storage/downloads/nope.txt"
    })) as Record<string, unknown>;
    expect(both.success).toBe(false);
    expect(String(both.error)).toContain("mutually exclusive");

    const missing = (await asTool("save_asset", ctx).process(ctx, {
      name: "x.bin",
      source: "/api/storage/downloads/nope.bin"
    })) as Record<string, unknown>;
    expect(missing.success).toBe(false);
    expect(String(missing.error)).toContain("Source not found");
  });
});

describe("view_image", () => {
  it("returns the payload shape the executors forward as image blocks", async () => {
    const ctx = makeContext({
      resolveAssetBytes: vi.fn(async () => ({
        bytes: new Uint8Array(Buffer.from(TINY_PNG_B64, "base64")),
        attempts: [] as string[]
      }))
    });
    const result = (await asTool("view_image", ctx).process(ctx, {
      image_id: "asset://abc.png"
    })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.mimeType).toBe("image/png");
    expect(result.image_content).toEqual({
      uri: `data:image/png;base64,${TINY_PNG_B64}`,
      mimeType: "image/png"
    });
    expect(extractInjectableImages(result)).not.toBeNull();
  });

  it("runs the argument check the tool ran, with the same envelope", async () => {
    const ctx = makeContext();
    const result = (await asTool("view_image", ctx).process(ctx, {})) as Record<
      string,
      unknown
    >;
    expect(result.error).toBe("invalid_tool_arguments");
    expect(String(result.message)).toContain(
      "Invalid arguments for view_image"
    );
  });

  it("validates once, whichever entrance the caller takes", async () => {
    const ctx = makeContext();
    // The check lives in the implementation now, so `process()` and
    // `execute()` answer with the same envelope — a tool built from the spec
    // carries no schema of its own to validate against first.
    const direct = (await toolForCapabilityName("view_image").process(
      ctx,
      {}
    )) as Record<string, unknown>;
    const executed = (await toolForCapabilityName("view_image").execute(
      ctx,
      {}
    )) as Record<string, unknown>;
    expect(direct.error).toBe("invalid_tool_arguments");
    expect(executed).toEqual(direct);
  });
});
