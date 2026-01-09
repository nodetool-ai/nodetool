import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { WorkflowVersion, WorkflowVersionList, CreateWorkflowVersionRequest } from "../stores/ApiTypes";

const API_BASE = "/api/workflows";

export const workflowVersionsQueryKey = (workflowId: string) =>
  ["workflow", workflowId, "versions"] as const;

const handleApiError = async (response: Response): Promise<void> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
};

export const fetchWorkflowVersions = async (
  workflowId: string,
  cursor?: number | null,
  limit: number = 100
): Promise<WorkflowVersionList> => {
  const params = new URLSearchParams();
  if (cursor !== null && cursor !== undefined) {
    params.set("cursor", String(cursor));
  }
  params.set("limit", String(limit));

  const response = await fetch(
    `${API_BASE}/${workflowId}/versions?${params.toString()}`
  );
  await handleApiError(response);
  const result = await response.json();
  return result as Promise<WorkflowVersionList>;
};

export const fetchWorkflowVersion = async (
  workflowId: string,
  version: number
): Promise<WorkflowVersion> => {
  const response = await fetch(
    `${API_BASE}/${workflowId}/versions/${version}`
  );
  await handleApiError(response);
  const result = await response.json();
  return result as Promise<WorkflowVersion>;
};

export const createWorkflowVersion = async (
  workflowId: string,
  request: CreateWorkflowVersionRequest
): Promise<WorkflowVersion> => {
  const response = await fetch(`${API_BASE}/${workflowId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  await handleApiError(response);
  return response.json() as Promise<WorkflowVersion>;
};

export const restoreWorkflowVersion = async (
  workflowId: string,
  version: number
): Promise<void> => {
  const response = await fetch(
    `${API_BASE}/${workflowId}/versions/${version}/restore`,
    { method: "POST" }
  );
  await handleApiError(response);
};

export const pinWorkflowVersion = async (
  workflowId: string,
  version: number
): Promise<WorkflowVersion> => {
  const response = await fetch(
    `${API_BASE}/${workflowId}/versions/${version}/pin`,
    { method: "POST" }
  );
  await handleApiError(response);
  return response.json() as Promise<WorkflowVersion>;
};

export const unpinWorkflowVersion = async (
  workflowId: string,
  version: number
): Promise<WorkflowVersion> => {
  const response = await fetch(
    `${API_BASE}/${workflowId}/versions/${version}/unpin`,
    { method: "POST" }
  );
  await handleApiError(response);
  return response.json() as Promise<WorkflowVersion>;
};

export const useWorkflowVersions = (
  workflowId: string | null | undefined,
  limit: number = 100
) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: workflowId ? workflowVersionsQueryKey(workflowId) : ["workflow", "none", "versions"],
    queryFn: () => fetchWorkflowVersions(workflowId as string, null, limit),
    enabled: !!workflowId,
    staleTime: 30 * 1000
  });

  const createVersionMutation = useMutation({
    mutationFn: (request: CreateWorkflowVersionRequest) =>
      createWorkflowVersion(workflowId as string, request),
    onSuccess: () => {
      if (workflowId) {
        queryClient.invalidateQueries({
          queryKey: workflowVersionsQueryKey(workflowId)
        });
      }
    }
  });

  const restoreVersionMutation = useMutation({
    mutationFn: (version: number) => restoreWorkflowVersion(workflowId as string, version),
    onSuccess: () => {
      if (workflowId) {
        queryClient.invalidateQueries({
          queryKey: workflowVersionsQueryKey(workflowId)
        });
      }
    }
  });

  const pinVersionMutation = useMutation({
    mutationFn: (version: number) => pinWorkflowVersion(workflowId as string, version),
    onSuccess: () => {
      if (workflowId) {
        queryClient.invalidateQueries({
          queryKey: workflowVersionsQueryKey(workflowId)
        });
      }
    }
  });

  const unpinVersionMutation = useMutation({
    mutationFn: (version: number) => unpinWorkflowVersion(workflowId as string, version),
    onSuccess: () => {
      if (workflowId) {
        queryClient.invalidateQueries({
          queryKey: workflowVersionsQueryKey(workflowId)
        });
      }
    }
  });

  return {
    ...query,
    createVersion: createVersionMutation.mutateAsync,
    restoreVersion: restoreVersionMutation.mutateAsync,
    pinVersion: pinVersionMutation.mutateAsync,
    unpinVersion: unpinVersionMutation.mutateAsync,
    isCreatingVersion: createVersionMutation.isPending,
    isRestoringVersion: restoreVersionMutation.isPending,
    isPinningVersion: pinVersionMutation.isPending,
    isUnpinningVersion: unpinVersionMutation.isPending
  };
};

export default useWorkflowVersions;
