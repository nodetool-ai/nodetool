import { useQuery } from "@tanstack/react-query";
import { NodeTypes } from "reactflow";
import { NodeMetadata } from "../stores/ApiTypes";
import BaseNode from "../components/node/BaseNode";
import { client } from "../stores/ApiClient";
import useMetadataStore from "../stores/MetadataStore";

const defaultMetadata: Record<string, NodeMetadata> = {
  "nodetool.workflows.base_node.Preview": {
    title: "Preview",
    description: "Preview",
    namespace: "default",
    node_type: "nodetool.workflows.base_node.Preview",
    layout: "default",
    properties: [
      {
        name: "value",
        type: {
          type: "any"
        }
      }
    ],
    outputs: [],
    model_info: {}
  }
};

export const metadataQuery = async () => {
  const { data, error } = await client.GET("/api/nodes/metadata", {});
  if (error) {
    throw error;
  }

  const nodeTypes = data.reduce((prev: NodeTypes, md: NodeMetadata) => {
    prev[md.node_type] = BaseNode;
    return prev;
  }, {});

  const metadataByType = data.reduce<Record<string, NodeMetadata>>(
    (result, md) => ({
      ...result,
      [md.node_type]: md
    }),
    defaultMetadata
  );

  useMetadataStore.getState().setMetadata(metadataByType);

  return { metadata: data, nodeTypes, metadataByType };
};

export const useMetadata = () =>
  useQuery({
    queryKey: ["metadata"],
    queryFn: metadataQuery,
    staleTime: 1000 * 60 * 60 * 24
  });

// export const useMetadatas = () => {
//   const { data } = useFetchMetadata();
//   return data?.metadata || [];
// };

export const useMetadataOrNull = (nodeType: string) => {
  const { data } = useMetadata();
  return data?.metadataByType[nodeType];
};

export const useNodeTypes = (): Record<string, any> => {
  const { data } = useMetadata();
  return data?.nodeTypes || [];
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
