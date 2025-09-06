import { NodeTypes } from "@xyflow/react";
import { HuggingFaceModel, NodeMetadata } from "../stores/ApiTypes";
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
        }
      }
    ],
    outputs: [],
    the_model_info: {},
    recommended_models: [],
    is_streaming: false,
    expose_as_tool: false,
    supports_dynamic_outputs: false
  }
};

export const loadMetadata = async () => {
  const { data, error } = await client.GET("/api/nodes/metadata", {});
  if (error) {
    console.error(error);
    return "error";
  }

  const nodeTypes = data.reduce((prev: NodeTypes, md: NodeMetadata) => {
    prev[md.node_type] = BaseNode;
    return prev;
  }, {});

  useMetadataStore.getState().setNodeTypes(nodeTypes);

  const metadataByType = data.reduce<Record<string, NodeMetadata>>(
    (result, md) => ({
      ...result,
      [md.node_type]: md
    }),
    defaultMetadata
  );

  const recommendedModels = data.reduce<HuggingFaceModel[]>(
    (result, md) => [...result, ...md.recommended_models],
    []
  );

  // deduplicate by type, repo_id, path
  const uniqueRecommendedModels = recommendedModels.filter(
    (model, index, self) =>
      index ===
      self.findIndex(
        (t) =>
          t.type === model.type &&
          t.repo_id === model.repo_id &&
          t.path === model.path
      )
  );

  useMetadataStore.getState().setMetadata(metadataByType);
  useMetadataStore.getState().setRecommendedModels(uniqueRecommendedModels);
  useMetadataStore.getState().setNodeTypes(nodeTypes);

  createConnectabilityMatrix(Object.values(metadataByType));

  return "success";
};

// export const useNodeDefaultProperties = (nodeType: string) => {
//   const metadata = useMetadata(nodeType);
//   if (!metadata) {
//     return {};
//   }
//   return metadata.properties.reduce<Record<string, any>>(
//     (acc, property) => ({
//       ...acc,
//       [property.name]: property.default
//     }),
//     {}
//   );
// };
