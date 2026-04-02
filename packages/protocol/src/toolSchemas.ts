// packages/protocol/src/toolSchemas.ts
//
// Shared Zod tool schemas for frontend UI tools.
// Exported as ZodRawShape (plain objects of Zod types) for:
//   - Agent SDK MCP server registration (electron/src/agent.ts)
//   - Frontend tool validation (web/src/lib/tools/builtin/*.ts wraps with z.object())
//
// If you update a schema here, update the corresponding builtin tool file too.

import { z } from "zod";

// --- Shared sub-schemas ---

export const xyPositionSchema = z.object({ x: z.number(), y: z.number() });
export const positionInputSchema = z.union([xyPositionSchema, z.string()]);
export const nodePropertySchema = z.record(z.string(), z.any());
export const optionalWorkflowIdSchema = z
  .string()
  .nullable()
  .optional()
  .describe(
    "Optional workflow id; when omitted/null, the current workflow is used."
  );

// --- Tool parameter shapes (ZodRawShape for SDK tool()) ---

export const uiSearchNodesParams = {
  query: z.string(),
  input_type: z.string().optional(),
  output_type: z.string().optional(),
  strict_match: z.boolean().optional(),
  include_properties: z.boolean().optional(),
  include_outputs: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional()
};

export const uiAddNodeParams = {
  id: z.string().optional(),
  type: z.string().optional(),
  node_type: z.string().optional(),
  position: positionInputSchema.optional(),
  properties: nodePropertySchema.optional(),
  workflow_id: optionalWorkflowIdSchema
};

export const uiConnectNodesParams = {
  source_id: z.string(),
  source_handle: z.string(),
  target_id: z.string(),
  target_handle: z.string(),
  workflow_id: optionalWorkflowIdSchema
};

export const uiGetGraphParams = {
  workflow_id: optionalWorkflowIdSchema
};

export const uiUpdateNodeDataParams = {
  node_id: z.string(),
  data: z.record(z.string(), z.any()),
  workflow_id: optionalWorkflowIdSchema
};

export const uiDeleteNodeParams = {
  node_id: z.string(),
  workflow_id: optionalWorkflowIdSchema
};

export const uiDeleteEdgeParams = {
  edge_id: z.string(),
  workflow_id: optionalWorkflowIdSchema
};

export const uiMoveNodeParams = {
  node_id: z.string(),
  position: xyPositionSchema,
  workflow_id: optionalWorkflowIdSchema
};

export const uiSetNodeTitleParams = {
  node_id: z.string(),
  title: z.string(),
  workflow_id: optionalWorkflowIdSchema
};

export const uiSetNodeSyncModeParams = {
  node_id: z.string(),
  mode: z.enum(["on_any", "zip_all"]),
  workflow_id: optionalWorkflowIdSchema
};

export const uiOpenWorkflowParams = {
  workflow_id: z.string().optional().describe("Workflow id to target."),
  id: z.string().optional().describe("Alias for workflow_id.")
};

export const uiRunWorkflowParams = {
  workflow_id: z.string().optional().describe("Workflow id to target."),
  id: z.string().optional().describe("Alias for workflow_id."),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional workflow run parameters.")
};

export const uiSwitchTabParams = {
  tab_index: z
    .number()
    .int()
    .min(0)
    .describe("Zero-based tab index (0 is the first tab).")
};

export const uiCopyParams = {
  text: z.string().describe("The text to copy to clipboard.")
};

export const uiPasteParams = {};

// --- Registry for MCP server registration ---
// Only non-hidden tools. ui_graph (hidden) is excluded.

export interface UiToolSchema {
  description: string;
  parameters: Record<string, z.ZodTypeAny>;
}

export const uiToolSchemas: Record<string, UiToolSchema> = {
  ui_search_nodes: {
    description:
      "Search available node types from metadata store by query/type filters.",
    parameters: uiSearchNodesParams
  },
  ui_add_node: {
    description: "Add a node to the current workflow graph.",
    parameters: uiAddNodeParams
  },
  ui_connect_nodes: {
    description: "Connect two nodes via their handles.",
    parameters: uiConnectNodesParams
  },
  ui_get_graph: {
    description: "Get the current workflow graph (nodes and edges).",
    parameters: uiGetGraphParams
  },
  ui_update_node_data: {
    description: "Update an existing node's data/properties.",
    parameters: uiUpdateNodeDataParams
  },
  ui_delete_node: {
    description: "Delete a node from the workflow graph.",
    parameters: uiDeleteNodeParams
  },
  ui_delete_edge: {
    description: "Delete an edge from the workflow graph.",
    parameters: uiDeleteEdgeParams
  },
  ui_move_node: {
    description: "Move a node to a new position.",
    parameters: uiMoveNodeParams
  },
  ui_set_node_title: {
    description: "Set a node's display title.",
    parameters: uiSetNodeTitleParams
  },
  ui_set_node_sync_mode: {
    description: "Set a node's sync mode (on_any or zip_all).",
    parameters: uiSetNodeSyncModeParams
  },
  ui_open_workflow: {
    description: "Open a workflow by ID in a new tab.",
    parameters: uiOpenWorkflowParams
  },
  ui_run_workflow: {
    description: "Run a workflow, optionally passing parameters.",
    parameters: uiRunWorkflowParams
  },
  ui_switch_tab: {
    description: "Switch to a workflow tab by index.",
    parameters: uiSwitchTabParams
  },
  ui_copy: {
    description: "Copy text to the clipboard.",
    parameters: uiCopyParams
  },
  ui_paste: {
    description: "Paste text from the clipboard.",
    parameters: uiPasteParams
  }
};
