import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
  type UseMutationResult
} from "@tanstack/react-query";
import { useAuth } from "../stores/useAuth";
import { isAuthRequired } from "../lib/runtimeConfig";
import { getAppSessionToken } from "../lib/appSession";
import {
  advanceAppInstance,
  createAppInstance,
  deleteAppInstance,
  duplicateAppInstance,
  listAppInstanceMetadata,
  loadAppInstance,
  renameAppInstance,
  type AppInstanceListOptions,
  type AppInstanceMetadataPage,
  type ServerAppInstance
} from "../components/appbuilder/runtime/appInstanceApi";

export const appInstanceKeys = {
  account: (account: string) => ["app-instances", account] as const,
  lists: (account: string, scope: AppInstanceListOptions) =>
    [
      "app-instances",
      account,
      "list",
      scope.application_id ?? null,
      scope.source_id ?? null
    ] as const,
  list: (account: string, options: AppInstanceListOptions) =>
    [...appInstanceKeys.lists(account, options), options] as const,
  detail: (account: string, id: string | null) =>
    ["app-instances", account, id, ""] as const
};

function useInstanceAccount(): string {
  return (
    useAuth((state) => state.user?.id) ?? (isAuthRequired() ? "anonymous" : "1")
  );
}

export function useAppInstances(
  options: AppInstanceListOptions,
  enabled = true
): UseInfiniteQueryResult<InfiniteData<AppInstanceMetadataPage>, Error> {
  const account = useInstanceAccount();
  return useInfiniteQuery({
    queryKey: appInstanceKeys.list(account, options),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listAppInstanceMetadata(
        { ...options, cursor: pageParam ?? options.cursor },
        signal
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled:
      enabled && account !== "anonymous" && getAppSessionToken() === null,
    staleTime: 30_000,
    retry: false
  });
}

export function useManagedAppInstance(
  id: string | null
): UseQueryResult<ServerAppInstance, Error> {
  const account = useInstanceAccount();
  return useQuery({
    queryKey: appInstanceKeys.detail(account, id),
    queryFn: ({ signal }) => {
      if (!id) {
        throw new Error("Choose an instance");
      }
      return loadAppInstance(id, signal);
    },
    enabled:
      Boolean(id) && account !== "anonymous" && getAppSessionToken() === null,
    staleTime: 0,
    retry: false
  });
}

export interface AppInstanceMutations {
  create: UseMutationResult<ServerAppInstance, Error, unknown>;
  rename: UseMutationResult<
    ServerAppInstance,
    Error,
    { id: string; expected_revision: number; name: string }
  >;
  duplicate: UseMutationResult<
    ServerAppInstance,
    Error,
    { id: string; name?: string }
  >;
  advance: UseMutationResult<
    ServerAppInstance,
    Error,
    { id: string; expected_revision: number; version: number }
  >;
  remove: UseMutationResult<void, Error, string>;
}

export function useAppInstanceMutations(
  scope: AppInstanceListOptions
): AppInstanceMutations {
  const account = useInstanceAccount();
  const client = useQueryClient();
  const guard = () => {
    if (account === "anonymous" || getAppSessionToken() !== null) {
      throw new Error("Instance management requires an owner session.");
    }
  };
  const refresh = async (instance: ServerAppInstance) => {
    if (instance.user_id !== account) {
      return;
    }
    client.setQueryData(appInstanceKeys.detail(account, instance.id), instance);
    client.setQueriesData<ServerAppInstance>(
      {
        queryKey: appInstanceKeys.account(account),
        predicate: (query) => {
          const data = query.state.data;
          return (
            typeof data === "object" &&
            data !== null &&
            "id" in data &&
            data.id === instance.id
          );
        }
      },
      instance
    );
    await client.invalidateQueries({
      queryKey: appInstanceKeys.lists(account, scope)
    });
    await client.invalidateQueries({
      queryKey: ["app-instances", account, instance.id]
    });
  };
  const create = useMutation({
    mutationFn: (body: unknown) => {
      guard();
      return createAppInstance(body);
    },
    onSuccess: refresh,
    retry: false
  });
  const rename = useMutation({
    mutationFn: (input: {
      id: string;
      expected_revision: number;
      name: string;
    }) => {
      guard();
      return renameAppInstance(input.id, input.expected_revision, input.name);
    },
    onSuccess: refresh,
    retry: false
  });
  const duplicate = useMutation({
    mutationFn: (input: { id: string; name?: string }) => {
      guard();
      return duplicateAppInstance(input.id, input.name);
    },
    onSuccess: refresh,
    retry: false
  });
  const advance = useMutation({
    mutationFn: (input: {
      id: string;
      expected_revision: number;
      version: number;
    }) => {
      guard();
      return advanceAppInstance(
        input.id,
        input.expected_revision,
        input.version
      );
    },
    onSuccess: refresh,
    retry: false
  });
  const remove = useMutation({
    mutationFn: (id: string) => {
      guard();
      return deleteAppInstance(id);
    },
    onSuccess: async (_, id) => {
      client.removeQueries({ queryKey: ["app-instances", account, id] });
      client.removeQueries({
        queryKey: appInstanceKeys.account(account),
        predicate: (query) => {
          const data = query.state.data;
          return (
            typeof data === "object" &&
            data !== null &&
            "id" in data &&
            data.id === id
          );
        }
      });
      await client.invalidateQueries({
        queryKey: appInstanceKeys.lists(account, scope)
      });
    },
    retry: false
  });
  return { create, rename, duplicate, advance, remove };
}
