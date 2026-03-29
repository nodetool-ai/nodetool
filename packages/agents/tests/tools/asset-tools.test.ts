/**
 * Tests for T-AG-4: Asset tools (SaveAssetTool, ReadAssetTool).
 */

import { describe, it, expect, vi } from "vitest";
import { SaveAssetTool } from "../../src/tools/asset-tools.js";
import { ReadAssetTool } from "../../src/tools/asset-tools.js";
import type { ProcessingContext } from "@nodetool/runtime";
import { InMemoryStorageAdapter } from "@nodetool/runtime";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeContext(
  storage?: ProcessingContext["storage"],
): ProcessingContext {
  return {
    storage: arguments.length === 0 ? new InMemoryStorageAdapter() : storage,
  } as unknown as ProcessingContext;
}

/* ------------------------------------------------------------------ */
/*  SaveAssetTool                                                     */
/* ------------------------------------------------------------------ */

describe("SaveAssetTool", () => {
  const tool = new SaveAssetTool();

  it("has correct name and description", () => {
    expect(tool.name).toBe("save_asset");
    expect(tool.description).toBe("Save content as an asset file");
  });

  it("saves content with default content_type", async () => {
    const storage = new InMemoryStorageAdapter();
    const ctx = makeContext(storage);

    const result = (await tool.process(ctx, {
      name: "hello.txt",
      content: "Hello, world!",
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.name).toBe("hello.txt");
    expect(result.content_type).toBe("text/plain");
    expect(result.size).toBe(13);
    expect(typeof result.uri).toBe("string");

    // Verify data is actually stored
    const stored = await storage.retrieve(result.uri as string);
    expect(stored).not.toBeNull();
    expect(new TextDecoder().decode(stored!)).toBe("Hello, world!");
  });

  it("saves content with custom content_type", async () => {
    const storage = new InMemoryStorageAdapter();
    const ctx = makeContext(storage);

    const result = (await tool.process(ctx, {
      name: "data.json",
      content: '{"key": "value"}',
      content_type: "application/json",
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.content_type).toBe("application/json");
  });

  it("returns error when name is missing", async () => {
    const ctx = makeContext();
    const result = (await tool.process(ctx, {
      content: "test",
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/name/i);
  });

  it("returns error when content is missing", async () => {
    const ctx = makeContext();
    const result = (await tool.process(ctx, {
      name: "test.txt",
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/content/i);
  });

  it("returns error when no storage adapter is configured", async () => {
    const ctx = makeContext(null);
    const result = (await tool.process(ctx, {
      name: "test.txt",
      content: "test",
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/storage/i);
  });

  it("handles storage errors gracefully", async () => {
    const storage = {
      store: vi.fn().mockRejectedValue(new Error("disk full")),
      retrieve: vi.fn(),
      exists: vi.fn(),
    };
    const ctx = makeContext(storage);

    const result = (await tool.process(ctx, {
      name: "test.txt",
      content: "test",
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toBe("disk full");
  });

  it("generates correct toProviderTool output", () => {
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("save_asset");
    expect(pt.inputSchema).toBeDefined();
  });

  it("userMessage includes filename", () => {
    expect(tool.userMessage({ name: "report.txt" })).toBe(
      "Saving asset as report.txt...",
    );
  });

  it("userMessage falls back for missing name", () => {
    expect(tool.userMessage({})).toBe("Saving asset...");
  });
});

/* ------------------------------------------------------------------ */
/*  ReadAssetTool                                                     */
/* ------------------------------------------------------------------ */

describe("ReadAssetTool", () => {
  const tool = new ReadAssetTool();

  it("has correct name and description", () => {
    expect(tool.name).toBe("read_asset");
    expect(tool.description).toBe("Read an asset file");
  });

  it("reads a previously saved asset", async () => {
    const storage = new InMemoryStorageAdapter();
    const ctx = makeContext(storage);

    // Store content first
    const data = new TextEncoder().encode("file contents here");
    await storage.store("assets/notes.txt", data, "text/plain");

    const result = (await tool.process(ctx, {
      name: "notes.txt",
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.content).toBe("file contents here");
    expect(result.name).toBe("notes.txt");
    expect(result.size).toBe(data.byteLength);
  });

  it("returns error when asset is not found", async () => {
    const storage = new InMemoryStorageAdapter();
    const ctx = makeContext(storage);

    const result = (await tool.process(ctx, {
      name: "nonexistent.txt",
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("returns error when name is missing", async () => {
    const ctx = makeContext();
    const result = (await tool.process(ctx, {})) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/name/i);
  });

  it("returns error when no storage adapter is configured", async () => {
    const ctx = makeContext(null);
    const result = (await tool.process(ctx, {
      name: "test.txt",
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/storage/i);
  });

  it("handles storage errors gracefully", async () => {
    const storage = {
      store: vi.fn(),
      retrieve: vi.fn().mockRejectedValue(new Error("connection lost")),
      exists: vi.fn(),
    };
    const ctx = makeContext(storage);

    const result = (await tool.process(ctx, {
      name: "test.txt",
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toBe("connection lost");
  });

  it("userMessage includes filename", () => {
    expect(tool.userMessage({ name: "data.csv" })).toBe(
      "Reading asset data.csv...",
    );
  });

  it("userMessage falls back for missing name", () => {
    expect(tool.userMessage({})).toBe("Reading an asset...");
  });
});

/* ------------------------------------------------------------------ */
/*  Round-trip: Save then Read                                        */
/* ------------------------------------------------------------------ */

describe("SaveAssetTool + ReadAssetTool round-trip", () => {
  it("can save and then read the same content", async () => {
    const storage = new InMemoryStorageAdapter();
    const ctx = makeContext(storage);

    const saveTool = new SaveAssetTool();
    const readTool = new ReadAssetTool();

    const saved = (await saveTool.process(ctx, {
      name: "round-trip.txt",
      content: "round-trip content 123",
      content_type: "text/plain",
    })) as Record<string, unknown>;

    expect(saved.success).toBe(true);

    const read = (await readTool.process(ctx, {
      name: "round-trip.txt",
    })) as Record<string, unknown>;

    expect(read.success).toBe(true);
    expect(read.content).toBe("round-trip content 123");
  });
});
