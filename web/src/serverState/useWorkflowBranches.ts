import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { WorkflowBranch } from "../stores/VersionHistoryStore";

const API_BASE = "/api/workflows";

export const workflowBranchesQueryKey = (workflowId: string) =>
  ["workflow", workflowId, "branches"] as const;

const handleApiError = async (response: Response): Promise<void> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
};

export interface CreateBranchRequest {
  name: string;
  description?: string;
  base_version: number;
  parent_branch_id?: string;
}

export const fetchWorkflowBranches = async (
  workflowId: string
): Promise<WorkflowBranch[]> => {
  const response = await fetch(`${API_BASE}/${workflowId}/branches`);
  await handleApiError(response);
  return response.json() as Promise<WorkflowBranch[]>;
};

export const createWorkflowBranch = async (
  workflowId: string,
  request: CreateBranchRequest
): Promise<WorkflowBranch> => {
  const response = await fetch(`${API_BASE}/${workflowId}/branches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  await handleApiError(response);
  return response.json() as Promise<WorkflowBranch>;
};

export const deleteWorkflowBranch = async (
  workflowId: string,
  branchId: string
): Promise<void> => {
  const response = await fetch(`${API_BASE}/${workflowId}/branches/${branchId}`, {
    method: "DELETE"
  });
  await handleApiError(response);
};

export const switchWorkflowBranch = async (
  workflowId: string,
  branchId: string
): Promise<void> => {
  const response = await fetch(`${API_BASE}/${workflowId}/branches/${branchId}/switch`, {
    method: "POST"
  });
  await handleApiError(response);
};

export const useWorkflowBranches = (workflowId: string | null | undefined) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: workflowId ? workflowBranchesQueryKey(workflowId) : ["workflow", "none", "branches"],
    queryFn: () => fetchWorkflowBranches(workflowId as string),
    enabled: !!workflowId,
    staleTime: 30 * 1000
  });

  const createBranchMutation = useMutation({
    mutationFn: (request: CreateBranchRequest) =>
      createWorkflowBranch(workflowId as string, request),
    onSuccess: () => {
      if (workflowId) {
        queryClient.invalidateQueries({
          queryKey: workflowBranchesQueryKey(workflowId)
        });
      }
    }
  });

  const deleteBranchMutation = useMutation({
    mutationFn: (branchId: string) =>
      deleteWorkflowBranch(workflowId as string, branchId),
    onSuccess: () => {
      if (workflowId) {
        queryClient.invalidateQueries({
          queryKey: workflowBranchesQueryKey(workflowId)
        });
      }
    }
  });

  const switchBranchMutation = useMutation({
    mutationFn: (branchId: string) =>
      switchWorkflowBranch(workflowId as string, branchId),
    onSuccess: () => {
      if (workflowId) {
        queryClient.invalidateQueries({
          queryKey: workflowBranchesQueryKey(workflowId)
        });
        queryClient.invalidateQueries({
          queryKey: ["workflow", workflowId, "versions"]
        });
      }
    }
  });

  return {
    ...query,
    createBranch: createBranchMutation.mutateAsync,
    deleteBranch: deleteBranchMutation.mutateAsync,
    switchBranch: switchBranchMutation.mutateAsync,
    isCreatingBranch: createBranchMutation.isPending,
    isDeletingBranch: deleteBranchMutation.isPending,
    isSwitchingBranch: switchBranchMutation.isPending
  };
};

export default useWorkflowBranches;
