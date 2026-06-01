import { NodeMetadata } from "../stores/ApiTypes";
import { GROUP_NODE_TYPE, COMMENT_NODE_TYPE } from "../constants/nodeTypes";

export { GROUP_NODE_TYPE };

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

  layout: "default",
  recommended_models: [],
  supports_dynamic_inputs: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false,
  required_settings: []
};

/**
 * Default metadata used for creating a Comment node.
 */
export const COMMENT_NODE_METADATA: NodeMetadata = {
  namespace: "default",
  node_type: COMMENT_NODE_TYPE,
  properties: [],
  title: "Comment",
  description: "Comment",
  outputs: [],

  layout: "comment",
  recommended_models: [],
  supports_dynamic_inputs: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false,
  required_settings: []
};
