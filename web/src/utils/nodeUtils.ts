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

// Subpatch node types
export const SUBPATCH_NODE_TYPE = "nodetool.workflow.Subpatch";
export const WORKFLOW_INPUT_NODE_TYPE = "nodetool.workflow.WorkflowInput";
export const WORKFLOW_OUTPUT_NODE_TYPE = "nodetool.workflow.WorkflowOutput";

/**
 * Metadata for a Subpatch node that references another workflow.
 * The actual inputs/outputs are dynamically determined from the referenced workflow.
 */
export const SUBPATCH_NODE_METADATA: NodeMetadata = {
  namespace: "nodetool.workflow",
  node_type: SUBPATCH_NODE_TYPE,
  properties: [
    {
      name: "workflow_ref",
      type: {
        type: "string",
        optional: false,
        type_args: []
      },
      description: "ID of the referenced workflow",
      required: true
    }
  ],
  title: "Subpatch",
  description: "A reusable workflow component that executes another workflow as a single node",
  outputs: [],
  the_model_info: {},
  layout: "default",
  recommended_models: [],
  basic_fields: ["workflow_ref"],
  is_dynamic: true,
  expose_as_tool: false,
  supports_dynamic_outputs: true,
  is_streaming_output: false
};

/**
 * Metadata for a WorkflowInput node that defines an exposed input on a subpatch.
 */
export const WORKFLOW_INPUT_NODE_METADATA: NodeMetadata = {
  namespace: "nodetool.workflow",
  node_type: WORKFLOW_INPUT_NODE_TYPE,
  properties: [
    {
      name: "name",
      type: {
        type: "string",
        optional: false,
        type_args: []
      },
      description: "Name of the input parameter",
      required: true
    },
    {
      name: "input_type",
      type: {
        type: "string",
        optional: false,
        type_args: []
      },
      description: "Data type of the input (e.g., string, int, float, image)",
      required: true,
      default: "any"
    },
    {
      name: "default_value",
      type: {
        type: "any",
        optional: true,
        type_args: []
      },
      description: "Default value for the input",
      required: false
    },
    {
      name: "description",
      type: {
        type: "string",
        optional: true,
        type_args: []
      },
      description: "Description of the input parameter",
      required: false
    }
  ],
  title: "Workflow Input",
  description: "Defines an input parameter that will be exposed when this workflow is used as a subpatch",
  outputs: [
    {
      name: "value",
      type: {
        type: "any",
        optional: false,
        type_args: []
      },
      stream: false
    }
  ],
  the_model_info: {},
  layout: "default",
  recommended_models: [],
  basic_fields: ["name", "input_type"],
  is_dynamic: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false
};

/**
 * Metadata for a WorkflowOutput node that defines an exposed output from a subpatch.
 */
export const WORKFLOW_OUTPUT_NODE_METADATA: NodeMetadata = {
  namespace: "nodetool.workflow",
  node_type: WORKFLOW_OUTPUT_NODE_TYPE,
  properties: [
    {
      name: "name",
      type: {
        type: "string",
        optional: false,
        type_args: []
      },
      description: "Name of the output",
      required: true
    },
    {
      name: "output_type",
      type: {
        type: "string",
        optional: false,
        type_args: []
      },
      description: "Data type of the output (e.g., string, int, float, image)",
      required: true,
      default: "any"
    },
    {
      name: "value",
      type: {
        type: "any",
        optional: false,
        type_args: []
      },
      description: "The value to output from this workflow",
      required: true
    }
  ],
  title: "Workflow Output",
  description: "Defines an output that will be exposed when this workflow is used as a subpatch",
  outputs: [],
  the_model_info: {},
  layout: "default",
  recommended_models: [],
  basic_fields: ["name", "output_type", "value"],
  is_dynamic: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false
};
