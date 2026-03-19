import { useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import type { WorkspaceResponse } from "../stores/ApiTypes";

export const workspaceQueryKey = (id: string) => ["workspace", id] as const;
export const workspaceListQueryKey = () => ["workspaces"] as const;

export const fetchWorkspaceById = async (id: string): Promise<WorkspaceResponse> => {
  const { data, error } = await client.GET("/api/workspaces/{workspace_id}", {
    params: { path: { workspace_id: id } }
  });
  if (error) {
    throw new Error(JSON.stringify(error));
  }
  return data as WorkspaceResponse;
};

export const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { data, error } = await client.GET("/api/workspaces/");
  if (error) {
    throw new Error(JSON.stringify(error));
  }
  return (data as any).workspaces ?? (data as unknown as WorkspaceResponse[]);
};

type WorkspaceQueryOptions<T = WorkspaceResponse> = Omit<
  UseQueryOptions<WorkspaceResponse, Error, T>,
  "queryKey" | "queryFn"
>;

export function useWorkspace<T = WorkspaceResponse>(
  id: string | null | undefined,
  options?: WorkspaceQueryOptions<T>
) {
  const queryClient = useQueryClient();

  const query = useQuery<WorkspaceResponse, Error, T>({
    queryKey: id ? workspaceQueryKey(id) : ["workspace", "none"],
    queryFn: () => fetchWorkspaceById(id as string),
    enabled: !!id,
    staleTime: 60 * 1000,
    ...(options as any)
  });

  const setWorkspaceCache = (workspace: WorkspaceResponse) => {
    queryClient.setQueryData(workspaceQueryKey(workspace.id), workspace);
  };

  const prefetchWorkspace = async () => {
    if (id) {
      await queryClient.prefetchQuery({
        queryKey: workspaceQueryKey(id),
        queryFn: () => fetchWorkspaceById(id)
      });
    }
  };

  return { ...query, setWorkspaceCache, prefetchWorkspace };
}

export function useWorkspaces() {
  return useQuery<WorkspaceResponse[], Error>({
    queryKey: workspaceListQueryKey(),
    queryFn: fetchWorkspaces,
    staleTime: 60 * 1000
  });
}

export default useWorkspace;
