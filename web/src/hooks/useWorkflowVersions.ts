import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import type { WorkflowVersion } from "../stores/VersionHistoryStore";

interface WorkflowVersionsResponse {
  versions: WorkflowVersion[];
}

async function fetchWorkflowVersions(workflowId: string): Promise<WorkflowVersion[]> {
  const response = await client.GET("/api/workflows/{workflow_id}/versions", {
    params: { path: { workflow_id: workflowId } },
  });

  if (response.error) {
    throw new Error(`Failed to fetch versions: ${response.error}`);
  }

  return (response.data as WorkflowVersionsResponse)?.versions || [];
}

export function useWorkflowVersions(workflowId: string | null) {
  return useQuery({
    queryKey: ["workflow-versions", workflowId],
    queryFn: () => (workflowId ? fetchWorkflowVersions(workflowId) : []),
    enabled: Boolean(workflowId),
    staleTime: 30000,
  });
}

export default useWorkflowVersions;
