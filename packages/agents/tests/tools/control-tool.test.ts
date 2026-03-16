import { describe, it, expect } from "vitest";
import { ControlNodeTool, sanitizeToolName } from "../../src/tools/control-tool.js";
import type { ControlNodeInfo } from "../../src/tools/control-tool.js";

// ---------------------------------------------------------------------------
// sanitizeToolName
// ---------------------------------------------------------------------------

describe("sanitizeToolName", () => {
  it("converts spaces to underscores and lowercases", () => {
    expect(sanitizeToolName("Image Enhancer")).toBe("image_enhancer");
  });

  it("converts camelCase to snake_case", () => {
    expect(sanitizeToolName("ControlNode")).toBe("control_node");
  });

  it("handles hyphens and numbers", () => {
    expect(sanitizeToolName("My-Node 123")).toBe("my_node_123");
  });

  it("collapses consecutive underscores", () => {
    expect(sanitizeToolName("a___b")).toBe("a_b");
  });

  it("strips leading/trailing underscores", () => {
    expect(sanitizeToolName("__hello__")).toBe("hello");
  });

  it("returns default for empty string", () => {
    expect(sanitizeToolName("")).toBe("control_node");
  });

  it("returns default for non-string input", () => {
    expect(sanitizeToolName(null as unknown as string)).toBe("control_node");
  });

  it("truncates to 64 chars", () => {
    const long = "a".repeat(100);
    expect(sanitizeToolName(long).length).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// ControlNodeTool
// ---------------------------------------------------------------------------

const baseInfo: ControlNodeInfo = {
  node_id: "node_1",
  node_type: "image.Resize",
  node_title: "Image Resizer",
  node_description: "Resizes images to target dimensions",
  control_actions: {
    run: {
      properties: {
        width: { type: "integer", description: "Target width" },
        height: { type: "integer", description: "Target height" },
      },
    },
  },
};

describe("ControlNodeTool", () => {
  it("sets name from node title", () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    expect(tool.name).toBe("image_resizer");
  });

  it("sets description from node_description", () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    expect(tool.description).toBe("Resizes images to target dimensions");
  });

  it("generates description when node_description is missing", () => {
    const info: ControlNodeInfo = { ...baseInfo, node_description: undefined };
    const tool = new ControlNodeTool("node_1", info);
    expect(tool.description).toContain("Control Image Resizer");
    expect(tool.description).toContain("width");
    expect(tool.description).toContain("height");
  });

  it("builds input schema from run action properties", () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    const props = tool.inputSchema["properties"] as Record<string, unknown>;
    expect(props).toHaveProperty("width");
    expect(props).toHaveProperty("height");
    expect(tool.inputSchema["required"]).toEqual([]);
  });

  it("handles missing control_actions gracefully", () => {
    const info: ControlNodeInfo = {
      node_id: "node_2",
      node_type: "text.Echo",
      node_title: "Echo",
    };
    const tool = new ControlNodeTool("node_2", info);
    expect(tool.name).toBe("echo");
    expect(tool.inputSchema["properties"]).toEqual({});
  });

  it("creates RunEvent from arguments", () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    const event = tool.createControlEvent({ width: 800, height: 600 });
    expect(event.event_type).toBe("run");
    expect(event).toHaveProperty("properties");
    expect((event as { properties: Record<string, unknown> }).properties).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("creates RunEvent with empty args", () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    const event = tool.createControlEvent({});
    expect(event.event_type).toBe("run");
  });

  it("userMessage with params", () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    expect(tool.userMessage({ width: 100 })).toBe(
      "Triggering Image Resizer with properties: width",
    );
  });

  it("userMessage without params", () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    expect(tool.userMessage({})).toBe("Triggering Image Resizer");
  });

  it("process returns confirmation string", async () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    const result = await tool.process({} as any, { width: 800 });
    expect(result).toContain("Created run event");
    expect(result).toContain("Image Resizer");
  });

  it("toProviderTool returns valid provider tool format", () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("image_resizer");
    expect(pt.description).toBe("Resizes images to target dimensions");
    expect(pt.inputSchema).toBeDefined();
  });

  it("stores targetNodeId", () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    expect(tool.targetNodeId).toBe("node_1");
  });

  it("stores nodeInfo", () => {
    const tool = new ControlNodeTool("node_1", baseInfo);
    expect(tool.nodeInfo).toBe(baseInfo);
  });
});
