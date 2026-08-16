import { QueryClient, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { isOnlineState } from './hooks/useNetworkStatus';
import { isNumber, isRecord, isString } from './utils/typePredicates';

/**
 * How long a persisted cache entry stays usable after a cold start. Queries
 * must outlive this in memory too, otherwise React Query garbage-collects them
 * before they are ever written back — hence `gcTime === PERSIST_MAX_AGE`.
 */
export const PERSIST_MAX_AGE = 24 * 60 * 60_000;

/**
 * Teach React Query about connectivity so queries *pause* while offline
 * instead of failing, and resume (with `refetchOnReconnect`) when the network
 * returns. Without this, RN's `onlineManager` assumes the app is always online.
 */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(isOnlineState(state));
  })
);

/**
 * Pull an HTTP status code off an error, if one is present.
 *
 * tRPC surfaces failures as `TRPCClientError` whose `data.httpStatus` carries
 * the response code; plain `fetch`/REST failures may attach `status`. We avoid a
 * hard dependency on the tRPC error class and just read the shape structurally.
 */
function httpStatusFromError(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  if ('status' in error && isNumber(error.status)) {
    return error.status;
  }
  if (
    'data' in error &&
    isRecord(error.data) &&
    'httpStatus' in error.data &&
    isNumber(error.data.httpStatus)
  ) {
    return error.data.httpStatus;
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
      // Matches the persisted cache's max age: a query dropped from memory
      // sooner would never make it into the AsyncStorage snapshot.
      gcTime: PERSIST_MAX_AGE,
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

/**
 * Query-key segments that must never reach AsyncStorage.
 *
 * The secrets router (`trpc.settings.secrets.list`, keyed as
 * `[['settings','secrets','list'], …]`) returns API-key metadata; writing it to
 * unencrypted device storage would outlive the session for no benefit — the
 * screen is useless offline anyway.
 */
const NON_PERSISTED_KEY_SEGMENTS = new Set(['secrets', 'secret']);

/** Collect the string segments of a query key, including tRPC's nested path array. */
function keySegments(queryKey: readonly unknown[]): string[] {
  const segments: string[] = [];
  for (const part of queryKey) {
    if (isString(part)) {
      segments.push(part);
    } else if (Array.isArray(part)) {
      for (const nested of part) {
        if (isString(nested)) {
          segments.push(nested);
        }
      }
    }
  }
  return segments;
}

/** True when a query is safe to write to the on-device cache. */
export function isPersistableQueryKey(queryKey: readonly unknown[]): boolean {
  return !keySegments(queryKey).some((segment) =>
    NON_PERSISTED_KEY_SEGMENTS.has(segment)
  );
}
