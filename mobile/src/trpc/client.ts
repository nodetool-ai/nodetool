/**
 * Mobile tRPC client.
 *
 * Creates a vanilla tRPC client (no React Query) that calls the server's
 * `/trpc` endpoint.  The base URL and auth token are resolved from the same
 * sources the REST `apiService` uses so both clients share consistent
 * session / host configuration without a circular import.
 */

import { createTRPCClient, httpBatchLink, type TRPCClientErrorLike } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@nodetool/websocket/trpc';

import { getApiHost } from '../services/apiHost';
import { useAuthStore } from '../stores/AuthStore';

/**
 * Build a tRPC client bound to the current API host.
 *
 * The host URL is captured at client-creation time (httpBatchLink resolves
 * `url` once when the link is built), so callers must recreate the client
 * whenever `getApiHost()` changes — the auth token, by contrast, is read
 * per-request via the async `headers` factory.
 */
export function createMobileTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getApiHost()}/trpc`,
        transformer: superjson,
        async headers() {
          const session = useAuthStore.getState().session;
          const token = session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

export type TRPCClientError = TRPCClientErrorLike<AppRouter>;
