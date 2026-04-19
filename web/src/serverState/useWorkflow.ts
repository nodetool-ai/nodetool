import { useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";
import { Workflow } from "../stores/ApiTypes";

export const workflowQueryKey = (id: string) => ["workflow", id] as const;

export const fetchWorkflowById = async (id: string): Promise<Workflow> => {
  const data = await trpcClient.workflows.get.query({ id });
  return data as Workflow;
};

type WorkflowQueryOptions<T = Workflow> = Omit<UseQueryOptions<Workflow, Error, T>, "queryKey" | "queryFn">;

export const useWorkflow = <T = Workflow>(id: string | null | undefined, options?: WorkflowQueryOptions<T>) => {
  const queryClient = useQueryClient();

  const query = useQuery<Workflow, Error, T>({
    queryKey: id ? workflowQueryKey(id) : ["workflow", "none"],
    queryFn: () => fetchWorkflowById(id as string),
    enabled: !!id,
    staleTime: 60 * 1000,
    ...options
  });

  const setWorkflowCache = (workflow: Workflow) => {
    queryClient.setQueryData(workflowQueryKey(workflow.id), workflow);
  };

  const prefetchWorkflow = async () => {
    if (id) {
      await queryClient.prefetchQuery({
        queryKey: workflowQueryKey(id),
        queryFn: () => fetchWorkflowById(id)
      });
    }
  };

  return { ...query, setWorkflowCache, prefetchWorkflow };
};

export default useWorkflow;
