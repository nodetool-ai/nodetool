/**
 * Unit tests for the run-scoped memory capabilities
 * (list_shared / read_shared / share_result).
 *
 * These are the progressive-disclosure interface that agents use to access
 * shared agent memory without paying the token cost of an auto-injected
 * snapshot. They live in the `shared` capability module; `getSharedTools()` is
 * the belt every step executor mounts them from.
 */

import { describe, expect, it } from "vitest";
import { memoryKeys } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  listShared,
  readShared,
  shareResult
} from "../src/capabilities/shared.js";
import { ungatedCapabilityRun } from "../src/capabilities/invoke.js";
import {
  SHARED_TOOL_NAMES,
  getSharedTools
} from "../src/tools/shared-tools.js";
import { createMockContext } from "./_helpers/mock-context.js";

type MockContext = ReturnType<typeof createMockContext>;

const run = (context: MockContext) =>
  ungatedCapabilityRun(context as unknown as ProcessingContext);

const list = (context: MockContext, params: Record<string, unknown> = {}) =>
  listShared.impl(run(context), params);

const read = (context: MockContext, params: Record<string, unknown>) =>
  readShared.impl(run(context), params);

const share = (context: MockContext, params: Record<string, unknown>) =>
  shareResult.impl(run(context), params);

function seed(context: MockContext): void {
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
    source: "share_result",
    title: "note"
  });
}

describe("getSharedTools", () => {
  it("returns three fresh tool instances with the canonical names", () => {
    const tools = getSharedTools();
    expect(tools.map((t) => t.name)).toEqual([...SHARED_TOOL_NAMES]);
  });

  it("carries the specs' descriptions and schemas onto the belt", () => {
    const [listTool, readTool, shareTool] = getSharedTools();
    expect(listTool.description).toBe(listShared.spec.description);
    expect(readTool.inputSchema).toBe(readShared.spec.inputSchema);
    expect(shareTool.description).toBe(shareResult.spec.description);
  });
});

describe("list_shared", () => {
  it("returns metadata for every entry without values", async () => {
    const context = createMockContext();
    seed(context);

    const result = (await list(context)) as {
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

    // No `value` field in entries — values must be fetched via read_shared.
    for (const e of result.entries) {
      expect(e).not.toHaveProperty("value");
      expect(typeof e.valueBytes).toBe("number");
      expect(typeof e.createdAt).toBe("string");
    }
  });

  it("filters by kind", async () => {
    const context = createMockContext();
    seed(context);

    const result = (await list(context, { kind: ["task_result"] })) as {
      entries: Array<{ key: string }>;
    };
    expect(result.entries.map((e) => e.key)).toEqual(["task:research"]);
  });

  it("filters by key_prefix", async () => {
    const context = createMockContext();
    seed(context);

    const result = (await list(context, { key_prefix: "input:" })) as {
      entries: Array<{ key: string }>;
    };
    expect(result.entries.map((e) => e.key)).toEqual(["input:customer"]);
  });

  it("filters by sources", async () => {
    const context = createMockContext();
    seed(context);

    const result = (await list(context, { sources: ["research"] })) as {
      entries: Array<{ key: string }>;
    };
    expect(result.entries.map((e) => e.key)).toEqual(["task:research"]);
  });

  it("returns empty list when memory is empty", async () => {
    const context = createMockContext();

    const result = (await list(context)) as {
      total: number;
      returned: number;
      entries: unknown[];
    };
    expect(result.total).toBe(0);
    expect(result.entries).toEqual([]);
  });
});

describe("read_shared", () => {
  it("returns full values for requested keys, with missing keys reported", async () => {
    const context = createMockContext();
    seed(context);

    const result = (await read(context, {
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
    const context = createMockContext();
    seed(context);

    const result = (await read(context, { keys: [] })) as {
      entries: Record<string, unknown>;
      missing: string[];
    };
    expect(result.entries).toEqual({});
    expect(result.missing).toEqual([]);
  });

  it("resolves a bare suffix under shared:, reported under the asked-for key", async () => {
    const context = createMockContext();
    await share(context, {
      key: "top_source",
      value: "https://example.com"
    });

    const result = (await read(context, { keys: ["top_source"] })) as {
      entries: Record<string, { value: unknown }>;
      missing: string[];
    };

    expect(result.entries["top_source"].value).toBe("https://example.com");
    expect(result.missing).toEqual([]);
  });

  it("does not fall back for a key that names another namespace", async () => {
    const context = createMockContext();
    seed(context);

    const result = (await read(context, {
      keys: ["task:does_not_exist"]
    })) as { entries: Record<string, unknown>; missing: string[] };

    // `shared:task:does_not_exist` must never answer a `task:` read.
    expect(result.entries).toEqual({});
    expect(result.missing).toEqual(["task:does_not_exist"]);
  });
});

describe("share_result", () => {
  it("publishes a value under the shared: namespace", async () => {
    const context = createMockContext();

    const result = (await share(context, {
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
    expect(entry?.source).toBe("share_result");
  });

  it("only writes under shared: even when caller specifies a different prefix", async () => {
    const context = createMockContext();

    // The schema doesn't let the agent pick a kind, and the suffix is
    // always passed through memoryKeys.shared. Even a colon-suffixed key
    // gets its prefix overwritten.
    const result = (await share(context, {
      key: "task:bogus",
      value: 42
    })) as { key: string };
    expect(result.key).toBe("shared:task:bogus");
    expect(context.memory.has("task:bogus")).toBe(false);
    expect(context.memory.has("shared:task:bogus")).toBe(true);
  });

  it("strips a leading shared: instead of doubling the prefix", async () => {
    const context = createMockContext();

    // A live run handed back a key from list_shared and minted
    // `shared:shared:best_language_model`. The write is now idempotent.
    const result = (await share(context, {
      key: "shared:best_language_model",
      value: "openai/gpt-5-mini"
    })) as { key: string };

    expect(result.key).toBe("shared:best_language_model");
    expect(context.memory.has("shared:shared:best_language_model")).toBe(false);
  });

  it("writes the same entry whether the key carries the prefix or not", async () => {
    const context = createMockContext();

    await share(context, { key: "pick", value: 1 });
    await share(context, { key: "shared:pick", value: 2 });

    expect(context.memory.get("shared:pick")?.value).toBe(2);
    expect(context.memory.has("shared:shared:pick")).toBe(false);
  });
});
