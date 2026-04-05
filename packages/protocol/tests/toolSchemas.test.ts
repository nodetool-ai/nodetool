/**
 * Tests for toolSchemas.ts – Zod schema validation and registry.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  xyPositionSchema,
  positionInputSchema,
  nodePropertySchema,
  optionalWorkflowIdSchema,
  uiSearchNodesParams,
  uiAddNodeParams,
  uiConnectNodesParams,
  uiGetGraphParams,
  uiUpdateNodeDataParams,
  uiDeleteNodeParams,
  uiDeleteEdgeParams,
  uiMoveNodeParams,
  uiSetNodeTitleParams,
  uiSetNodeSyncModeParams,
  uiOpenWorkflowParams,
  uiRunWorkflowParams,
  uiSwitchTabParams,
  uiCopyParams,
  uiPasteParams,
  uiToolSchemas
} from "../src/toolSchemas.js";

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

describe("xyPositionSchema", () => {
  it("accepts valid x/y coordinates", () => {
    const result = xyPositionSchema.safeParse({ x: 10, y: 20 });
    expect(result.success).toBe(true);
  });

  it("accepts negative and decimal coordinates", () => {
    const result = xyPositionSchema.safeParse({ x: -5.5, y: 0 });
    expect(result.success).toBe(true);
  });

  it("rejects non-numeric values", () => {
    const result = xyPositionSchema.safeParse({ x: "10", y: 20 });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = xyPositionSchema.safeParse({ x: 10 });
    expect(result.success).toBe(false);
  });
});

describe("positionInputSchema", () => {
  it("accepts an xy object", () => {
    const result = positionInputSchema.safeParse({ x: 1, y: 2 });
    expect(result.success).toBe(true);
  });

  it("accepts a string position", () => {
    const result = positionInputSchema.safeParse("center");
    expect(result.success).toBe(true);
  });

  it("rejects a number", () => {
    const result = positionInputSchema.safeParse(42);
    expect(result.success).toBe(false);
  });
});

describe("nodePropertySchema", () => {
  it("accepts an empty record", () => {
    const result = nodePropertySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts string-keyed record with any values", () => {
    const result = nodePropertySchema.safeParse({ a: 1, b: "hello", c: true });
    expect(result.success).toBe(true);
  });
});

describe("optionalWorkflowIdSchema", () => {
  it("accepts undefined", () => {
    const result = optionalWorkflowIdSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it("accepts null", () => {
    const result = optionalWorkflowIdSchema.safeParse(null);
    expect(result.success).toBe(true);
  });

  it("accepts a string id", () => {
    const result = optionalWorkflowIdSchema.safeParse("wf-123");
    expect(result.success).toBe(true);
  });

  it("rejects a number", () => {
    const result = optionalWorkflowIdSchema.safeParse(42);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tool parameter schemas (wrapped as z.object for validation)
// ---------------------------------------------------------------------------

describe("uiSearchNodesParams", () => {
  const schema = z.object(uiSearchNodesParams);

  it("accepts minimal valid input", () => {
    expect(schema.safeParse({ query: "math" }).success).toBe(true);
  });

  it("accepts full input", () => {
    const result = schema.safeParse({
      query: "add",
      input_type: "int",
      output_type: "float",
      strict_match: false,
      include_properties: true,
      include_outputs: true,
      limit: 10
    });
    expect(result.success).toBe(true);
  });

  it("rejects limit out of range", () => {
    expect(schema.safeParse({ query: "x", limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ query: "x", limit: 101 }).success).toBe(false);
  });

  it("requires query field", () => {
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("uiAddNodeParams", () => {
  const schema = z.object(uiAddNodeParams);

  it("accepts empty object (all optional)", () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("accepts node with type and position", () => {
    const result = schema.safeParse({
      type: "math.Add",
      position: { x: 100, y: 200 },
      properties: { a: 1 }
    });
    expect(result.success).toBe(true);
  });

  it("accepts string position", () => {
    const result = schema.safeParse({ type: "math.Add", position: "center" });
    expect(result.success).toBe(true);
  });
});

describe("uiConnectNodesParams", () => {
  const schema = z.object(uiConnectNodesParams);

  it("accepts valid connection", () => {
    const result = schema.safeParse({
      source_id: "n1",
      source_handle: "output",
      target_id: "n2",
      target_handle: "input"
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(schema.safeParse({ source_id: "n1" }).success).toBe(false);
  });
});

describe("uiUpdateNodeDataParams", () => {
  const schema = z.object(uiUpdateNodeDataParams);

  it("accepts valid update", () => {
    const result = schema.safeParse({
      node_id: "n1",
      data: { value: 42, label: "test" }
    });
    expect(result.success).toBe(true);
  });

  it("requires node_id", () => {
    expect(schema.safeParse({ data: {} }).success).toBe(false);
  });
});

describe("uiMoveNodeParams", () => {
  const schema = z.object(uiMoveNodeParams);

  it("accepts node move with position", () => {
    const result = schema.safeParse({
      node_id: "n1",
      position: { x: 50, y: 75 }
    });
    expect(result.success).toBe(true);
  });

  it("rejects string position (must be xy object)", () => {
    const result = schema.safeParse({ node_id: "n1", position: "right" });
    expect(result.success).toBe(false);
  });
});

describe("uiSetNodeSyncModeParams", () => {
  const schema = z.object(uiSetNodeSyncModeParams);

  it("accepts on_any mode", () => {
    const result = schema.safeParse({ node_id: "n1", mode: "on_any" });
    expect(result.success).toBe(true);
  });

  it("accepts zip_all mode", () => {
    const result = schema.safeParse({ node_id: "n1", mode: "zip_all" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid mode", () => {
    const result = schema.safeParse({ node_id: "n1", mode: "invalid" });
    expect(result.success).toBe(false);
  });
});

describe("uiSwitchTabParams", () => {
  const schema = z.object(uiSwitchTabParams);

  it("accepts valid tab index", () => {
    expect(schema.safeParse({ tab_index: 0 }).success).toBe(true);
    expect(schema.safeParse({ tab_index: 5 }).success).toBe(true);
  });

  it("rejects negative tab index", () => {
    expect(schema.safeParse({ tab_index: -1 }).success).toBe(false);
  });

  it("rejects non-integer tab index", () => {
    expect(schema.safeParse({ tab_index: 1.5 }).success).toBe(false);
  });
});

describe("uiCopyParams", () => {
  const schema = z.object(uiCopyParams);

  it("accepts text string", () => {
    expect(schema.safeParse({ text: "hello world" }).success).toBe(true);
  });

  it("requires text field", () => {
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("uiPasteParams", () => {
  const schema = z.object(uiPasteParams);

  it("accepts empty object (no parameters)", () => {
    expect(schema.safeParse({}).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// uiToolSchemas registry
// ---------------------------------------------------------------------------

describe("uiToolSchemas registry", () => {
  const expectedTools = [
    "ui_search_nodes",
    "ui_add_node",
    "ui_connect_nodes",
    "ui_get_graph",
    "ui_update_node_data",
    "ui_delete_node",
    "ui_delete_edge",
    "ui_move_node",
    "ui_set_node_title",
    "ui_set_node_sync_mode",
    "ui_open_workflow",
    "ui_run_workflow",
    "ui_switch_tab",
    "ui_copy",
    "ui_paste"
  ];

  it("contains all expected tool names and nothing extra", () => {
    expect(Object.keys(uiToolSchemas).sort()).toEqual(
      expectedTools.slice().sort()
    );
  });

  it("has exactly 15 tools registered", () => {
    expect(Object.keys(uiToolSchemas)).toHaveLength(15);
  });

  it("every registered tool has description and parameters", () => {
    for (const [, schema] of Object.entries(uiToolSchemas)) {
      expect(typeof schema.description).toBe("string");
      expect(schema.description.length).toBeGreaterThan(0);
      expect(typeof schema.parameters).toBe("object");
      expect(schema.parameters).not.toBeNull();
    }
  });

  it("all parameter values are Zod schemas", () => {
    for (const toolSchema of Object.values(uiToolSchemas)) {
      for (const param of Object.values(toolSchema.parameters)) {
        expect(param).toHaveProperty("safeParse");
        expect(typeof (param as z.ZodTypeAny).safeParse).toBe("function");
      }
    }
  });
});
