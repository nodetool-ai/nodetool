import { useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { Workflow } from "../stores/ApiTypes";

export const workflowQueryKey = (id: string) => ["workflow", id] as const;

export const fetchWorkflowById = async (id: string): Promise<Workflow> => {
  const { data, error } = await client.GET("/api/workflows/{id}", {
    params: { path: { id } }
  });
  if (error) {
    throw new Error(JSON.stringify(error));
  }
  return data as Workflow;
};

type WorkflowQueryOptions<T = Workflow> = Omit<UseQueryOptions<Workflow, Error, T>, "queryKey" | "queryFn" | "enabled">;

export const useWorkflow = <T = Workflow>(id: string | null | undefined, options?: WorkflowQueryOptions<T>) => {
  const queryClient = useQueryClient();

  const query = useQuery<Workflow, Error, T>({
    queryKey: id ? workflowQueryKey(id) : ["workflow", "none"],
    queryFn: () => fetchWorkflowById(id as string),
    enabled: !!id,
    staleTime: 60 * 1000,
    ...options as any
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

type WorkflowMeta = {
  id: string;
  name: string;
  description: string;
  updated_at: string;
  created_at: string;
  tags: string[] | null;
};

export const useWorkflowMeta = (id: string | null | undefined) => {
  return useWorkflow<WorkflowMeta>(id, {
    select: (data) => ({
      id: data.id,
      name: data.name,
      description: data.description,
      updated_at: data.updated_at,
      created_at: data.created_at,
      tags: data.tags ?? null
    })
  });
};

export const useWorkflowFromCache = (id: string | null | undefined): Workflow | undefined => {
  const queryClient = useQueryClient();

  if (!id) {return undefined;}

  return queryClient.getQueryData(workflowQueryKey(id));
};

export default useWorkflow;
