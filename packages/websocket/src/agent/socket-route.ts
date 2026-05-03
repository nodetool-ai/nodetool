/**
 * WebSocket route + transport for the agent runtime.
 *
 * Each connection at `/ws/agent` gets its own `AgentSocketTransport` instance
 * that bridges agent-runtime events to the renderer over the socket using
 * the JSON message protocol defined in `./types.ts`.
 */

import type { FastifyPluginAsync } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { getAgentRuntime } from "./agent-runtime.js";
import { clearMcpFrontendTransport } from "../mcp-server.js";
import type { AgentTransport } from "./transport.js";
import type {
  AgentClientMessage,
  AgentMessage,
  AgentServerMessage,
  FrontendToolManifest,
} from "./types.js";
import { validateAgentClientMessage } from "./types.js";

const log = createLogger("nodetool.websocket.agent.route");

const TOOLS_RESPONSE_TIMEOUT_MS = 15000;

interface PendingRendererRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

class AgentSocketTransport implements AgentTransport {
  private alive = true;
  private readonly pendingManifest = new Map<
    string,
    PendingRendererRequest<FrontendToolManifest[]>
  >();
  private readonly pendingTools = new Map<
    string,
    PendingRendererRequest<unknown>
  >();

  constructor(private readonly socket: WebSocket) {}

  get isAlive(): boolean {
    return this.alive && this.socket.readyState === 1;
  }

