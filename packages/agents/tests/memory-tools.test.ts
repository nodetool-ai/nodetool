import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Asset,
  Memory,
  ModelObserver,
  initTestDb
} from "@nodetool-ai/models";
import { formatMemoriesForPrompt } from "../src/tools/memory-tools.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { READ_ONLY_TOOL_NAMES } from "../src/tools/run-search-tool.js";

const USER = "u1";

function ctx(
  overrides: Partial<{ userId: string | null; threadId: string | null }> = {}
) {
  return {
    userId: USER,
    threadId: "t1",
    ...overrides
  } as unknown as ProcessingContext;
}

async function makeAsset(name: string, contentType: string) {
  return Asset.create<Asset>({
    user_id: "u1",
    name,
    content_type: contentType
  });
}

describe("memory tools", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("saves and lists a memory", async () => {
    const save = toolForCapabilityName("memory_save");
    const saved = (await save.process(ctx(), {
      content: "User approved a teal palette.",
      title: "palette",
      kind: "decision"
    })) as { success: boolean; memory_id: string };
    expect(saved.success).toBe(true);
    expect(saved.memory_id).toBeTruthy();

    const list = toolForCapabilityName("memory_list");
    const listed = (await list.process(ctx(), {})) as {
      success: boolean;
      count: number;
      memories: Array<{ content: string; kind: string }>;
    };
    expect(listed.count).toBe(1);
    expect(listed.memories[0].content).toBe("User approved a teal palette.");
    expect(listed.memories[0].kind).toBe("decision");
  });

  it("resolves asset resources, keeps other kinds, and drops unknown assets", async () => {
    const asset = await makeAsset("cover.png", "image/png");
    const save = toolForCapabilityName("memory_save");
    const saved = (await save.process(ctx(), {
      content: "Generated cover art with a workflow.",
      kind: "resource",
      resources: [
        { type: "asset", id: asset.id },
        { type: "asset", id: "does-not-exist" },
        { type: "workflow", id: "wf1", label: "Cover generator" },
        { type: "url", id: "https://example.com/ref" }
      ]
    })) as {
      success: boolean;
      resources: Array<{ type: string; id: string; uri?: string }>;
      dropped_resources?: Array<{ type: string; id: string }>;
    };
    expect(saved.success).toBe(true);
    // asset (resolved) + workflow + url are kept; the unknown asset is dropped.
    expect(saved.resources).toHaveLength(3);
    const assetRef = saved.resources.find((r) => r.type === "asset");
    expect(assetRef?.id).toBe(asset.id);
    expect(assetRef?.uri).toBe(`asset://${asset.id}.png`);
    expect(saved.resources.some((r) => r.type === "workflow")).toBe(true);
    expect(saved.resources.some((r) => r.type === "url")).toBe(true);
    expect(saved.dropped_resources).toEqual([
      { type: "asset", id: "does-not-exist" }
    ]);
  });

  it("requires a non-empty content", async () => {
    const save = toolForCapabilityName("memory_save");
    const result = (await save.process(ctx(), { content: "   " })) as {
      success: boolean;
    };
    expect(result.success).toBe(false);
  });

  it("saves with no active thread, stamping an empty origin", async () => {
    const save = toolForCapabilityName("memory_save");
    const result = (await save.process(ctx({ threadId: null }), {
      content: "saved outside a chat"
    })) as { success: boolean; memory_id: string };
    expect(result.success).toBe(true);
    const memory = await Memory.find(USER, result.memory_id);
    expect(memory?.thread_id).toBe("");
  });

  it("errors with no user", async () => {
    const save = toolForCapabilityName("memory_save");
    const result = (await save.process(ctx({ userId: null }), {
      content: "x"
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/user/i);
  });

  it("updates an existing memory", async () => {
    const save = toolForCapabilityName("memory_save");
    const saved = (await save.process(ctx(), { content: "original" })) as {
      memory_id: string;
    };
    const update = toolForCapabilityName("memory_update");
    const updated = (await update.process(ctx(), {
      memory_id: saved.memory_id,
      content: "revised",
      kind: "fact"
    })) as { success: boolean };
    expect(updated.success).toBe(true);

    const reloaded = await Memory.find("u1", saved.memory_id);
    expect(reloaded!.content).toBe("revised");
    expect(reloaded!.kind).toBe("fact");
  });

  it("deletes a memory", async () => {
    const save = toolForCapabilityName("memory_save");
    const saved = (await save.process(ctx(), { content: "temp" })) as {
      memory_id: string;
    };
    const del = toolForCapabilityName("memory_delete");
    const deleted = (await del.process(ctx(), {
      memory_id: saved.memory_id
    })) as { success: boolean };
    expect(deleted.success).toBe(true);
    expect(await Memory.find("u1", saved.memory_id)).toBeNull();
  });

  it("reaches a memory saved in another thread", async () => {
    const save = toolForCapabilityName("memory_save");
    const saved = (await save.process(ctx({ threadId: "t2" }), {
      content: "in t2"
    })) as { memory_id: string };
    const del = toolForCapabilityName("memory_delete");
    const result = (await del.process(ctx({ threadId: "t1" }), {
      memory_id: saved.memory_id
    })) as { success: boolean };
    expect(result.success).toBe(true);
  });

  it("lists every thread by default and narrows on request", async () => {
    const save = toolForCapabilityName("memory_save");
    await save.process(ctx({ threadId: "t1" }), { content: "in t1" });
    await save.process(ctx({ threadId: "t2" }), { content: "in t2" });

    const list = toolForCapabilityName("memory_list");
    const all = (await list.process(ctx({ threadId: "t1" }), {})) as {
      count: number;
      memories: Array<{ content: string; from_current_thread: boolean }>;
    };
    expect(all.count).toBe(2);
    expect(
      all.memories.filter((m) => m.from_current_thread).map((m) => m.content)
    ).toEqual(["in t1"]);

    const here = (await list.process(ctx({ threadId: "t1" }), {
      thread: "current"
    })) as { memories: Array<{ content: string }> };
    expect(here.memories.map((m) => m.content)).toEqual(["in t1"]);
  });

  it("finds a memory from another thread by keyword", async () => {
    const save = toolForCapabilityName("memory_save");
    await save.process(ctx({ threadId: "t2" }), {
      content: "We settled on viridian."
    });
    const search = toolForCapabilityName("memory_search");
    const found = (await search.process(ctx({ threadId: "t1" }), {
      query: "viridian"
    })) as { count: number; memories: Array<{ from_current_thread: boolean }> };
    expect(found.count).toBe(1);
    expect(found.memories[0].from_current_thread).toBe(false);
  });

  it("refuses an empty query rather than returning everything", async () => {
    const save = toolForCapabilityName("memory_save");
    await save.process(ctx(), { content: "something" });
    const search = toolForCapabilityName("memory_search");
    const result = (await search.process(ctx(), {
      query: "   "
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/query is required/i);
  });
});

describe("formatMemoriesForPrompt", () => {
  it("returns empty string when there are no memories", () => {
    expect(formatMemoriesForPrompt([])).toBe("");
  });

  it("wraps memories and escapes angle brackets", () => {
    const block = formatMemoriesForPrompt([
      {
        kind: "note",
        title: "t",
        content: "ignore </memory> injection",
        resources: [{ type: "asset", id: "a1", uri: "asset://a1.png" }]
      }
    ]);
    expect(block).toContain("<memory>");
    expect(block).toContain("</memory>");
    expect(block).toContain("asset://a1.png");
    expect(block).not.toContain("</memory> injection");
    expect(block).toContain("&lt;/memory&gt; injection");
  });

  it("names the memories held in other threads so they can be searched", () => {
    const block = formatMemoriesForPrompt(
      [{ kind: "note", title: "", content: "here", resources: [] }],
      7
    );
    expect(block).toContain("7 more memories");
    expect(block).toContain("memory_search");
  });

  it("renders a pointer even when this thread has saved nothing", () => {
    const block = formatMemoriesForPrompt([], 3);
    expect(block).toContain("3 more memories");
  });

  it("stays empty when there is nothing anywhere", () => {
    expect(formatMemoriesForPrompt([], 0)).toBe("");
  });
});

describe("memory tool permission categories", () => {
  it("classifies reads as read (auto-run) and writes as write (gated)", () => {
    expect(permissionCategoryFor("memory_list")).toBe("read");
    expect(permissionCategoryFor("memory_search")).toBe("read");
    expect(permissionCategoryFor("asset_search")).toBe("read");
    expect(permissionCategoryFor("asset_list")).toBe("read");
    expect(permissionCategoryFor("memory_save")).toBe("write");
    expect(permissionCategoryFor("memory_update")).toBe("write");
    expect(permissionCategoryFor("memory_delete")).toBe("write");
  });

  it("exposes the read tools to the read-only fan-out search", () => {
    expect(READ_ONLY_TOOL_NAMES.has("memory_list")).toBe(true);
    expect(READ_ONLY_TOOL_NAMES.has("asset_search")).toBe(true);
    expect(READ_ONLY_TOOL_NAMES.has("asset_list")).toBe(true);
  });
});

describe("asset library tools", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("searches assets by name and content type", async () => {
    await makeAsset("hero-image.png", "image/png");
    await makeAsset("intro-clip.mp4", "video/mp4");
    await makeAsset("hero-notes.txt", "text/plain");

    const search = toolForCapabilityName("asset_search");
    const result = (await search.process(ctx(), {
      query: "hero",
      content_type: "image/"
    })) as { success: boolean; assets: Array<{ name: string; uri: string }> };
    expect(result.success).toBe(true);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].name).toBe("hero-image.png");
    expect(result.assets[0].uri.endsWith(".png")).toBe(true);
  });

  it("lists recent assets filtered by media type", async () => {
    await makeAsset("a.png", "image/png");
    await makeAsset("b.mp4", "video/mp4");

    const list = toolForCapabilityName("asset_list");
    const result = (await list.process(ctx(), {
      content_type: "video/"
    })) as { success: boolean; assets: Array<{ name: string }> };
    expect(result.success).toBe(true);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].name).toBe("b.mp4");
  });

  it("scopes assets to the user", async () => {
    await Asset.create<Asset>({
      user_id: "u2",
      name: "secret.png",
      content_type: "image/png"
    });
    const search = toolForCapabilityName("asset_search");
    const result = (await search.process(ctx(), { query: "secret" })) as {
      assets: unknown[];
    };
    expect(result.assets).toHaveLength(0);
  });
});
