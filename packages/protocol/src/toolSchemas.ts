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
  id: z
    .string()
    .describe(
      "Unique node id within the workflow. Must be a stable, model-chosen string (e.g. 'llm_1', 'image_out')."
    ),
  type: z
    .string()
    .describe(
      "Node type identifier from `ui_search_nodes` (e.g. 'nodetool.text.Format'). Same as `node_type` in search results."
    ),
  position: positionInputSchema.describe(
    "Canvas coordinates: `{ x: number, y: number }`. Space nodes ~240px horizontally, ~160px vertically."
  ),
  properties: nodePropertySchema
    .optional()
    .describe(
      "Optional initial property values keyed by property name. Required properties left unset will be reported as warnings."
    ),
  workflow_id: optionalWorkflowIdSchema
};

export const uiConnectNodesParams = {
  source_node_id: z
    .string()
    .describe("Id of the node producing the value."),
  source_handle: z
    .string()
    .describe(
      "Output port name on the source node (from `outputs[].name` in ui_search_nodes)."
    ),
  target_node_id: z
    .string()
    .describe("Id of the node consuming the value."),
  target_handle: z
    .string()
    .describe(
      "Input port name on the target node (the property name from `properties[].name` in ui_search_nodes)."
    ),
  workflow_id: optionalWorkflowIdSchema
};

export const uiGetGraphParams = {
  workflow_id: optionalWorkflowIdSchema
};

export const uiUpdateNodeDataParams = {
  node_id: z.string().describe("Id of the node to update."),
  data: z
    .record(z.string(), z.any())
    .describe(
      "Partial node-data overlay merged into `data` (e.g. `{ properties: { x: 1 }, title: 'New' }`). Unspecified keys are preserved."
    ),
  workflow_id: optionalWorkflowIdSchema
};

export const uiDeleteNodeParams = {
  node_id: z.string().describe("Id of the node to delete."),
  workflow_id: optionalWorkflowIdSchema
};

export const uiDeleteEdgeParams = {
  edge_id: z.string().describe("Id of the edge to delete."),
  workflow_id: optionalWorkflowIdSchema
};

export const uiMoveNodeParams = {
  node_id: z.string().describe("Id of the node to move."),
  position: xyPositionSchema.describe(
    "Absolute canvas coordinates `{x, y}` (numbers, not a string)."
  ),
  workflow_id: optionalWorkflowIdSchema
};

export const uiSetNodeTitleParams = {
  node_id: z.string().describe("Id of the node whose title to set."),
  title: z.string().describe("New display title for the node."),
  workflow_id: optionalWorkflowIdSchema
};

export const uiSetNodeSyncModeParams = {
  node_id: z.string().describe("Id of the node whose sync mode to set."),
  mode: z
    .enum(["on_any", "zip_all"])
    .describe(
      "`on_any`: process as soon as any input arrives. `zip_all`: wait for all inputs and pair them in arrival order."
    ),
  workflow_id: optionalWorkflowIdSchema
};

export const uiOpenWorkflowParams = {
  workflow_id: z.string().describe("Id of the workflow to open.")
};

export const uiRunWorkflowParams = {
  workflow_id: z.string().describe("Id of the workflow to run."),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Optional workflow input parameters keyed by input-node name."
    )
};

export const uiSwitchTabParams = {
  tab_index: z
    .number()
    .int()
    .min(0)
    .describe("Zero-based tab index (0 is the first tab).")
};

export const MODEL_SEARCH_KINDS = [
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video",
  "text_to_speech",
  "speech_to_text",
  "text_generation",
  "embedding"
] as const;

export const uiSearchModelsParams = {
  kind: z
    .enum(MODEL_SEARCH_KINDS)
    .describe(
      "Model task category. Match to the AI node you're configuring: " +
        "`text_to_image` for nodetool.image.TextToImage, `image_to_image` for nodetool.image.ImageToImage, " +
        "`text_to_video` for nodetool.video.TextToVideo, `image_to_video` for nodetool.video.ImageToVideo, " +
        "`text_to_speech` for nodetool.audio.TextToSpeech, `speech_to_text` for nodetool.text.AutomaticSpeechRecognition, " +
        "`text_generation` for nodetool.agents.* and nodetool.generators.*, `embedding` for nodetool.text.Embedding."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max results to return (default 20).")
};

export const uiCopyParams = {
  text: z.string().describe("The text to copy to the system clipboard.")
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
  ui_search_models: {
    description:
      "List recommended/available AI models for a given task. Required: `kind` (one of: text_to_image, image_to_image, text_to_video, image_to_video, text_to_speech, speech_to_text, text_generation, embedding). Returns model ids you can write to a generic AI node's `model` property via ui_update_node_data.",
    parameters: uiSearchModelsParams
  },
  ui_add_node: {
    description:
      "Add a single node to the current workflow graph. Required: `id` (unique within workflow), `type` (from ui_search_nodes), `position` ({x,y}). Optional: `properties` (initial values).",
    parameters: uiAddNodeParams
  },
  ui_connect_nodes: {
    description:
      "Connect two nodes by port name. Required: `source_node_id`, `source_handle` (output name), `target_node_id`, `target_handle` (input/property name).",
    parameters: uiConnectNodesParams
  },
  ui_get_graph: {
    description:
      "Get the current workflow graph (nodes and edges). No required arguments.",
    parameters: uiGetGraphParams
  },
  ui_update_node_data: {
    description:
      "Merge a partial overlay into a node's `data` (properties, title, sync_mode, etc.). Required: `node_id`, `data`.",
    parameters: uiUpdateNodeDataParams
  },
  ui_delete_node: {
    description:
      "Delete a node from the workflow graph. Required: `node_id`.",
    parameters: uiDeleteNodeParams
  },
  ui_delete_edge: {
    description:
      "Delete an edge from the workflow graph. Required: `edge_id`.",
    parameters: uiDeleteEdgeParams
  },
  ui_move_node: {
    description:
      "Move a node to an absolute canvas position. Required: `node_id`, `position` ({x, y}).",
    parameters: uiMoveNodeParams
  },
  ui_set_node_title: {
    description:
      "Set a node's display title. Required: `node_id`, `title`.",
    parameters: uiSetNodeTitleParams
  },
  ui_set_node_sync_mode: {
    description:
      "Set a node's input sync mode. Required: `node_id`, `mode` ('on_any' | 'zip_all').",
    parameters: uiSetNodeSyncModeParams
  },
  ui_open_workflow: {
    description:
      "Open a workflow tab and switch to it. Required: `workflow_id`.",
    parameters: uiOpenWorkflowParams
  },
  ui_run_workflow: {
    description:
      "Run a workflow. Required: `workflow_id`. Optional: `params` (input values).",
    parameters: uiRunWorkflowParams
  },
  ui_switch_tab: {
    description:
      "Switch to an already-open workflow tab. Required: `tab_index` (0-based).",
    parameters: uiSwitchTabParams
  },
  ui_copy: {
    description: "Copy text to the system clipboard. Required: `text`.",
    parameters: uiCopyParams
  },
  ui_paste: {
    description:
      "Read the system clipboard and return its text content. No arguments.",
    parameters: uiPasteParams
  }
};
