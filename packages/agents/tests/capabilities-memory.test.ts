/**
 * The `memory` capability module: the four thread-memory capabilities.
 *
 * Clean module walk, category parity with the map the gate reads, deprecated
 * classes that still render their ported specs, and a save → list → update →
 * delete round trip against the in-memory database.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import {
  MEMORY_CAPABILITIES,
  module as memoryModule
} from "../src/capabilities/memory.js";
import type {
  CapabilityExport,
  CapabilityGate
} from "../src/capabilities/types.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import type { Tool } from "../src/tools/base-tool.js";
import {
  ThreadMemorySaveTool,
  ThreadMemoryListTool,
  ThreadMemoryUpdateTool,
  ThreadMemoryDeleteTool
} from "../src/tools/thread-memory-tools.js";

const gate: CapabilityGate = {
  mode: "auto",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

function ctx(): ProcessingContext {
  return { userId: "u1", threadId: "t1" } as unknown as ProcessingContext;
}

function byName(name: string): CapabilityExport {
  const found = MEMORY_CAPABILITIES.find((entry) => entry.spec.name === name);
  if (!found) throw new Error(`no memory capability named ${name}`);
  return found;
}

function asTool(entry: CapabilityExport): Tool {
  return toolFromCapability(entry.spec, entry.impl, (context) =>
    createCapabilityRun({ context, gate })
  );
}

describe("memory capability module", () => {
  it("loads from the registry with no issues", async () => {
    const loaded = await loadCapabilityModule("memory");
    expect(loaded).toBe(memoryModule);
    expect(capabilityModuleIssues("memory", loaded)).toEqual([]);
  });

  it("classifies every export exactly as the gate's map does", () => {
    for (const entry of MEMORY_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
  });
});

describe("wire compatibility with the deprecated classes", () => {
  const pairs: Array<[Tool, string]> = [
    [new ThreadMemorySaveTool(), "thread_memory_save"],
    [new ThreadMemoryListTool(), "thread_memory_list"],
    [new ThreadMemoryUpdateTool(), "thread_memory_update"],
    [new ThreadMemoryDeleteTool(), "thread_memory_delete"]
  ];

  it.each(pairs)("%o keeps its name, description and schema", (tool, name) => {
    const { spec } = byName(name);
    expect(tool.name).toBe(spec.name);
    expect(tool.description).toBe(spec.description);
    expect(tool.inputSchema).toEqual(spec.inputSchema);
  });

  it("keeps the userMessage templates", () => {
    expect(new ThreadMemorySaveTool().userMessage({ title: "palette" })).toBe(
      "Remembering: palette"
    );
    expect(new ThreadMemoryListTool().userMessage({})).toBe(
      "Recalling conversation memory"
    );
  });
});

describe("behaviour through toolFromCapability", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("saves, lists, updates and deletes one memory", async () => {
    const context = ctx();
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "cover.png",
      content_type: "image/png"
    });

    const saved = (await asTool(byName("thread_memory_save")).process(context, {
      content: "User approved a teal palette.",
      title: "palette",
      kind: "decision",
      resources: [{ type: "asset", id: asset.id }]
    })) as { success: boolean; memory_id: string };
    expect(saved.success).toBe(true);

    const listed = (await asTool(byName("thread_memory_list")).process(
      context,
      {}
    )) as {
      count: number;
      memories: Array<{
        content: string;
        kind: string;
        resources: Array<{ uri?: string }>;
      }>;
    };
    expect(listed.count).toBe(1);
    expect(listed.memories[0].kind).toBe("decision");
    expect(listed.memories[0].resources[0].uri).toBe(`asset://${asset.id}.png`);

    const updated = (await asTool(byName("thread_memory_update")).process(
      context,
      { memory_id: saved.memory_id, content: "Teal, not turquoise." }
    )) as { success: boolean };
    expect(updated.success).toBe(true);

    const deleted = (await asTool(byName("thread_memory_delete")).process(
      context,
      { memory_id: saved.memory_id }
    )) as { success: boolean };
    expect(deleted.success).toBe(true);

    const empty = (await asTool(byName("thread_memory_list")).process(
      context,
      {}
    )) as { count: number };
    expect(empty.count).toBe(0);
  });

  it("refuses to touch memory outside a thread", async () => {
    const noThread = { userId: "u1" } as unknown as ProcessingContext;
    const result = (await asTool(byName("thread_memory_save")).process(
      noThread,
      { content: "orphan" }
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("No active thread");
  });
});
