/**
 * Tests for toolSchemas.ts – Zod tool schemas for UI tools.
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
  uiToolSchemas,
} from "../src/toolSchemas.js";

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

describe("Sub-schemas", () => {
  describe("xyPositionSchema", () => {
    it("accepts valid position", () => {
      expect(xyPositionSchema.parse({ x: 100, y: 200 })).toEqual({
        x: 100,
        y: 200,
      });
    });

    it("rejects missing x", () => {
      expect(() => xyPositionSchema.parse({ y: 200 })).toThrow();
    });

    it("rejects missing y", () => {
      expect(() => xyPositionSchema.parse({ x: 100 })).toThrow();
    });

    it("rejects non-number", () => {
      expect(() =>
        xyPositionSchema.parse({ x: "100", y: 200 })
      ).toThrow();
    });
  });

  describe("positionInputSchema", () => {
    it("accepts xy object", () => {
      const result = positionInputSchema.parse({ x: 10, y: 20 });
      expect(result).toEqual({ x: 10, y: 20 });
    });

    it("accepts string", () => {
      const result = positionInputSchema.parse("auto");
      expect(result).toBe("auto");
    });

    it("rejects number", () => {
      expect(() => positionInputSchema.parse(42)).toThrow();
    });
  });

  describe("nodePropertySchema", () => {
    it("accepts record of string to any", () => {
      const result = nodePropertySchema.parse({ key: "value", num: 42 });
      expect(result).toEqual({ key: "value", num: 42 });
    });

    it("accepts empty object", () => {
      expect(nodePropertySchema.parse({})).toEqual({});
    });
  });

  describe("optionalWorkflowIdSchema", () => {
    it("accepts string", () => {
      expect(optionalWorkflowIdSchema.parse("wf1")).toBe("wf1");
    });

    it("accepts null", () => {
      expect(optionalWorkflowIdSchema.parse(null)).toBeNull();
    });

    it("accepts undefined", () => {
      expect(optionalWorkflowIdSchema.parse(undefined)).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Tool parameter shapes
// ---------------------------------------------------------------------------

describe("Tool parameter shapes", () => {
  it("uiSearchNodesParams validates correctly", () => {
    const schema = z.object(uiSearchNodesParams);
    const result = schema.parse({ query: "image" });
    expect(result.query).toBe("image");
  });

  it("uiSearchNodesParams rejects missing query", () => {
    const schema = z.object(uiSearchNodesParams);
    expect(() => schema.parse({})).toThrow();
  });

  it("uiAddNodeParams validates with optional fields", () => {
    const schema = z.object(uiAddNodeParams);
    const result = schema.parse({ type: "math.Add" });
    expect(result.type).toBe("math.Add");
  });

  it("uiConnectNodesParams requires all connection fields", () => {
    const schema = z.object(uiConnectNodesParams);
    const result = schema.parse({
      source_id: "n1",
      source_handle: "output",
      target_id: "n2",
      target_handle: "input",
    });
    expect(result.source_id).toBe("n1");
  });

  it("uiConnectNodesParams rejects missing fields", () => {
    const schema = z.object(uiConnectNodesParams);
    expect(() => schema.parse({ source_id: "n1" })).toThrow();
  });

  it("uiGetGraphParams accepts empty object", () => {
    const schema = z.object(uiGetGraphParams);
    const result = schema.parse({});
    expect(result.workflow_id).toBeUndefined();
  });

  it("uiUpdateNodeDataParams requires node_id and data", () => {
    const schema = z.object(uiUpdateNodeDataParams);
    const result = schema.parse({
      node_id: "n1",
      data: { value: 42 },
    });
    expect(result.node_id).toBe("n1");
    expect(result.data).toEqual({ value: 42 });
  });

  it("uiDeleteNodeParams requires node_id", () => {
    const schema = z.object(uiDeleteNodeParams);
    const result = schema.parse({ node_id: "n1" });
    expect(result.node_id).toBe("n1");
  });

  it("uiDeleteEdgeParams requires edge_id", () => {
    const schema = z.object(uiDeleteEdgeParams);
    const result = schema.parse({ edge_id: "e1" });
    expect(result.edge_id).toBe("e1");
  });

  it("uiMoveNodeParams requires node_id and position", () => {
    const schema = z.object(uiMoveNodeParams);
    const result = schema.parse({
      node_id: "n1",
      position: { x: 100, y: 200 },
    });
    expect(result.position).toEqual({ x: 100, y: 200 });
  });

  it("uiSetNodeTitleParams requires node_id and title", () => {
    const schema = z.object(uiSetNodeTitleParams);
    const result = schema.parse({ node_id: "n1", title: "My Node" });
    expect(result.title).toBe("My Node");
  });

  it("uiSetNodeSyncModeParams accepts valid modes", () => {
    const schema = z.object(uiSetNodeSyncModeParams);
    expect(schema.parse({ node_id: "n1", mode: "on_any" }).mode).toBe(
      "on_any"
    );
    expect(schema.parse({ node_id: "n1", mode: "zip_all" }).mode).toBe(
      "zip_all"
    );
  });

  it("uiSetNodeSyncModeParams rejects invalid mode", () => {
    const schema = z.object(uiSetNodeSyncModeParams);
    expect(() =>
      schema.parse({ node_id: "n1", mode: "invalid" })
    ).toThrow();
  });

  it("uiOpenWorkflowParams accepts optional fields", () => {
    const schema = z.object(uiOpenWorkflowParams);
    const result = schema.parse({ workflow_id: "wf1" });
    expect(result.workflow_id).toBe("wf1");
  });

  it("uiRunWorkflowParams accepts optional params", () => {
    const schema = z.object(uiRunWorkflowParams);
    const result = schema.parse({
      workflow_id: "wf1",
      params: { key: "value" },
    });
    expect(result.params).toEqual({ key: "value" });
  });

  it("uiSwitchTabParams requires non-negative integer", () => {
    const schema = z.object(uiSwitchTabParams);
    expect(schema.parse({ tab_index: 0 }).tab_index).toBe(0);
    expect(schema.parse({ tab_index: 5 }).tab_index).toBe(5);
  });

  it("uiSwitchTabParams rejects negative index", () => {
    const schema = z.object(uiSwitchTabParams);
    expect(() => schema.parse({ tab_index: -1 })).toThrow();
  });

  it("uiCopyParams requires text", () => {
    const schema = z.object(uiCopyParams);
    const result = schema.parse({ text: "hello" });
    expect(result.text).toBe("hello");
  });

  it("uiPasteParams accepts empty object", () => {
    const schema = z.object(uiPasteParams);
    const result = schema.parse({});
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// uiToolSchemas registry
// ---------------------------------------------------------------------------

describe("uiToolSchemas registry", () => {
  it("contains all expected tool names", () => {
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
      "ui_paste",
    ];
    expect(Object.keys(uiToolSchemas).sort()).toEqual(expectedTools.sort());
  });

  it("every tool has a description and parameters", () => {
    for (const [name, schema] of Object.entries(uiToolSchemas)) {
      expect(schema.description).toBeTruthy();
      expect(typeof schema.description).toBe("string");
      expect(schema.parameters).toBeDefined();
      expect(typeof schema.parameters).toBe("object");
    }
  });

  it("has exactly 15 tools", () => {
    expect(Object.keys(uiToolSchemas)).toHaveLength(15);
  });
});
