/**
 * Mobile tRPC clients.
 *
 * Two clients share one link configuration:
 *  - `trpc`: the React Query client (`@trpc/react-query`) used by screens and
 *    components through `trpc.<router>.<proc>.useQuery()/useMutation()`.
 *  - `createMobileTRPCClient()`: a vanilla client for non-React callers
 *    (Zustand stores, helpers) where hooks can't run.
 *
 * Both resolve the base URL and auth token from the same sources so session /
 * host configuration stays consistent.
 */

import { createTRPCClient, httpBatchLink, type TRPCClient, type TRPCLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@nodetool-ai/websocket/trpc';

import { getApiHost } from '../services/apiHost';
import { fetchWithTimeout } from '../services/fetchWithTimeout';
import { useAuthStore } from '../stores/AuthStore';
import { isString } from '../utils/typePredicates';

/** Keep mobile's batch limit aligned with the server policy. */
const TRPC_MAX_BATCH_SIZE = 20;

/** React Query bindings (`trpc.workflows.list.useQuery(...)`, etc.). */
export const trpc = createTRPCReact<AppRouter>();

/** Procedure result types, e.g. `RouterOutputs['workflows']['list']`. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Rewrite the request origin to the *current* API host at send time.
 *
 * `httpBatchLink` captures its `url` once at creation, but the React Query
 * client is long-lived while the host can change in Settings. Re-targeting the
 * host here keeps that single client (and the per-call vanilla client) pointed
 * at whatever host is configured now, without recreating either.
 */
export async function hostRewriteFetch(
  input: RequestInfo | URL,
  options?: RequestInit
): Promise<Response> {
  const raw =
    isString(input)
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const trpcIndex = raw.lastIndexOf('/trpc');
  const path = trpcIndex >= 0 ? raw.slice(trpcIndex) : raw;
  const url = `${getApiHost()}${path}`;
  // Every procedure mobile calls is request/response (no subscriptions or
  // streaming links), so one timeout covers them all.
  const response = await fetchWithTimeout(url, options);
  if (response.status !== 401) {
    // A 403 is a permission error on one resource, not a dead session.
    return response;
  }
  // A 401 usually means the access token lapsed: refresh it once and resend.
  // `refreshSession` signs out when the refresh itself fails. The server
  // rejected the request before running it, so resending a mutation is safe.
  if (!(await useAuthStore.getState().refreshSession())) {
    return response;
  }
  const headers = new Headers(options?.headers);
  const token = useAuthStore.getState().session?.access_token;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetchWithTimeout(url, { ...options, headers });
}

export function createTrpcLinks(): TRPCLink<AppRouter>[] {
  return [
    httpBatchLink({
      url: `${getApiHost()}/trpc`,
      // Cap the batch: tRPC joins every procedure name into one URL path
      // segment, and Fastify's router rejects a segment over `maxParamLength`
      // with a 404. A model-picker mount batched 116 procedures into a ~2900
      // char path and got nothing back.
      maxItems: TRPC_MAX_BATCH_SIZE,
      // POST keeps the batched input in the request body instead of the URL,
      // so large batches stay under reverse-proxy URL-length limits. See #3979.
      methodOverride: 'POST',
      headers: authHeaders,
      fetch: hostRewriteFetch,
    }),
  ];
}

/** Vanilla client for Zustand stores and other non-React contexts. */
export function createMobileTRPCClient(): Readonly<TRPCClient<AppRouter>> {
  return createTRPCClient<AppRouter>({ links: createTrpcLinks() });
}
