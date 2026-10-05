import { isAuthRequired } from "../lib/runtimeConfig";
import { useAuth } from "../stores/useAuth";
import { useEffect } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult
} from "@tanstack/react-query";
import {
  storedRunTraceUpdateSchema,
  type GetRunResult,
  type GetRunLogsResult,
  type ListRunsResult,
  type GetRunTraceResult,
  type RunListOptions,
  type RunLogsOptions,
  type RunTraceOptions
} from "@nodetool-ai/protocol";
import { trpcClient } from "../trpc/client";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import {
  advanceRunCursor,
  mergeRunTrace,
  type RunLiveCursor
} from "./runTraceCache";

export const runKeys = {
  all: ["runs"] as const,
  lists: (account = "1") => ["runs", account, "list"] as const,
  list: (options: RunListOptions, account = "1") =>
    ["runs", account, "list", options] as const,
  detail: (id: string | null, account = "1") => ["runs", account, id] as const,
  content: (id: string | null, account = "1") =>
    ["runs", account, id, "content"] as const,
  summary: (id: string | null, account = "1") =>
    ["runs", account, id, "summary"] as const,
  traces: (id: string, account = "1") =>
    ["runs", account, id, "trace"] as const,
  trace: (id: string | null, options: RunTraceOptions, account = "1") =>
    ["runs", account, id, "trace", options] as const,
  logs: (id: string | null, options?: RunLogsOptions, account = "1") =>
    ["runs", account, id, "logs", options ?? {}] as const,
  cursor: (id: string, account = "1") =>
    ["runs", account, id, "cursor"] as const
};

export function useRuns(
  options: RunListOptions = {},
  enabled = true
): UseInfiniteQueryResult<InfiniteData<ListRunsResult>, Error> {
  const account =
    useAuth((state) => state.user?.id) ??
    (isAuthRequired() ? "anonymous" : "1");
  return useInfiniteQuery<
    ListRunsResult,
    Error,
    InfiniteData<ListRunsResult>,
    ReturnType<typeof runKeys.list>,
    string | undefined
  >({
    queryKey: runKeys.list(options, account),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) =>
      trpcClient.runs.list.query(
        {
          ...options,
          limit: options.limit ?? 50,
          cursor: pageParam ?? options.cursor
        },
        { signal }
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: enabled && account !== "anonymous",
    staleTime: 30_000,
    refetchInterval: 5_000,
    retry: false
  });
}

export function useRun(
  runId: string | null
): UseQueryResult<GetRunResult, Error> {
  const account =
    useAuth((state) => state.user?.id) ??
    (isAuthRequired() ? "anonymous" : "1");
  return useQuery({
    queryKey: runKeys.summary(runId, account),
    queryFn: ({ signal }) => {
      if (!runId) {
        throw new Error("Choose a run");
      }
      return trpcClient.runs.get.query({ id: runId }, { signal });
    },
    enabled: Boolean(runId) && account !== "anonymous",
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.run.status === "running" ? 2_000 : false,
    retry: false
  });
}

export function useRunContent(
  runId: string | null
): UseQueryResult<GetRunResult, Error> {
  const account =
    useAuth((state) => state.user?.id) ??
    (isAuthRequired() ? "anonymous" : "1");
  return useQuery({
    queryKey: runKeys.content(runId, account),
    queryFn: ({ signal }) => {
      if (!runId) {
        throw new Error("Choose a run");
      }
      return trpcClient.runs.get.query(
        { id: runId, include_content: true },
        { signal }
      );
    },
    enabled: Boolean(runId) && account !== "anonymous",
    staleTime: 0,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.run.status === "running" ? 2_000 : false
  });
}

export function useRunTrace(
  runId: string | null,
  options: RunTraceOptions = {}
): UseQueryResult<GetRunTraceResult, Error> {
  const account =
    useAuth((state) => state.user?.id) ??
    (isAuthRequired() ? "anonymous" : "1");
  return useQuery({
    queryKey: runKeys.trace(runId, options, account),
    queryFn: ({ signal }) => {
      if (!runId) {
        throw new Error("Choose a run");
      }
      return trpcClient.runs.trace.query(
        { id: runId, depth: 64, limit: 500, ...options },
        { signal }
      );
    },
    enabled: Boolean(runId) && account !== "anonymous",
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.run.status === "running" ? 2_000 : false,
    retry: false
  });
}

export function useRunLogs(
  runId: string | null,
  options: RunLogsOptions = {}
): UseInfiniteQueryResult<InfiniteData<GetRunLogsResult>, Error> {
  const account =
    useAuth((state) => state.user?.id) ??
    (isAuthRequired() ? "anonymous" : "1");
  return useInfiniteQuery<
    GetRunLogsResult,
    Error,
    InfiniteData<GetRunLogsResult>,
    ReturnType<typeof runKeys.logs>,
    string | undefined
  >({
    queryKey: runKeys.logs(runId, options, account),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) => {
      if (!runId) {
        throw new Error("Choose a run");
      }
      return trpcClient.runs.logs.query(
        {
          id: runId,
          include_content: true,
          limit: 100,
          ...options,
          cursor: pageParam ?? options.cursor
        },
        { signal }
      );
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: Boolean(runId) && account !== "anonymous",
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.pages[0]?.run.status === "running" ? 2_000 : false,
    retry: false
  });
}

/** Socket messages are hints and snapshots of the same durable records. */
export function useRunLiveUpdates(runId: string | null): void {
  const account =
    useAuth((state) => state.user?.id) ??
    (isAuthRequired() ? "anonymous" : "1");
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!runId || account === "anonymous") {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const refresh = () => {
      if (disposed || timer) {
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        void queryClient.invalidateQueries({
          queryKey: runKeys.detail(runId, account)
        });
        void queryClient.invalidateQueries({
          queryKey: runKeys.lists(account)
        });
      }, 150);
    };
    const unsubscribe = globalWebSocketManager.subscribeEvent(
      "message",
      (message) => {
        if (message.type !== "run_trace" || message.run_id !== runId) {
          return;
        }
        const parsed = storedRunTraceUpdateSchema.safeParse(message);
        if (!parsed.success) {
          return;
        }
        const update = parsed.data;
        const previous = queryClient.getQueryData<RunLiveCursor>(
          runKeys.cursor(runId, account)
        );
        if (previous && update.cursor <= previous.cursor) {
          return;
        }
        const cursor = advanceRunCursor(
          previous,
          update.cursor,
          message.resnapshot_required === true
        );
        queryClient.setQueryData(runKeys.cursor(runId, account), cursor);
        queryClient.setQueriesData<GetRunTraceResult>(
          {
            queryKey: runKeys.traces(runId, account),
            predicate: (query) => {
              const options = query.queryKey[4];
              if (!options || typeof options !== "object") {
                return true;
              }
              return (
                !("focus_span_id" in options) &&
                !("name" in options) &&
                !("depth" in options && options.depth !== 64) &&
                !("errors_only" in options && options.errors_only === true)
              );
            }
          },
          (snapshot) => (snapshot ? mergeRunTrace(snapshot, update) : snapshot)
        );
        refresh();
      }
    );
    const offOpen = globalWebSocketManager.subscribeEvent("open", refresh);
    const offClose = globalWebSocketManager.subscribeEvent("close", refresh);
    void globalWebSocketManager.ensureConnection().catch(refresh);
    return () => {
      disposed = true;
      unsubscribe();
      offOpen();
      offClose();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [queryClient, runId, account]);
}