  send(message: AgentServerMessage): void {
    if (!this.isAlive) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      log.warn(
        `Failed to send agent message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  streamMessage(sessionId: string, message: AgentMessage, done: boolean): void {
    this.send({
      type: "agent_stream_message",
      session_id: sessionId,
      message,
      done,
    });
  }

  requestToolManifest(sessionId: string): Promise<FrontendToolManifest[]> {
    return new Promise<FrontendToolManifest[]>((resolve, reject) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => {
        this.pendingManifest.delete(requestId);
        reject(
          new Error(
            `Timed out waiting for renderer tool manifest (${TOOLS_RESPONSE_TIMEOUT_MS}ms)`,
          ),
        );
      }, TOOLS_RESPONSE_TIMEOUT_MS);
      this.pendingManifest.set(requestId, { resolve, reject, timer });
      this.send({
        type: "tools_manifest_request",
        request_id: requestId,
        session_id: sessionId,
      });
    });
  }

  executeTool(
    sessionId: string,
    toolCallId: string,
    name: string,
    args: unknown,
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => {
        this.pendingTools.delete(requestId);
        reject(
          new Error(
            `Timed out waiting for renderer to execute tool ${name} (${TOOLS_RESPONSE_TIMEOUT_MS}ms)`,
          ),
        );
      }, TOOLS_RESPONSE_TIMEOUT_MS);
      this.pendingTools.set(requestId, { resolve, reject, timer });
      this.send({
        type: "tool_call_request",
        request_id: requestId,
        session_id: sessionId,
        tool_call_id: toolCallId,
        name,
        args,
      });
    });
  }

  abortTools(sessionId: string): void {
    this.send({ type: "tool_call_abort", session_id: sessionId });
  }

  /** Renderer replied to a `tools_manifest_request`. */
  resolveManifest(requestId: string, manifest: FrontendToolManifest[]): void {
    const pending = this.pendingManifest.get(requestId);
    if (!pending) return;
    this.pendingManifest.delete(requestId);
    clearTimeout(pending.timer);
    pending.resolve(manifest);
  }

  /** Renderer replied to a `tool_call_request`. */
  resolveTool(
    requestId: string,
    result: { result?: unknown; isError: boolean; error?: string },
  ): void {
    const pending = this.pendingTools.get(requestId);
    if (!pending) return;
    this.pendingTools.delete(requestId);
    clearTimeout(pending.timer);
    if (result.isError) {
      pending.reject(new Error(result.error ?? "Tool execution failed"));
    } else {
      pending.resolve(result.result);
    }
  }

  /** Mark the transport as dead and reject all in-flight renderer requests. */
  dispose(): void {
    this.alive = false;
    const failure = new Error("Renderer disconnected");
    for (const [, pending] of this.pendingManifest) {
      clearTimeout(pending.timer);
      pending.reject(failure);
    }
    this.pendingManifest.clear();
    for (const [, pending] of this.pendingTools) {
      clearTimeout(pending.timer);
      pending.reject(failure);
    }
    this.pendingTools.clear();
  }
}

const agentSocketRoute: FastifyPluginAsync = async (app) => {
  app.get("/ws/agent", { websocket: true }, (socket, req) => {
    // The global auth preHandler in server.ts populates req.userId — reject
    // the connection if it ever leaks through unauthenticated. Belt and
    // suspenders: defaults like a misconfigured local dev server should
    // never become an unauthenticated agent endpoint.
    const userId = req.userId;
    if (!userId) {
      log.warn("Agent WebSocket connection rejected: no userId on request");
      try {
        socket.close(1008, "Authentication required");
      } catch {
        // socket may already be closing — best effort
      }
      return;
    }

    const transport = new AgentSocketTransport(socket);
    const runtime = getAgentRuntime();

    log.info(`Agent WebSocket client connected (user ${userId})`);

    const sendResponse = (
      requestId: string,
      data?: unknown,
      error?: string,
    ): void => {
      transport.send({
        type: "response",
        request_id: requestId,
        data,
        error,
      });
    };

    const handleCommand = async (msg: AgentClientMessage): Promise<void> => {
      try {
        switch (msg.command) {
          case "create_session": {
            const sessionId = await runtime.createSession(msg.options, userId);
            sendResponse(msg.request_id, sessionId);
            return;
          }
          case "send_message": {
            // Don't await — runtime streams replies via transport.streamMessage.
            // Fire-and-forget the response so the renderer knows the command was accepted.
            sendResponse(msg.request_id);
            try {
              await runtime.sendMessageStreaming(
                msg.session_id,
                msg.message,
                transport,
                userId,
              );
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              log.error(`sendMessage failed for ${msg.session_id}: ${message}`);
              transport.streamMessage(
                msg.session_id,
                {
                  type: "result",
                  uuid: randomUUID(),
                  session_id: msg.session_id,
                  subtype: "error",
                  is_error: true,
                  errors: [message],
                },
                true,
              );
            }
            return;
          }
          case "stop_execution": {
            await runtime.stopExecution(msg.session_id, userId);
            sendResponse(msg.request_id);
            return;
          }
          case "close_session": {
            runtime.closeSession(msg.session_id, userId);
            sendResponse(msg.request_id);
            return;
          }
          case "list_models": {
            const models = await runtime.listModels(msg.options, userId);
            sendResponse(msg.request_id, models);
            return;
          }
          case "list_sessions": {
            const sessions = await runtime.listSessionsForRequest(
              msg.options,
              userId,
            );
            sendResponse(msg.request_id, sessions);
            return;
          }
          case "get_session_messages": {
            const messages = await runtime.getSessionMessagesForRequest(
              msg.options,
              userId,
            );
            sendResponse(msg.request_id, messages);
            return;
          }
          case "tools_manifest_response": {
            transport.resolveManifest(msg.request_id, msg.manifest);
            return;
          }
          case "tool_call_response": {
            transport.resolveTool(msg.request_id, msg.result);
            return;
          }
          default: {
            const exhaustive: never = msg;
            log.warn(`Unknown agent command: ${JSON.stringify(exhaustive)}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Agent command failed: ${message}`);
        if ("request_id" in msg && typeof msg.request_id === "string") {
          sendResponse(msg.request_id, undefined, message);
        }
      }
    };

    socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let rawParsed: unknown;
      try {
        const text = raw.toString();
        rawParsed = JSON.parse(text);
      } catch (error) {
        log.warn(
          `Failed to parse agent client message: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }

      const validation = validateAgentClientMessage(rawParsed);
      if (!validation.ok) {
        log.warn(
          `Rejecting malformed agent client message: ${validation.error}`,
        );
        // If the sender provided a request_id, surface the validation error
        // back to them so they can fix the call. Otherwise the message gets
        // dropped silently (which is correct — there's nothing to respond to).
        const maybeRequestId =
          rawParsed &&
          typeof rawParsed === "object" &&
          typeof (rawParsed as Record<string, unknown>).request_id === "string"
            ? ((rawParsed as Record<string, unknown>).request_id as string)
            : null;
        if (maybeRequestId) {
          sendResponse(maybeRequestId, undefined, validation.error);
        }
        return;
      }

      void handleCommand(validation.value);
    });

    socket.on("close", () => {
      log.info("Agent WebSocket client disconnected");
      transport.dispose();
      clearMcpFrontendTransport(transport);
    });

    socket.on("error", (error: Error) => {
      log.error("Agent WebSocket error", error);
    });
  });
};

export default agentSocketRoute;
