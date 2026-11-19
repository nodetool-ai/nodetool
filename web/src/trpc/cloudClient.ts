/**
 * The tRPC client of a cloud server in the desktop app (technical design,
 * "Cloud tRPC client"; WP1.15). The cloud runs the same server, so the
 * router type is `AppRouter`. Its links send through the main process,
 * which adds the account's credential: the page never holds a token.
 */
import { createTRPCClient, type TRPCClient } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { createCloudFetch, type CloudRequester } from "../lib/cloud/cloudFetch";
import { createTrpcLinks, syncProtocolHeaders } from "./links";

export function createCloudTrpcClient(
  serverOrigin: string,
  request: CloudRequester
): Readonly<TRPCClient<AppRouter>> {
  return createTRPCClient<AppRouter>({
    links: createTrpcLinks({
      url: `${serverOrigin}/trpc`,
      headers: syncProtocolHeaders,
      fetch: createCloudFetch(serverOrigin, request)
    })
  });
}
