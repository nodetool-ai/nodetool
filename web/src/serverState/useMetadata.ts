import { NodeTypes } from "@xyflow/react";
import { UnifiedModel, NodeMetadata } from "../stores/ApiTypes";
import BaseNode from "../components/node/BaseNode";
import { client } from "../stores/ApiClient";
import useMetadataStore from "../stores/MetadataStore";
import { createConnectabilityMatrix } from "../components/node_menu/typeFilterUtils";

const defaultMetadata: Record<string, NodeMetadata> = {
  "nodetool.workflows.base_node.Preview": {
    title: "Preview",
    description: "Preview",
    namespace: "default",
    node_type: "nodetool.workflows.base_node.Preview",
    layout: "default",
    basic_fields: [],
    is_dynamic: false,
    properties: [
      {
        name: "value",
        type: {
          type: "any",
          optional: true,
          type_args: []
        },
        required: false
      }
    ],
    outputs: [],
    the_model_info: {},
    recommended_models: [],
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false
  },
  "nodetool.workflows.base_node.Comment": {
    title: "Comment",
    description: "Add a comment or annotation to your workflow",
    namespace: "default",
    node_type: "nodetool.workflows.base_node.Comment",
    layout: "comment",
    basic_fields: [],
    is_dynamic: false,
    properties: [
      {
        name: "comment",
        type: {
          type: "any",
          optional: true,
          type_args: []
        },
        required: false
      },
      {
        name: "comment_color",
        type: {
          type: "string",
          optional: true,
          type_args: []
        },
        required: false
      }
    ],
    outputs: [],
    the_model_info: {},
    recommended_models: [],
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false
  }
};

export const loadMetadata = async () => {
  const { data, error } = await client.GET("/api/nodes/metadata", {});
  if (error) {
    console.error(error);
    return "error";
  }

  const nodeTypes: NodeTypes = {};
  const metadataByType: Record<string, NodeMetadata> = { ...defaultMetadata };

  data.forEach((md: NodeMetadata) => {
    nodeTypes[md.node_type] = BaseNode;
    metadataByType[md.node_type] = md;
  });

  // Register special node types that don't come from backend
  const { default: CommentNode } = await import(
    "../components/node/CommentNode"
  );
  nodeTypes["nodetool.workflows.base_node.Comment"] = CommentNode;

  const recommendedModels = data.reduce<UnifiedModel[]>(
    (result, md) => [...result, ...md.recommended_models],
    []
  );

  // deduplicate by type, repo_id, path
  const uniqueRecommendedModels = Array.from(
    recommendedModels.reduce((acc, model) => {
      const key = `${model.type ?? ""}:${model.repo_id ?? ""}:${
        model.path ?? ""
      }`;
      if (!acc.has(key)) {
        acc.set(key, model);
      }
      return acc;
    }, new Map<string, UnifiedModel>()).values()
  );

  useMetadataStore.getState().setMetadata(metadataByType);
  useMetadataStore.getState().setRecommendedModels(uniqueRecommendedModels);
  useMetadataStore.getState().setNodeTypes(nodeTypes);

  createConnectabilityMatrix(Object.values(metadataByType));

  return "success";
};
