import { describe, expect, it } from "vitest";
import { workflowDocumentSpec } from "../src/capabilities/ui.specs.js";

const revision = `graph:${"a".repeat(64)}`;
const mutations = [
  ["ui_add_node", { id: "source", type: "nodetool.text.Value", position: { x: 0, y: 0 } }, "position"],
  ["ui_connect_nodes", { source_node_id: "source", source_handle: "value", target_node_id: "target", target_handle: "value" }, "target_handle"],
  ["ui_update_node_data", { node_id: "source", data: { value: "changed" } }, "data"],
  ["ui_delete_node", { node_id: "source" }, "node_id"],
  ["ui_delete_edge", { edge_id: "edge" }, "edge_id"],
  ["ui_move_node", { node_id: "source", position: { x: 1, y: 2 } }, "position"],
  ["ui_set_node_title", { node_id: "source", title: "Renamed" }, "title"]
] as const;

describe("declared workflow mutation inputs", () => {
  it.each(mutations)("%s preserves revision and explicit workflow selection while rejecting invalid edits", (name, valid, required) => {
    const spec = workflowDocumentSpec(name);
    const schema = spec.zodSchema;
    if (!schema) { throw new Error(`Missing argument validator for ${name}`); }
    const selected = { ...valid, workflow_id: "a".repeat(12), based_on_revision: revision };
    expect(schema.parse(selected)).toEqual(selected);
    expect(schema.safeParse({ ...selected, based_on_revision: "graph:stale" }).success).toBe(false);
    expect(schema.safeParse({ ...selected, workflow_id: 42 }).success).toBe(false);
    const incomplete: Record<string, unknown> = { ...selected };
    delete incomplete[required];
    expect(schema.safeParse(incomplete).success).toBe(false);
    expect(schema.safeParse(valid).success).toBe(true);
    expect(spec.category).toBe("write");
  });

  it("ui_get_graph allows the current graph or an explicit owned workflow without requiring mutation arguments", () => {
    const spec = workflowDocumentSpec("ui_get_graph");
    const schema = spec.zodSchema;
    if (!schema) { throw new Error("Missing graph read argument validator"); }
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ workflow_id: null })).toEqual({ workflow_id: null });
    expect(schema.parse({ workflow_id: "a".repeat(12) })).toEqual({ workflow_id: "a".repeat(12) });
    expect(schema.safeParse({ workflow_id: { id: "invalid" } }).success).toBe(false);
    expect(spec.category).toBe("read");
  });
});
