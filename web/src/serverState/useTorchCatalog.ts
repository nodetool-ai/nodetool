import { useEffect } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";
import useMetadataStore from "../stores/MetadataStore";

export const torchCatalogQueryKey = ["torch", "catalog"] as const;

/** Registry metadata belongs to the compiler, and is shared by every canvas. */
type TorchCatalog = Awaited<ReturnType<typeof trpcClient.torch.catalog.query>>;

export const useTorchCatalog = (
  enabled = true
): UseQueryResult<TorchCatalog, Error> => {
  const query = useQuery({
    queryKey: torchCatalogQueryKey,
    queryFn: () => trpcClient.torch.catalog.query(),
    enabled,
    staleTime: Infinity,
    retry: false
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }
    let disposed = false;
    const nodes = query.data.nodes;
    void import("../components/node/BaseNode").then(({ default: BaseNode }) => {
      if (disposed) {
        return;
      }
      const store = useMetadataStore.getState();
      const metadata = { ...store.metadata };
      const nodeTypes = { ...store.nodeTypes };
      for (const node of nodes) {
        metadata[node.node_type] = node;
        nodeTypes[node.node_type] = BaseNode;
      }
      store.setMetadata(metadata);
      store.setNodeTypes(nodeTypes);
    });
    return () => {
      disposed = true;
    };
  }, [query.data]);

  return query;
};
