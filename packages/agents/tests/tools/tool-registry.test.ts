/**
 * Tests for the tool registry.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerTool,
  resolveTool,
  listTools,
  getAllTools
} from "../../src/tools/tool-registry.js";
import { Tool } from "../../src/tools/base-tool.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeTool(name: string): Tool {
  return new (class extends Tool {
    readonly name = name;
    readonly description = `Mock tool: ${name}`;
    readonly inputSchema = { type: "object" as const, properties: {} };

    async process(
      _context: ProcessingContext,
      _params: Record<string, unknown>
    ): Promise<unknown> {
      return { tool: name };
    }
  })();
}

// The registry module uses a module-level Map, so we need to track which
// tools we register so we can reason about state across tests.
// Since vitest doesn't reset module state between tests in the same suite,
// we use unique names per test to avoid collisions.
let counter = 0;
function uniqueName(base: string): string {
  return `${base}_${++counter}`;
}

/* ------------------------------------------------------------------ */
/*  registerTool / resolveTool                                        */
/* ------------------------------------------------------------------ */

describe("registerTool / resolveTool", () => {
  it("resolves a registered tool by name", () => {
    const name = uniqueName("my_tool");
    const tool = makeTool(name);
    registerTool(tool);
    expect(resolveTool(name)).toBe(tool);
  });

  it("returns null for an unknown tool name", () => {
    expect(resolveTool("does_not_exist_xyz")).toBeNull();
  });

  it("overwrites an existing registration with the same name", () => {
    const name = uniqueName("overwrite_tool");
    const first = makeTool(name);
    const second = makeTool(name);
    registerTool(first);
    registerTool(second);
    expect(resolveTool(name)).toBe(second);
  });
});

/* ------------------------------------------------------------------ */
/*  listTools                                                         */
/* ------------------------------------------------------------------ */

describe("listTools", () => {
  it("includes registered tool names", () => {
    const name = uniqueName("listed_tool");
    registerTool(makeTool(name));
    expect(listTools()).toContain(name);
  });

  it("returns an array of strings", () => {
    const names = listTools();
    expect(Array.isArray(names)).toBe(true);
    for (const n of names) {
      expect(typeof n).toBe("string");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  getAllTools                                                        */
/* ------------------------------------------------------------------ */

describe("getAllTools", () => {
  it("returns Tool instances for all registered tools", () => {
    const name = uniqueName("all_tool");
    const tool = makeTool(name);
    registerTool(tool);
    const all = getAllTools();
    expect(all).toContain(tool);
  });

  it("every item is a Tool instance", () => {
    const all = getAllTools();
    for (const t of all) {
      expect(t).toBeInstanceOf(Tool);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Tool base class — toProviderTool / userMessage                    */
/* ------------------------------------------------------------------ */

describe("Tool base class", () => {
  it("toProviderTool returns correct shape", () => {
    const name = uniqueName("provider_tool");
    const tool = makeTool(name);
    const pt = tool.toProviderTool();
    expect(pt.name).toBe(name);
    expect(pt.description).toBe(`Mock tool: ${name}`);
    expect(pt.inputSchema).toBeDefined();
  });

  it("userMessage returns default string", () => {
    const name = uniqueName("user_msg_tool");
    const tool = makeTool(name);
    expect(tool.userMessage({})).toBe(`Running ${name}`);
  });

  it("process returns expected value", async () => {
    const name = uniqueName("process_tool");
    const tool = makeTool(name);
    const result = await tool.process({} as ProcessingContext, {});
    expect(result).toEqual({ tool: name });
  });
});
