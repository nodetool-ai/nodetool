import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { WorkflowTool } from "../stores/ApiTypes";

export const useWorkflowTools = () => {
  const { data, error, isLoading } = useQuery({
    queryKey: ["workflow-tools"],
    queryFn: async (): Promise<WorkflowTool[]> => {
      const { data, error } = await client.GET("/api/workflows/tools");
      if (error) {
        throw error as Error;
      }
      return (data?.workflows as WorkflowTool[]) || [];
    },
    refetchInterval: 1000 * 60 * 5 // 5 minutes
  });

  return {
    workflowTools: data ?? [],
    workflowToolsError: error as Error | null,
    workflowToolsLoading: isLoading
  };
};

export default useWorkflowTools;
