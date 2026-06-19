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
import superjson from 'superjson';
import type { AppRouter } from '@nodetool-ai/websocket/trpc';

import { getApiHost } from '../services/apiHost';
import { useAuthStore } from '../stores/AuthStore';

/** React Query bindings (`trpc.workflows.list.useQuery(...)`, etc.). */
export const trpc = createTRPCReact<AppRouter>();

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
function hostRewriteFetch(
  input: RequestInfo | URL,
  options?: RequestInit
): Promise<Response> {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const trpcIndex = raw.lastIndexOf('/trpc');
  const path = trpcIndex >= 0 ? raw.slice(trpcIndex) : raw;
  return fetch(`${getApiHost()}${path}`, options);
}

export function createTrpcLinks(): TRPCLink<AppRouter>[] {
  return [
    httpBatchLink({
      url: `${getApiHost()}/trpc`,
      transformer: superjson,
      headers: authHeaders,
      fetch: hostRewriteFetch,
    }),
  ];
}

/** Vanilla client for Zustand stores and other non-React contexts. */
export function createMobileTRPCClient(): Readonly<TRPCClient<AppRouter>> {
  return createTRPCClient<AppRouter>({ links: createTrpcLinks() });
}
