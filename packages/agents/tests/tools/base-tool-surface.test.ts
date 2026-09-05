/**
 * Tests for the `Tool` base class surface a belt depends on.
 */

import { describe, it, expect } from "vitest";
import { Tool } from "../../src/tools/base-tool.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

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

describe("Tool base class", () => {
  it("toProviderTool returns correct shape", () => {
    const tool = makeTool("provider_tool");
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("provider_tool");
    expect(pt.description).toBe("Mock tool: provider_tool");
    expect(pt.inputSchema).toBeDefined();
  });

  it("userMessage returns default string", () => {
    const tool = makeTool("user_msg_tool");
    expect(tool.userMessage({})).toBe("Running user_msg_tool");
  });

  it("process returns expected value", async () => {
    const tool = makeTool("process_tool");
    const result = await tool.process({} as ProcessingContext, {});
    expect(result).toEqual({ tool: "process_tool" });
  });
});
