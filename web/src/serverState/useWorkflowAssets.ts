/**
 * useWorkflowAssets hook for loading and managing workflow-scoped assets.
 *
 * Uses TanStack Query for caching and automatic refetching.
 * Integrates with WorkflowAssetStore for state management.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkflowAssetStore } from "../stores/WorkflowAssetStore";
import { useAssetStore } from "../stores/AssetStore";

export const useWorkflowAssets = (workflowId: string | null) => {
  const queryClient = useQueryClient();
  const loadWorkflowAssets = useWorkflowAssetStore(
    (state) => state.loadWorkflowAssets
  );
  const workflowAssets = useWorkflowAssetStore((state) =>
    workflowId ? state.getWorkflowAssets(workflowId) : []
  );
  const createAsset = useAssetStore((state) => state.createAsset);

  // Query for workflow assets
  const {
    data: assets,
    error,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["assets", { workflow_id: workflowId }],
    queryFn: () => {
      if (!workflowId) {
        return Promise.resolve([]);
      }
      return loadWorkflowAssets(workflowId);
    },
    enabled: !!workflowId,
    staleTime: 30000 // 30 seconds
  });

  // Upload asset mutation with workflow_id
  const uploadAssetMutation = useMutation({
    mutationFn: async ({
      file,
      onProgress
    }: {
      file: File;
      onProgress?: (progress: number) => void;
    }) => {
      if (!workflowId) {
        throw new Error("No workflow ID provided");
      }
      return createAsset(file, workflowId, null, (progressEvent) => {
        const progress = progressEvent.lengthComputable
          ? (progressEvent.loaded / progressEvent.total) * 100
          : 0;
        onProgress?.(progress);
      });
    },
    onSuccess: () => {
      // Invalidate workflow assets query to refetch
      queryClient.invalidateQueries({
        queryKey: ["assets", { workflow_id: workflowId }]
      });
    }
  });

  return {
    assets: assets || workflowAssets,
    isLoading,
    error,
    refetch,
    uploadAsset: uploadAssetMutation.mutate,
    isUploading: uploadAssetMutation.isPending
  };
};

export default useWorkflowAssets;
