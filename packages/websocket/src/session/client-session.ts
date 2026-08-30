import type { WebSocketMode } from "@nodetool-ai/protocol";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import type { AppSessionScope } from "../lib/app-session-scope.js";
import type { UnifiedWebSocketRunnerOptions } from "../unified-websocket-runner.js";

export type ResolveExecutor = UnifiedWebSocketRunnerOptions["resolveExecutor"];
export type ResolveProvider = UnifiedWebSocketRunnerOptions["resolveProvider"];
export type ResolveNodeType = UnifiedWebSocketRunnerOptions["resolveNodeType"];
export type GetNodeMetadata = UnifiedWebSocketRunnerOptions["getNodeMetadata"];
export type ValidateNode = UnifiedWebSocketRunnerOptions["validateNode"];
export type WorkspaceResolver =
  UnifiedWebSocketRunnerOptions["workspaceResolver"];

/**
 * What a domain class knows about the connection it serves: identity, the two
 * ways to send a frame, error logging, and the resolvers every region needs.
 * Nothing else about the socket is reachable through it.
 */
export interface ClientSession {
  /**
   * The acting user. When {@link appSession} is set this is the app's *owner*,
   * not the visitor, so an authorization decision must read both.
   */
  readonly userId: string | null;
  /** Set when a deployed app's visitor opened this connection. */
  readonly appSession: AppSessionScope | null;
  readonly mode: WebSocketMode;

  /**
   * Serialized, validated, seq-stamped send. The host keeps the lock.
   * Resolves once the frame is on the socket or the socket is gone: a dropped
   * socket is not an error and never rejects.
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
