/**
 * The one module that touches `@nodetool-ai/sdk` and `ws`.
 *
 * The router talks to a narrow `BridgeClient` interface; this is the real
 * implementation of it — a `ChatSocket` on the user's delegated token, plus
 * the two tRPC reads the bridge makes (thread ids for `n` recovery, asset
 * metadata for outbound files). Keeping the SDK behind this seam is what lets
 * the router's whole test suite run on a scripted fake socket.
 */

import { WebSocket as NodeWebSocket } from "ws";
import { createNodetoolClient } from "@nodetool-ai/sdk";
import type { ChatSocket, WebSocketCtor } from "@nodetool-ai/sdk";

import type { RenderFrame } from "./frame-renderer.js";
import type { AssetAttachment } from "./frame-renderer.js";
import type { BridgeChatSocket, BridgeClient, MakeBridgeClient } from "./turn-router.js";
import type { DeliveryContext } from "./turn-router.js";
import type { ResolvedAsset } from "./telegram-adapter.js";

// SAFETY: `ws`'s WebSocket implements the browser constructor shape the SDK
// asks for (`new (url) => WebSocket` plus the readyState constants), but its
// declarations are written against Node's own event types rather than the DOM
// lib, so the two never structurally match. Every SDK use of it — construct,
// `readyState`, `send`, `close`, the `on*` handlers — is in the intersection.
const WS_CTOR = NodeWebSocket as unknown as WebSocketCtor;

/** Thread ids are read in pages; this bounds the recovery scan. */
const THREAD_PAGE_LIMIT = 200;
const THREAD_PAGE_MAX = 10;

/** Wrap the SDK socket in the narrow interface the router consumes. */
export function wrapChatSocket(socket: ChatSocket): BridgeChatSocket {
  return {
    connect: () => socket.connect(),
    disconnect: () => socket.disconnect(),
    send: (options) =>
      socket.send({
        threadId: options.threadId,
        text: options.text,
        provider: options.provider ?? null,
        model: options.model ?? null,
        agentMode: options.agentMode ?? true,
        permissionMode: options.permissionMode ?? "auto"
      }),
    stop: (threadId) => socket.stop(threadId),
    resume: (threadId, lastSeq) => socket.resume(threadId, lastSeq),
    onFrame: (listener) =>
      socket.on("raw", (frame) => {
        // SAFETY: the renderer's `RenderFrame` is the protocol union plus an
        // optional seq; the socket's `raw` event carries exactly the decoded
        // frame, whose unmodelled members the renderer's `default` case drops.
        listener(frame as RenderFrame);
      }),
    onStateChange: (listener) => socket.on("state", (state) => listener(state))
  };
}

export interface BridgeClientFactoryOptions {
  /** NodeTool server base URL. */
  readonly apiUrl: string;
  readonly fetch?: typeof fetch;
}

/** A `makeClient` for the router, backed by the real server. */
export function createBridgeClientFactory(
  options: BridgeClientFactoryOptions
): MakeBridgeClient {
  return ({ token }): BridgeClient => {
    const client = createNodetoolClient({
      baseUrl: options.apiUrl,
      authToken: token,
      fetch: options.fetch,
      WebSocket: WS_CTOR
    });
    return {
      socket: wrapChatSocket(client.chat()),
      async listThreadIds() {
        const ids: string[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < THREAD_PAGE_MAX; page += 1) {
          const input: { limit: number; cursor?: string } = { limit: THREAD_PAGE_LIMIT };
          if (cursor !== undefined) {
            input.cursor = cursor;
          }
          const result = await client.trpc.threads.list.query(input);
          for (const thread of result.threads) {
            ids.push(thread.id);
          }
          if (!result.next) {
            break;
          }
          cursor = result.next;
        }
        return ids;
      }
    };
  };
}

/** Bare asset id out of `asset://<id>[.ext]`, or null for anything else. */
export function assetIdOf(uri: string): string | null {
  if (!uri.startsWith("asset://")) {
    return null;
  }
  const rest = uri.slice("asset://".length);
  const withoutExt = rest.replace(/\.[A-Za-z0-9]+$/, "");
  return withoutExt.length > 0 ? withoutExt : null;
}

/**
 * Fetch an attachment's bytes as the linked user. An `asset://` reference is
 * resolved through tRPC first, because only the server knows where the object
 * lives; an absolute URL is fetched directly with the same token.
 */
export function createAssetResolver(options: BridgeClientFactoryOptions) {
  const fetchImpl = options.fetch ?? fetch;
  return async (
    asset: AssetAttachment,
    context: DeliveryContext
  ): Promise<ResolvedAsset | null> => {
    const client = createNodetoolClient({
      baseUrl: options.apiUrl,
      authToken: context.token,
      fetch: fetchImpl,
      WebSocket: WS_CTOR
    });

    let url = asset.uri;
    let filename = asset.name ?? "attachment";
    let contentType = asset.contentType;

    const assetId = assetIdOf(asset.uri);
    if (assetId !== null) {
      const record = await client.trpc.assets.get.query({ id: assetId });
      if (!record.get_url) {
        return null;
      }
      url = record.get_url;
      filename = record.name;
      contentType = record.content_type;
    }

    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${context.token}` }
    });
    if (!response.ok) {
      return null;
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      filename,
      contentType
    };
  };
}
