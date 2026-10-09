import { sha256Hex } from "./sha256.js";
import { isBoolean, isNumber, isRecord, isString } from "./predicates.js";

export const WORKFLOW_REVISION_TOOL_NAMES = [
  "ui_get_graph",
  "ui_add_node",
  "ui_connect_nodes",
  "ui_update_node_data",
  "ui_delete_node",
  "ui_delete_edge",
  "ui_move_node",
  "ui_set_node_title"
] as const;

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function enumValues(value: unknown): Array<string | number> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const values = value.filter(
    (entry): entry is string | number => isString(entry) || isNumber(entry)
  );
  return values.length > 0 ? values : null;
}

/** Match the editor's hydration of legacy flat dynamic input declarations. */
function inputType(value: unknown): Record<string, unknown> {
  const type = record(value);
  return {
    type: isString(value) ? value : isString(type.type) ? type.type : "any",
    optional: type.optional === true,
    values: enumValues(type.values) ?? enumValues(type.enum),
    type_args: Array.isArray(type.type_args)
      ? type.type_args.map(inputType)
      : [],
    type_name: isString(type.type_name) ? type.type_name : null
  };
}

function dynamicInputs(value: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record(value)).map(([name, value]) => {
      const slot = record(value);
      const type = isRecord(slot.type) ? slot.type : value;
      const normalized: Record<string, unknown> = { type: inputType(type) };
      if (isString(slot.description)) {
        normalized.description = slot.description;
      }
      if (slot.default !== undefined) {
        normalized.default = slot.default;
      }
      if (isBoolean(slot.required)) {
        normalized.required = slot.required;
      }
      if (isNumber(slot.min)) {
        normalized.min = slot.min;
      }
      if (isNumber(slot.max)) {
        normalized.max = slot.max;
      }
      return [name, normalized];
    })
  );
}

/** A content revision of persistent graph direction, excluding transient editor state. */
export function workflowDocumentRevision(
  workflowId: string,
  nodes: readonly unknown[],
  edges: readonly unknown[],
  links: readonly unknown[] = []
): string {
  const graph = {
    workflow_id: workflowId,
    nodes: nodes.map((value) => {
      const node = record(value);
      const data = record(node.data);
      return {
        id: node.id,
        type: node.type,
        parent_id: node.parentId || node.parent_id || null,
        position: node.position ?? { x: 0, y: 0 },
        data: {
          properties: data.properties ?? {},
          dynamic_properties: data.dynamic_properties ?? {},
          dynamic_inputs: dynamicInputs(data.dynamic_inputs),
          dynamic_outputs: data.dynamic_outputs ?? {},
          title: data.title,
          color: data.color,
          collapsed: data.collapsed === true,
          bypassed: data.bypassed === true,
          model_id: data.model_id,
          endpoint_id: data.endpoint_id,
          selected_generation: data.selected_generation,
          selected_generations: data.selected_generations,
          setupStepId: data.setupStepId
        }
      };
    }),
    edges: edges.map((value) => {
      const edge = record(value);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || null,
        targetHandle: edge.targetHandle || null,
        edge_type: edge.edge_type === "control" || edge.type === "control" || record(edge.data).edge_type === "control"
          ? "control" : "data"
      };
    }),
    // Omitted when empty so revisions of graphs without links are unchanged.
    ...(links.length > 0
      ? {
          links: links.map((value) => {
            const link = record(value);
            return {
              id: link.id,
              source: link.source,
              target: link.target,
              label: link.label ?? null,
              kind: link.kind ?? null
            };
          })
        }
      : {})
  };
  const canonical = JSON.stringify(graph, (_key, value: unknown) => {
    if (isRecord(value)) {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, value[key]])
      );
    }
    return value;
  });
  return `graph:${sha256Hex(canonical)}`;
}
