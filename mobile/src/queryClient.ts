import { QueryClient } from '@tanstack/react-query';

/**
 * Pull an HTTP status code off an error, if one is present.
 *
 * tRPC surfaces failures as `TRPCClientError` whose `data.httpStatus` carries
 * the response code; plain `fetch`/REST failures may attach `status`. We avoid a
 * hard dependency on the tRPC error class and just read the shape structurally.
 */
function httpStatusFromError(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const e = error as { status?: unknown; data?: { httpStatus?: unknown } };
  if (typeof e.status === 'number') {
    return e.status;
  }
  if (typeof e.data?.httpStatus === 'number') {
    return e.data.httpStatus;
  }
  return undefined;
}

/**
 * Retry transient failures only. A 4xx (bad request, unauthorized, not found)
 * will not succeed on retry and just delays the error reaching the UI — most
 * importantly, retrying a 401 storms the server while the session is expired.
 * Network errors (no status) and 5xx are retried up to twice.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) {
    return false;
  }
  const status = httpStatusFromError(error);
  if (status !== undefined && status >= 400 && status < 500) {
    return false;
  }
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Treat data as fresh for 30s so navigating between screens doesn't
      // refetch everything; the WebSocket and pull-to-refresh keep things live.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      // Mobile networks drop constantly; refetch when connectivity returns.
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});
