import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { CONTROL_NODES } from "./nodes/control.js";
import { VARIABLE_NODES } from "./nodes/variable.js";
import { CONSTANT_NODES } from "./nodes/constant.js";
import { FAKE_MEDIA_NODES } from "./nodes/fake-media.js";
import { EXTENDED_PLACEHOLDER_NODES } from "./nodes/extended-placeholders.js";
import { INPUT_NODES } from "./nodes/input.js";
import { WORKFLOW_NODES } from "./nodes/workflow.js";
import { APP_NODES } from "./nodes/app.js";
import { SUBGRAPH_NODES } from "./nodes/subgraph.js";
import { COMPARE_NODES } from "./nodes/compare.js";
import { ENTITY_NODES } from "./nodes/entity.js";
import { VECTOR_NODES } from "./nodes/vector.js";

export * from "./nodes/control.js";
export * from "./nodes/compare.js";
export * from "./nodes/constant.js";
export * from "./nodes/fake-media.js";
export * from "./nodes/variable.js";
export * from "./nodes/input.js";
export * from "./nodes/subgraph.js";
export * from "./nodes/workflow.js";
export * from "./nodes/app.js";
export * from "./nodes/vector.js";
export * from "./nodes/extended-placeholders.js";
export * from "./nodes/entity.js";

export const ALL_CORE_NODES: readonly NodeClass[] = [
  ...CONTROL_NODES,
  ...VARIABLE_NODES,
  ...CONSTANT_NODES,
  ...FAKE_MEDIA_NODES,
  ...EXTENDED_PLACEHOLDER_NODES,
  ...INPUT_NODES,
  ...WORKFLOW_NODES,
  ...APP_NODES,
  ...SUBGRAPH_NODES,
  ...COMPARE_NODES,
  ...ENTITY_NODES,
  ...VECTOR_NODES,
];

export function registerCoreNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_CORE_NODES) {
    if (nodeClass.nodeType === "nodetool.workflows.workflow_node.Workflow") {
      registry.register(nodeClass, {
        metadata: {
          title: "Workflow",
          description:
            "Execute a sub-workflow. Select a workflow to populate its inputs and outputs dynamically.",
          namespace: "nodetool.workflows.workflow_node",
          node_type: "nodetool.workflows.workflow_node.Workflow",
          supports_dynamic_inputs: true,
          is_streaming_output: true,
          properties: [
            {
              name: "workflow_id",
              type: { type: "str", type_args: [] },
              default: ""
            },
            {
              name: "workflow_json",
              type: { type: "dict", type_args: [] },
              default: {}
            }
          ],
          outputs: [],
          inline_fields: []
        }
      });
      continue;
    }
    if (nodeClass.nodeType === "nodetool.workflows.app_node.App") {
      registry.register(nodeClass, {
        metadata: {
          title: "App",
          description: nodeClass.description,
          namespace: "nodetool.workflows.app_node",
          node_type: "nodetool.workflows.app_node.App",
          supports_dynamic_inputs: true,
          supports_dynamic_outputs: true,
          is_streaming_output: true,
          properties: [
            {
              name: "app_id",
              type: { type: "str", type_args: [] },
              default: ""
            },
            {
              name: "app_json",
              type: { type: "dict", type_args: [] },
              default: {}
            }
          ],
          outputs: [],
          inline_fields: []
        }
      });
      continue;
    }
    if (nodeClass.nodeType === "nodetool.workflows.subgraph.Subgraph") {
      registry.register(nodeClass, {
        metadata: {
          title: "Subgraph",
          description:
            "Execute an inline sub-graph as an isolated workflow. Inputs/outputs are derived from inner Input/Output nodes.",
          namespace: "nodetool.workflows.subgraph",
          node_type: "nodetool.workflows.subgraph.Subgraph",
          supports_dynamic_inputs: true,
          supports_dynamic_outputs: true,
          is_streaming_output: true,
          properties: [
            {
              name: "graph",
              type: { type: "dict", type_args: [] },
              default: { nodes: [], edges: [] }
            }
          ],
          outputs: [],
          inline_fields: []
        }
      });
      continue;
    }
    registry.register(nodeClass);
  }
}
