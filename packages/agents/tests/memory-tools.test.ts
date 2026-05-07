/**
 * Unit tests for the memory tools (memory_list / memory_read / memory_write).
 *
 * These are the progressive-disclosure interface that agents use to access
 * shared agent memory without paying the token cost of an auto-injected
 * snapshot.
 */

import { describe, expect, it } from "vitest";
import { memoryKeys } from "@nodetool-ai/runtime";
import {
  MemoryListTool,
  MemoryReadTool,
  MemoryWriteTool,
  MEMORY_TOOL_NAMES,
  getMemoryTools
} from "../src/tools/memory-tools.js";
import { createMockContext } from "./_helpers/mock-context.js";

function seed(context: ReturnType<typeof createMockContext>): void {
  context.memory.set({
    key: memoryKeys.task("research"),
    kind: "task_result",
    value: { findings: ["alpha", "beta"] },
    source: "research",
    title: "Research findings",
    description: "Top sources from a web search step."
  });
  context.memory.set({
    key: memoryKeys.step("step_1"),
    kind: "step_result",
    value: "intermediate text",
    source: "step_1",
    title: "Intermediate"
  });
  context.memory.set({
    key: memoryKeys.input("customer"),
    kind: "input",
    value: "Acme",
    title: "customer"
  });
  context.memory.set({
    key: memoryKeys.shared("note"),
    kind: "shared",
    value: "user-published note",
    source: "memory_write",
    title: "note"
  });
}

describe("getMemoryTools", () => {
  it("returns three fresh tool instances with the canonical names", () => {
    const tools = getMemoryTools();
    expect(tools.map((t) => t.name)).toEqual([...MEMORY_TOOL_NAMES]);
  });
});

describe("MemoryListTool", () => {
  it("returns metadata for every entry without values", async () => {
    const tool = new MemoryListTool();
    const context = createMockContext();
    seed(context);

    const result = (await tool.process(context, {})) as {
      total: number;
      returned: number;
      truncated: boolean;
      entries: Array<{
        key: string;
        kind: string;
        title?: string;
        description?: string;
        source?: string;
        valueBytes: number;
        createdAt: string;
      }>;
    };

    expect(result.total).toBe(4);
    expect(result.returned).toBe(4);
    expect(result.truncated).toBe(false);

    const keys = result.entries.map((e) => e.key).sort();
    expect(keys).toEqual([
      "input:customer",
      "shared:note",
      "step:step_1",
      "task:research"
    ]);

    // No `value` field in entries — values must be fetched via memory_read.
    for (const e of result.entries) {
      expect(e).not.toHaveProperty("value");
      expect(typeof e.valueBytes).toBe("number");
      expect(typeof e.createdAt).toBe("string");
    }
  });

  it("filters by kind", async () => {
    const tool = new MemoryListTool();
    const context = createMockContext();
    seed(context);

    const result = (await tool.process(context, {
      kind: ["task_result"]
    })) as { entries: Array<{ key: string }> };
    expect(result.entries.map((e) => e.key)).toEqual(["task:research"]);
  });

  it("filters by key_prefix", async () => {
    const tool = new MemoryListTool();
    const context = createMockContext();
    seed(context);

    const result = (await tool.process(context, {
      key_prefix: "input:"
    })) as { entries: Array<{ key: string }> };
    expect(result.entries.map((e) => e.key)).toEqual(["input:customer"]);
  });

  it("filters by sources", async () => {
    const tool = new MemoryListTool();
    const context = createMockContext();
    seed(context);

    const result = (await tool.process(context, {
      sources: ["research"]
    })) as { entries: Array<{ key: string }> };
    expect(result.entries.map((e) => e.key)).toEqual(["task:research"]);
  });

  it("returns empty list when memory is empty", async () => {
    const tool = new MemoryListTool();
    const context = createMockContext();

    const result = (await tool.process(context, {})) as {
      total: number;
      returned: number;
      entries: unknown[];
    };
    expect(result.total).toBe(0);
    expect(result.entries).toEqual([]);
  });
});

describe("MemoryReadTool", () => {
  it("returns full values for requested keys, with missing keys reported", async () => {
    const tool = new MemoryReadTool();
    const context = createMockContext();
    seed(context);

    const result = (await tool.process(context, {
      keys: ["task:research", "step:step_1", "task:does_not_exist"]
    })) as {
      entries: Record<string, { value: unknown; kind: string }>;
      missing: string[];
    };

    expect(Object.keys(result.entries).sort()).toEqual([
      "step:step_1",
      "task:research"
    ]);
    expect(result.entries["task:research"].value).toEqual({
      findings: ["alpha", "beta"]
    });
    expect(result.entries["task:research"].kind).toBe("task_result");
    expect(result.entries["step:step_1"].value).toBe("intermediate text");
    expect(result.missing).toEqual(["task:does_not_exist"]);
  });

  it("treats an empty keys array as a no-op", async () => {
    const tool = new MemoryReadTool();
    const context = createMockContext();
    seed(context);

    const result = (await tool.process(context, { keys: [] })) as {
      entries: Record<string, unknown>;
      missing: string[];
    };
    expect(result.entries).toEqual({});
    expect(result.missing).toEqual([]);
  });
});

describe("MemoryWriteTool", () => {
  it("publishes a value under the shared: namespace", async () => {
    const tool = new MemoryWriteTool();
    const context = createMockContext();

    const result = (await tool.process(context, {
      key: "top_source",
      value: "https://example.com",
      title: "Top source URL",
      description: "Picked by the researcher agent."
    })) as { ok: boolean; key: string; kind: string };

    expect(result.ok).toBe(true);
    expect(result.key).toBe("shared:top_source");
    expect(result.kind).toBe("shared");

    const entry = context.memory.get("shared:top_source");
    expect(entry?.value).toBe("https://example.com");
    expect(entry?.title).toBe("Top source URL");
    expect(entry?.description).toBe("Picked by the researcher agent.");
    expect(entry?.source).toBe("memory_write");
  });

  it("only writes under shared: even when caller specifies a different prefix", async () => {
    const tool = new MemoryWriteTool();
    const context = createMockContext();

    // The schema doesn't let the agent pick a kind, and the suffix is
    // always passed through memoryKeys.shared. Even a colon-suffixed key
    // gets its prefix overwritten.
    const result = (await tool.process(context, {
      key: "task:bogus",
      value: 42
    })) as { key: string };
    expect(result.key).toBe("shared:task:bogus");
    expect(context.memory.has("task:bogus")).toBe(false);
    expect(context.memory.has("shared:task:bogus")).toBe(true);
  });
});
