import type { WebSocketMode } from "@nodetool-ai/protocol";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import type { AppSessionScope } from "../src/lib/app-session-scope.js";
import type {
  ClientSession,
  GetNodeMetadata,
  ResolveExecutor,
  ResolveNodeType,
  ResolveProvider,
  ValidateNode,
  WorkspaceResolver
} from "../src/session/client-session.js";

/** One outbound frame, with the call that produced it. */
export interface RecordedSend {
  channel: "send" | "sendDetached";
  message: Record<string, unknown>;
}

export type FakeClientSessionOptions = Partial<
  Pick<
    ClientSession,
    | "userId"
    | "appSession"
    | "mode"
    | "resolveExecutor"
    | "resolveProvider"
    | "resolveNodeType"
    | "getNodeMetadata"
    | "validateNode"
    | "workspaceResolver"
    | "nodeRegistry"
    | "pythonBridge"
  >
>;

/**
 * A {@link ClientSession} with no socket behind it: every frame is recorded in
 * call order so a suite can assert on what a domain class emitted.
 *
 * Two ways it is not the production channel. It accepts every frame, where the
 * host validates: production `send` rejects an invalid frame and production
 * `sendDetached` drops one and reports it through `logError`, so `sent` here
 * can hold frames the socket would have refused and `errors` stays empty. And
 * it records strict call order, where production order is lock-acquisition
 * order — a frame carrying a `content` array resolves its media URLs before
 * taking the send lock, so a frame queued after it can overtake it.
 */
export class FakeClientSession implements ClientSession {
  readonly sent: RecordedSend[] = [];
  readonly errors: Array<{ context: string; error: unknown }> = [];

  readonly userId: string | null;

  requireUserId(): string {
    if (this.userId === null) {
      throw new Error("FakeClientSession was built with a null user id");
    }
    return this.userId;
  }

  readonly appSession: AppSessionScope | null;
  readonly mode: WebSocketMode;
  readonly resolveExecutor: ResolveExecutor;
  readonly resolveProvider?: ResolveProvider;
  readonly resolveNodeType?: ResolveNodeType;
  readonly getNodeMetadata?: GetNodeMetadata;
  readonly validateNode?: ValidateNode;
  readonly workspaceResolver?: WorkspaceResolver;
  readonly nodeRegistry?: NodeRegistry;
  readonly pythonBridge?: PythonBridge;

  constructor(options: FakeClientSessionOptions = {}) {
    this.userId = options.userId ?? "1";
    this.appSession = options.appSession ?? null;
    this.mode = options.mode ?? "binary";
    this.resolveExecutor =
      options.resolveExecutor ??
      ((node) => {
        throw new Error(
          `FakeClientSession has no executor for node ${node.id}`
        );
      });
    this.resolveProvider = options.resolveProvider;
    this.resolveNodeType = options.resolveNodeType;
    this.getNodeMetadata = options.getNodeMetadata;
    this.validateNode = options.validateNode;
    this.workspaceResolver = options.workspaceResolver;
    this.nodeRegistry = options.nodeRegistry;
    this.pythonBridge = options.pythonBridge;
  }

  /** Every frame, both channels, in call order. */
  get messages(): Array<Record<string, unknown>> {
    return this.sent.map((entry) => entry.message);
  }

  messagesOfType(type: string): Array<Record<string, unknown>> {
    return this.messages.filter((message) => message.type === type);
  }

  send(message: Record<string, unknown>): Promise<void> {
    this.sent.push({ channel: "send", message });
    return Promise.resolve();
  }

  sendDetached(message: Record<string, unknown>): void {
    this.sent.push({ channel: "sendDetached", message });
  }

  logError(context: string, error: unknown): void {
    this.errors.push({ context, error });
  }
}
