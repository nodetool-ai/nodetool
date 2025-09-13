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
  supports_dynamic_outputs: false
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
  supports_dynamic_outputs: false
};
