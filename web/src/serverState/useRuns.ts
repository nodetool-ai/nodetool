import { useEffect } from "react";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type UseInfiniteQueryResult, type UseQueryResult } from "@tanstack/react-query";
import { storedRunTraceUpdateSchema, type GetRunResult, type GetRunLogsResult, type ListRunsResult, type GetRunTraceResult, type RunListOptions, type RunLogsOptions, type RunTraceOptions } from "@nodetool-ai/protocol";
import { trpcClient } from "../trpc/client";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import { advanceRunCursor, mergeRunTrace, type RunLiveCursor } from "./runTraceCache";

export const runKeys = {
  all: ["runs"] as const,
  lists: () => ["runs", "list"] as const,
  list: (options: RunListOptions) => ["runs", "list", options] as const,
  detail: (id: string | null) => ["runs", id] as const,
  summary: (id: string | null) => ["runs", id, "summary"] as const,
  traces: (id: string) => ["runs", id, "trace"] as const,
  trace: (id: string | null, options: RunTraceOptions) => ["runs", id, "trace", options] as const,
  logs: (id: string | null, options?: RunLogsOptions) => ["runs", id, "logs", options ?? {}] as const,
  cursor: (id: string) => ["runs", id, "cursor"] as const
};

export function useRuns(options: RunListOptions = {}, enabled = true): UseInfiniteQueryResult<InfiniteData<ListRunsResult>, Error> {
  return useInfiniteQuery<ListRunsResult, Error, InfiniteData<ListRunsResult>, ReturnType<typeof runKeys.list>, string | undefined>({
    queryKey: runKeys.list(options),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) => trpcClient.runs.list.query({ ...options, limit: options.limit ?? 50, cursor: pageParam ?? options.cursor }, { signal }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled,
    staleTime: 30_000,
    refetchInterval: 5_000,
    retry: false
  });
}

export function useRun(runId: string | null): UseQueryResult<GetRunResult, Error> {
  return useQuery({
    queryKey: runKeys.summary(runId),
    queryFn: ({ signal }) => { if (!runId) { throw new Error("Choose a run"); } return trpcClient.runs.get.query({ id: runId }, { signal }); },
    enabled: Boolean(runId),
    staleTime: 30_000,
    refetchInterval: (query) => query.state.data?.run.status === "running" ? 2_000 : false,
    retry: false
  });
}

export function useRunTrace(runId: string | null, options: RunTraceOptions = {}): UseQueryResult<GetRunTraceResult, Error> {
  return useQuery({
    queryKey: runKeys.trace(runId, options),
    queryFn: ({ signal }) => { if (!runId) { throw new Error("Choose a run"); } return trpcClient.runs.trace.query({ id: runId, depth: 64, limit: 500, ...options }, { signal }); },
    enabled: Boolean(runId),
    staleTime: 30_000,
    refetchInterval: (query) => query.state.data?.run.status === "running" ? 2_000 : false,
    retry: false
  });
}

export function useRunLogs(runId: string | null, options: RunLogsOptions = {}): UseInfiniteQueryResult<InfiniteData<GetRunLogsResult>, Error> {
  return useInfiniteQuery<GetRunLogsResult, Error, InfiniteData<GetRunLogsResult>, ReturnType<typeof runKeys.logs>, string | undefined>({
    queryKey: runKeys.logs(runId, options),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) => { if (!runId) { throw new Error("Choose a run"); } return trpcClient.runs.logs.query({ id: runId, include_content: true, limit: 100, ...options, cursor: pageParam ?? options.cursor }, { signal }); },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: Boolean(runId),
    staleTime: 30_000,
    refetchInterval: (query) => query.state.data?.pages[0]?.run.status === "running" ? 2_000 : false,
    retry: false
  });
}

/** Socket messages are hints and snapshots of the same durable records. */
export function useRunLiveUpdates(runId: string | null): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!runId) { return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const refresh = () => {
      if (disposed || timer) { return; }
      timer = setTimeout(() => {
        timer = undefined;
        void queryClient.invalidateQueries({ queryKey: runKeys.detail(runId) });
        void queryClient.invalidateQueries({ queryKey: runKeys.lists() });
      }, 150);
    };
    const unsubscribe = globalWebSocketManager.subscribeEvent("message", (message) => {
      if (message.type !== "run_trace" || message.run_id !== runId) { return; }
      const parsed = storedRunTraceUpdateSchema.safeParse(message);
      if (!parsed.success) { return; }
      const update = parsed.data;
      const previous = queryClient.getQueryData<RunLiveCursor>(runKeys.cursor(runId));
      if (previous && update.cursor <= previous.cursor) { return; }
      const cursor = advanceRunCursor(previous, update.cursor, message.resnapshot_required === true);
      queryClient.setQueryData(runKeys.cursor(runId), cursor);
      queryClient.setQueriesData<GetRunTraceResult>({
        queryKey: runKeys.traces(runId),
        predicate: (query) => {
          const options = query.queryKey[3];
          if (!options || typeof options !== "object") { return true; }
          return !("focus_span_id" in options) && !("name" in options) && !("depth" in options && options.depth !== 64) && !("errors_only" in options && options.errors_only === true);
        }
      }, (snapshot) => snapshot ? mergeRunTrace(snapshot, update) : snapshot);
      refresh();
    });
    const offOpen = globalWebSocketManager.subscribeEvent("open", refresh);
    const offClose = globalWebSocketManager.subscribeEvent("close", refresh);
    void globalWebSocketManager.ensureConnection().catch(refresh);
    return () => {
      disposed = true;
      unsubscribe(); offOpen(); offClose();
      if (timer) { clearTimeout(timer); }
    };
  }, [queryClient, runId]);
}
