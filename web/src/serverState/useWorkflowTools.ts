import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";
import { WorkflowTool } from "../stores/ApiTypes";

export const useWorkflowTools = () => {
  const { data, error, isLoading } = useQuery({
    queryKey: ["workflow-tools"],
    queryFn: async (): Promise<WorkflowTool[]> => {
      const result = await trpcClient.workflows.tools.query({ limit: 100 });
      return (result?.workflows as WorkflowTool[]) ?? [];
    },
    refetchInterval: 1000 * 60 * 5 // 5 minutes
  });

  return {
    workflowTools: data ?? [],
    workflowToolsError: error,
    workflowToolsLoading: isLoading
  };
};

export default useWorkflowTools;
