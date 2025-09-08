import { useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { Workflow } from "../stores/ApiTypes";

export const workflowQueryKey = (id: string) => ["workflow", id] as const;

export const fetchWorkflowById = async (id: string): Promise<Workflow> => {
  const { data, error } = await client.GET("/api/workflows/{id}", {
    params: { path: { id } }
  });
  if (error) {
    throw error as Error;
  }
  return data as Workflow;
};

export const useWorkflow = (id: string | null | undefined) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: id ? workflowQueryKey(id) : ["workflow", "none"],
    queryFn: () => fetchWorkflowById(id as string),
    enabled: !!id,
    staleTime: 60 * 1000
  });

  const setWorkflowCache = (workflow: Workflow) => {
    queryClient.setQueryData(workflowQueryKey(workflow.id), workflow);
  };

  return { ...query, setWorkflowCache };
};

export default useWorkflow;
