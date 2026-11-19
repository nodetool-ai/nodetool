/**
 * The desktop app's cloud account as the renderer sees it, and the cloud
 * tRPC client of its server (technical design, "Cloud tRPC client"; WP1.15).
 * The state holds no token.
 */
import { useEffect, useMemo, useState } from "react";
import type { TRPCClient } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";

import { createCloudTrpcClient } from "../../trpc/cloudClient";
import type { CloudAccountState } from "../../window";
import { desktopCloudRequester } from "./cloudFetch";
import type { DocumentOrigin } from "./documentOrigin";

type CloudOrigin = Extract<DocumentOrigin, { kind: "cloud" }>;

/** The account's state, or null in a browser and until the first answer. */
export function useCloudAccountState(): CloudAccountState | null {
  const [state, setState] = useState<CloudAccountState | null>(null);
  useEffect(() => {
    const account = typeof window !== "undefined" ? window.api?.cloudAccount : undefined;
    if (!account) {
      return undefined;
    }
    let active = true;
    const unsubscribe = account.onChange((next) => {
      if (active) {
        setState(next);
      }
    });
    account.state().then(
      (next) => {
        if (active) {
          setState(next);
        }
      },
      () => undefined
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return state;
}

/**
 * The origin of the account's cloud documents. Null unless the account is
 * signed in, the policy allows cloud features and the state names the
 * account, so no cache entry is ever keyed by a missing account.
 */
export function cloudOriginOf(state: CloudAccountState | null): CloudOrigin | null {
  if (
    !state ||
    !state.available ||
    state.state !== "signedIn" ||
    !state.cloudAvailable ||
    !state.serverOrigin ||
    !state.accountId
  ) {
    return null;
  }
  return { kind: "cloud", server: state.serverOrigin, account: state.accountId };
}

export function useCloudOrigin(): CloudOrigin | null {
  const origin = cloudOriginOf(useCloudAccountState());
  const server = origin?.server;
  const account = origin?.account;
  // One object for one server and account, so it can sit in dependency lists.
  return useMemo(
    () => (server && account ? { kind: "cloud", server, account } : null),
    [server, account]
  );
}

const clients = new Map<string, Readonly<TRPCClient<AppRouter>>>();

/** The cloud tRPC client of a server, or null outside the desktop app. */
export function cloudTrpcClient(server: string): Readonly<TRPCClient<AppRouter>> | null {
  const request = desktopCloudRequester();
  if (!request) {
    return null;
  }
  let client = clients.get(server);
  if (!client) {
    client = createCloudTrpcClient(server, request);
    clients.set(server, client);
  }
  return client;
}
