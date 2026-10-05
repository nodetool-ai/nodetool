import { useEffect } from "react";
import { getAppSessionToken } from "../lib/appSession";
import { useRuns } from "../serverState/useRuns";
import { useAppRuntimeContext, useRuntimeSelector } from "../components/appbuilder/runtime/AppRuntimeContext";

interface AppOperationRun {
  runId: string | null;
  liveRunMatches: boolean;
  historyLoading: boolean;
  historyError: Error | null;
  traceIncomplete: boolean;
  historyLimited: boolean;
}

/** A live invocation wins. Reloaded widgets resolve history within their own instance. */
export function useAppOperationRun(operationId: string | null): AppOperationRun {
  const { instanceId, designMode } = useAppRuntimeContext();
  const reference = useRuntimeSelector((state) => operationId ? state.runReferences[operationId] : undefined);
  const activeInvocation = useRuntimeSelector((state) => operationId ? state.activeInvocation[operationId] : undefined);
  const referenceInvocation = useRuntimeSelector((state) => reference
    ? state.invocationAliases[reference.invocationId] ?? reference.invocationId : undefined);
  const visitor = getAppSessionToken() !== null;
  const liveRunMatches = Boolean(reference && (!activeInvocation || referenceInvocation === activeInvocation));
  const searchHistory = Boolean(!designMode && !visitor && instanceId && operationId && !activeInvocation && !reference);
  const history = useRuns({ kind: "app", instance_id: instanceId, limit: 100 }, searchHistory);
  const latest = history.data?.pages.flatMap((page) => page.runs).find((run) => run.app?.operation_id === operationId);
  const pages = history.data?.pages.length ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  useEffect(() => {
    if (searchHistory && !latest && hasNextPage && !isFetchingNextPage && pages < 5) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [searchHistory, latest, hasNextPage, isFetchingNextPage, fetchNextPage, pages]);
  return {
    runId: designMode || visitor ? null : liveRunMatches ? reference!.runId : searchHistory ? latest?.id ?? null : null,
    liveRunMatches,
    traceIncomplete: Boolean(liveRunMatches && reference?.traceIncomplete),
    historyLimited: Boolean(searchHistory && !latest && hasNextPage && pages >= 5),
    historyLoading: searchHistory && (history.isLoading || history.isFetchingNextPage),
    historyError: searchHistory ? history.error : null
  };
}
