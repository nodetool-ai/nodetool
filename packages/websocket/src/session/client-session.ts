import type { WebSocketMode } from "@nodetool-ai/protocol";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import type { AppSessionScope } from "../lib/app-session-scope.js";
import type { WebSocketClientSessionOptions } from "../websocket-client-session.js";

export type ResolveExecutor = WebSocketClientSessionOptions["resolveExecutor"];
export type ResolveProvider = WebSocketClientSessionOptions["resolveProvider"];
export type ResolveNodeType = WebSocketClientSessionOptions["resolveNodeType"];
export type GetNodeMetadata = WebSocketClientSessionOptions["getNodeMetadata"];
export type ValidateNode = WebSocketClientSessionOptions["validateNode"];
export type WorkspaceResolver =
  WebSocketClientSessionOptions["workspaceResolver"];

/**
 * What a domain class knows about the connection it serves: identity, the two
 * ways to send a frame, error logging, and the resolvers every region needs.
 * Nothing else about the socket is reachable through it.
 *
 * `userId` and `mode` are live: `userId` goes from null to an id during
 * `connect`, and `set_mode` changes `mode` mid-connection. Read them at call
 * time — a class that captures either at construction reads a stale value.
 */
export interface ClientSession {
  /**
   * The acting user. When {@link appSession} is set this is the app's *owner*,
   * not the visitor, so an authorization decision must read both.
   */
  readonly userId: string | null;
  /**
   * The acting user, or a throw. Every handler in `session/` runs after
   * `connect()`, which assigns an id, so a null here is a wiring bug — not a
   * reason to act as the local single-user id and touch someone else's rows.
   */
  requireUserId(): string;
  /** Set when a deployed app's visitor opened this connection. */
  readonly appSession: AppSessionScope | null;
  readonly mode: WebSocketMode;

  /**
   * Serialized, validated, seq-stamped send. The host keeps the lock.
   *
   * Resolves once the frame is accepted for delivery — written to the socket,
   * or buffered into the replay session of the chat turn or run it belongs to.
   * A buffered frame is not a sent one: it may go to a later connection, and
   * it may reach no one, because the buffer is bounded and expires with the
   * session. A dropped socket is not an error and never rejects; an invalid
   * frame does reject, before anything is queued.
   */
  send(message: Record<string, unknown>): Promise<void>;
  /** Fire-and-forget send for messages that must not await the lock. */
  sendDetached(message: Record<string, unknown>): void;

  logError(context: string, error: unknown): void;

  readonly resolveExecutor: ResolveExecutor;
  readonly resolveProvider?: ResolveProvider;
  readonly resolveNodeType?: ResolveNodeType;
  readonly getNodeMetadata?: GetNodeMetadata;
  readonly validateNode?: ValidateNode;
  readonly workspaceResolver?: WorkspaceResolver;
  readonly nodeRegistry?: NodeRegistry;
  readonly pythonBridge?: PythonBridge;
}
