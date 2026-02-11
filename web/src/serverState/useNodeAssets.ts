/**
 * useNodeAssets hook for loading assets associated with a specific node.
 *
 * Used for displaying the historical assets created by a node across runs.
 */

import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { Asset } from "../stores/ApiTypes";
import log from "loglevel";

/**
 * Fetch assets for a specific node.
 */
export const fetchNodeAssets = async (nodeId: string): Promise<Asset[]> => {
  try {
    const { data, error } = await client.GET("/api/assets/", {
      params: {
        query: {
          node_id: nodeId
        }
      }
    });

    if (error) {
      throw error;
    }

    return data?.assets || [];
  } catch (error) {
    log.error("Failed to fetch node assets:", error);
    throw error;
  }
};

/**
 * Hook to load assets for a specific node.
 * By default, this is disabled and must be manually fetched.
 */
export const useNodeAssets = (nodeId: string | null, enabled = false) => {
  return useQuery({
    queryKey: ["assets", { node_id: nodeId }],
    queryFn: () => {
      if (!nodeId) {
        return Promise.resolve([]);
      }
      return fetchNodeAssets(nodeId);
    },
    enabled: !!nodeId && enabled,
    staleTime: 60000 // 1 minute
  });
};

export default useNodeAssets;
