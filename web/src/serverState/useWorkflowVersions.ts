import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";
import {
  CreateWorkflowVersionRequest,
  WorkflowVersionList
} from "../stores/ApiTypes";

export const workflowVersionsQueryKey = (workflowId: string, limit: number) =>
  ["workflow", workflowId, "versions", limit] as const;

export const useWorkflowVersions = (
  workflowId: string | null | undefined,
  limit: number = 100
) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: workflowId
      ? workflowVersionsQueryKey(workflowId, limit)
      : ["workflow", "none", "versions", limit],
    queryFn: async (): Promise<WorkflowVersionList> => {
      const data = await trpcClient.workflows.versions.list.query({
        id: workflowId as string,
        limit
      });
      return data as unknown as WorkflowVersionList;
    },
    enabled: !!workflowId,
    staleTime: 30 * 1000
  });

  const invalidate = () => {
    if (workflowId) {
      queryClient.invalidateQueries({
        queryKey: ["workflow", workflowId, "versions"]
      });
    }
  };

  const createVersionMutation = useMutation({
    mutationFn: (request: CreateWorkflowVersionRequest) =>
      trpcClient.workflows.versions.create.mutate({
        id: workflowId as string,
        name: request.name ?? undefined,
        description: request.description ?? undefined
      }),
    onSuccess: invalidate
  });

  const restoreVersionMutation = useMutation({
    mutationFn: (version: number) =>
      trpcClient.workflows.versions.restore.mutate({
        id: workflowId as string,
        version
      }),
    onSuccess: invalidate
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (versionId: string) =>
      trpcClient.workflows.versions.delete.mutate({
        id: workflowId as string,
        version_id: versionId
      }),
    onSuccess: invalidate
  });

  return {
    ...query,
    createVersion: createVersionMutation.mutateAsync,
    restoreVersion: restoreVersionMutation.mutateAsync,
    deleteVersion: deleteVersionMutation.mutateAsync,
    isCreatingVersion: createVersionMutation.isPending,
    isRestoringVersion: restoreVersionMutation.isPending,
    isDeletingVersion: deleteVersionMutation.isPending
  };
};

export default useWorkflowVersions;
