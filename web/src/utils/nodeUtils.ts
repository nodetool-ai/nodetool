import { NodeMetadata } from "../stores/ApiTypes";

export const GROUP_NODE_TYPE = "nodetool.workflows.base_node.Group";

/**
 * Default metadata used for creating a Group node when
 * backend metadata might be unavailable.
 */
export const GROUP_NODE_METADATA: NodeMetadata = {
  namespace: "default",
  node_type: GROUP_NODE_TYPE,
  properties: [],
  title: "Group",
  description: "Group Node",
  outputs: [],
  the_model_info: {},
  layout: "default",
  recommended_models: [],
  basic_fields: [],
  is_dynamic: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false
};

/**
 * Default metadata used for creating a Comment node.
 */
export const COMMENT_NODE_METADATA: NodeMetadata = {
  namespace: "default",
  node_type: "nodetool.workflows.base_node.Comment",
  properties: [],
  title: "Comment",
  description: "Comment",
  outputs: [],
  the_model_info: {},
  layout: "comment",
  recommended_models: [],
  basic_fields: [],
  is_dynamic: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false
};

// Region node type constants
export const FOREACH_REGION_TYPE = "nodetool.regions.ForEachRegion";
export const IF_REGION_TYPE = "nodetool.regions.IfRegion";

/**
 * Default metadata used for creating a ForEach Region node.
 * ForEach regions execute contained nodes for each item in a list.
 */
export const FOREACH_REGION_METADATA: NodeMetadata = {
  namespace: "nodetool.regions",
  node_type: FOREACH_REGION_TYPE,
  properties: [
    {
      name: "input_list",
      type: { type: "list", optional: false, type_args: [{ type: "any", optional: true, type_args: [] }] },
      default: [],
      description: "Items to iterate over",
      required: false
    }
  ],
  title: "ForEach Region",
  description:
    "Container region that executes contained nodes for each item in a list. Similar to VVVV Gamma's ForEach region.",
  outputs: [
    {
      name: "current_item",
      type: { type: "any", optional: true, type_args: [] },
      stream: false
    },
    {
      name: "current_index",
      type: { type: "int", optional: false, type_args: [] },
      stream: false
    },
    {
      name: "accumulated",
      type: { type: "list", optional: false, type_args: [{ type: "any", optional: true, type_args: [] }] },
      stream: false
    }
  ],
  the_model_info: {},
  layout: "default",
  recommended_models: [],
  basic_fields: ["input_list"],
  is_dynamic: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false
};

/**
 * Default metadata used for creating an If Region node.
 * If regions execute contained nodes conditionally based on a condition.
 */
export const IF_REGION_METADATA: NodeMetadata = {
  namespace: "nodetool.regions",
  node_type: IF_REGION_TYPE,
  properties: [
    {
      name: "condition",
      type: { type: "bool", optional: false, type_args: [] },
      default: false,
      description: "Branch condition",
      required: false
    }
  ],
  title: "If Region",
  description:
    "Container region with true/false branches. Nodes inside execute conditionally based on the condition.",
  outputs: [
    {
      name: "result",
      type: { type: "any", optional: true, type_args: [] },
      stream: false
    }
  ],
  the_model_info: {},
  layout: "default",
  recommended_models: [],
  basic_fields: ["condition"],
  is_dynamic: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false
};

/**
 * Helper function to check if a node type is a region type
 */
export const isRegionNodeType = (nodeType: string): boolean => {
  return nodeType === FOREACH_REGION_TYPE || nodeType === IF_REGION_TYPE;
};
