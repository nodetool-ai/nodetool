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
 * Build a tRPC client using the current API host and session token.
 * Calling this is cheap — each returned client uses the live host/token values
 * at request time through the `url` and `headers` factories.
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
