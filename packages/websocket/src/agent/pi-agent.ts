/**
 * Pi SDK agent integration.
 *
 * Wraps @mariozechner/pi-coding-agent to expose a NodeTool agent session that
 * talks to whichever LLM provider the user has configured in pi
 * (~/.pi/agent/auth.json). Frontend UI tools are bridged into pi as
 * `customTools` that forward calls back through the NodeTool AgentTransport,
 * mirroring the MCP bridge used by Claude/Codex.
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool/config";
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  defineTool,
  type AgentSessionEvent,
  type SessionInfo,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type { Model, Api, Message } from "@mariozechner/pi-ai";
import type { AgentTransport } from "./transport.js";
import type {
  AgentGetSessionMessagesRequest,
  AgentListSessionsRequest,
  AgentMessage,
  AgentModelDescriptor,
  AgentSessionInfoEntry,
  AgentTranscriptMessage,
  FrontendToolManifest,
} from "./types.js";

const log = createLogger("nodetool.websocket.agent.pi");

let authStorageInstance: AuthStorage | null = null;
let modelRegistryInstance: ModelRegistry | null = null;

function getAuthStorage(): AuthStorage {
  if (!authStorageInstance) {
    authStorageInstance = AuthStorage.create();
  }
  return authStorageInstance;
}

function getModelRegistry(): ModelRegistry {
  if (!modelRegistryInstance) {
    modelRegistryInstance = ModelRegistry.create(getAuthStorage());
  }
  return modelRegistryInstance;
}

function parseCompositeModelId(
  composite: string,
): { provider: string; id: string } {
  const slash = composite.indexOf("/");
  if (slash > 0) {
    return {
      provider: composite.slice(0, slash),
      id: composite.slice(slash + 1),
    };
  }
  // No slash — treat whole thing as an id under anthropic (best-effort default).
  return { provider: "anthropic", id: composite };
}

function toDescriptor(m: Model<Api>): AgentModelDescriptor {
  return {
    id: `${m.provider}/${m.id}`,
    label: `${m.name} (${m.provider})`,
    provider: "pi",
    supportsReasoningEffort: m.reasoning,
  };
}

export async function listPiModels(): Promise<AgentModelDescriptor[]> {
  try {
    const registry = getModelRegistry();
    registry.refresh();

    const available = registry.getAvailable();
    const source = available.length > 0 ? available : registry.getAll();
    const descriptors = source.map(toDescriptor);

    if (descriptors.length > 0 && !descriptors.some((d) => d.isDefault)) {
      // Prefer the first "available" model as default; otherwise fall back to
      // the first model overall.
      descriptors[0].isDefault = true;
    }

    return descriptors;
  } catch (error) {
    log.error(
      "Failed to list Pi models",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

/**
 * Build pi `customTools` from a NodeTool frontend tool manifest. Each call is
 * forwarded to the renderer over the shared AgentTransport; the result is
 * wrapped into pi's tool-result shape so agent-core can feed it back to the
 * LLM.
 */
function buildCustomTools(
  manifest: FrontendToolManifest[],
  transport: AgentTransport,
  sessionIdRef: { current: string },
): ToolDefinition[] {
  return manifest.map((entry) => {
    // Pi expects a TypeBox TSchema for `parameters`, but at runtime the type
    // is only used by AJV (validation) and the provider adapters (sent as
    // inputSchema to the LLM). A plain JSON Schema works for both.
    const parameters = (entry.parameters ?? {
      type: "object",
      properties: {},
    }) as unknown as Parameters<typeof defineTool>[0]["parameters"];

    return defineTool({
      name: entry.name,
      label: entry.name,
      description: entry.description,
      parameters,
      // Don't run pi's schema validation on the renderer's JSON Schema — the
      // renderer owns the canonical schema, and we don't want a TypeBox
      // round-trip to reject valid args on a quirk.
      prepareArguments: (args) =>
        args as Parameters<
          ReturnType<typeof defineTool>["execute"]
        >[1],
      execute: async (toolCallId, params) => {
        try {
          const result = await transport.executeTool(
            sessionIdRef.current,
            toolCallId,
            entry.name,
            params ?? {},
          );
          const text =
            typeof result === "string"
              ? result
              : JSON.stringify(result ?? null);
          const details: { error?: string } = {};
          return {
            content: [{ type: "text", text }],
            details,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const details: { error?: string } = { error: message };
          return {
            content: [{ type: "text", text: `Error: ${message}` }],
            details,
          };
        }
      },
    });
  });
}

export class PiQuerySession {
  private closed = false;
  private readonly workspacePath: string;
  private readonly systemPrompt: string;
  private readonly modelProvider: string;
  private readonly modelId: string;
  private inFlight = false;
  private resolvedSessionId: string | null;
  /**
   * Lazily created on first send so we can rebuild tools from the current
   * renderer manifest. Pi's AgentSession is stateful, so we only build it once
   * and then patch tools/model on subsequent sends.
   */
  private piSession: Awaited<
    ReturnType<typeof createAgentSession>
  >["session"] | null = null;
  private abortController: AbortController | null = null;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
  }) {
    const parsed = parseCompositeModelId(options.model);
    this.modelProvider = parsed.provider;
    this.modelId = parsed.id;
    this.workspacePath = options.workspacePath;
    this.systemPrompt = options.systemPrompt ?? "";
    this.resolvedSessionId = options.resumeSessionId ?? null;
  }

  private async ensureSession(
    manifest: FrontendToolManifest[],
    transport: AgentTransport,
    sessionIdRef: { current: string },
  ): Promise<NonNullable<PiQuerySession["piSession"]>> {
    const registry = getModelRegistry();
    const model = registry.find(this.modelProvider, this.modelId);
    if (!model) {
      throw new Error(
        `Pi model not found: ${this.modelProvider}/${this.modelId}`,
      );
    }

    const customTools = buildCustomTools(manifest, transport, sessionIdRef);

    if (this.piSession) {
      // Pi allows in-place model/tool swaps.
      await this.piSession.setModel(model);
      this.piSession.agent.state.tools = customTools as unknown as typeof this
        .piSession.agent.state.tools;
      return this.piSession;
    }

    // Resolve persistence target. New sessions create a fresh file under
    // ~/.pi/agent/sessions/<encoded-cwd>/; resumed sessions open the
    // existing file whose header id matches resolvedSessionId.
    let sessionManager: SessionManager;
    if (this.resolvedSessionId) {
      const existingPath = await findPiSessionPath(
        this.workspacePath,
        this.resolvedSessionId,
      );
      if (!existingPath) {
        throw new Error(
          `Pi session not found for id: ${this.resolvedSessionId}`,
        );
      }
      sessionManager = SessionManager.open(existingPath);
    } else {
      sessionManager = SessionManager.create(this.workspacePath);
    }

    const { session } = await createAgentSession({
      cwd: this.workspacePath,
      model,
      authStorage: getAuthStorage(),
      modelRegistry: registry,
      sessionManager,
      // Disable compaction; every turn is a full round-trip to the renderer
      // and the NodeTool UI handles context-window management itself.
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
      }),
      // Only the frontend tools are wired up — no file/bash/etc access.
      tools: [],
      customTools,
    });

    if (this.systemPrompt.trim().length > 0) {
      session.agent.state.systemPrompt = this.systemPrompt;
    }

    this.piSession = session;
    return session;
  }

  async send(
    message: string,
    transport: AgentTransport | null,
    sessionId: string,
    manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
    _mcpServerUrl?: string | null,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A Pi request is already in progress for this session");
    }
    if (!transport) {
      throw new Error("Pi sessions require an active transport");
    }

    this.inFlight = true;
    this.abortController = new AbortController();

    const sessionIdRef = {
      current: this.resolvedSessionId ?? sessionId,
    };
    const outputMessages: AgentMessage[] = [];
    const emittedToolCalls = new Set<string>();
    const textBuffers = new Map<string, string>();

    let session: NonNullable<PiQuerySession["piSession"]>;
    try {
      session = await this.ensureSession(manifest, transport, sessionIdRef);
    } catch (error) {
      const errorMsg: AgentMessage = {
        type: "result",
        uuid: randomUUID(),
        session_id: sessionIdRef.current,
        subtype: "error",
        is_error: true,
        errors: [error instanceof Error ? error.message : String(error)],
      };
      if (onMessage) onMessage(errorMsg);
      outputMessages.push(errorMsg);
      this.abortController = null;
      this.inFlight = false;
      return outputMessages;
    }

    this.resolvedSessionId = session.sessionId;
    sessionIdRef.current = session.sessionId;

    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      const agentMsg = this.convertEvent(
        event,
        session.sessionId,
        textBuffers,
        emittedToolCalls,
      );
      if (!agentMsg) return;
      outputMessages.push(agentMsg);
      if (onMessage) onMessage(agentMsg);
    });

    try {
      await session.prompt(message);
      return outputMessages;
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        log.info("Pi turn was interrupted");
        return outputMessages;
      }
      const errorMsg: AgentMessage = {
        type: "result",
        uuid: randomUUID(),
        session_id: sessionIdRef.current,
        subtype: "error",
        is_error: true,
        errors: [error instanceof Error ? error.message : String(error)],
      };
      if (onMessage) onMessage(errorMsg);
      outputMessages.push(errorMsg);
      return outputMessages;
    } finally {
      unsubscribe();
      this.abortController = null;
      this.inFlight = false;
    }
  }

  private convertEvent(
    event: AgentSessionEvent,
    sessionId: string,
    textBuffers: Map<string, string>,
    emittedToolCalls: Set<string>,
  ): AgentMessage | null {
    switch (event.type) {
      case "message_update": {
        const inner = event.assistantMessageEvent;
        if (inner.type === "text_delta") {
          const msgId =
            (event.message as { id?: string }).id ?? sessionId;
          const current = (textBuffers.get(msgId) ?? "") + inner.delta;
          textBuffers.set(msgId, current);
          return {
            type: "assistant",
            uuid: msgId,
            session_id: sessionId,
            content: [{ type: "text", text: current }],
          };
        }
        return null;
      }
      case "message_end": {
        const msgId = (event.message as { id?: string }).id;
        if (msgId) textBuffers.delete(msgId);
        return null;
      }
      case "tool_execution_start": {
        if (emittedToolCalls.has(event.toolCallId)) return null;
        emittedToolCalls.add(event.toolCallId);
        return {
          type: "assistant",
          uuid: event.toolCallId,
          session_id: sessionId,
          content: [],
          tool_calls: [
            {
              id: event.toolCallId,
              type: "function",
              function: {
                name: event.toolName,
                arguments: JSON.stringify(event.args ?? {}),
              },
            },
          ],
        };
      }
      case "agent_end": {
        return {
          type: "result",
          uuid: randomUUID(),
          session_id: sessionId,
          subtype: "success",
        };
      }
      default:
        return null;
    }
  }

  async interrupt(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.piSession) {
      try {
        await this.piSession.abort();
      } catch (error) {
        log.warn(
          `Failed to abort Pi session: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.piSession) {
      try {
        this.piSession.dispose();
      } catch (error) {
        log.warn(
          `Failed to dispose Pi session: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      this.piSession = null;
    }
  }
}

function extractMessageText(message: Message): string {
  if (message.role === "user") {
    if (typeof message.content === "string") return message.content;
    return message.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }
  if (message.role === "assistant") {
    return message.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }
  return "";
}

async function listPiSessionInfos(dir?: string): Promise<SessionInfo[]> {
  if (dir) {
    return SessionManager.list(dir);
  }
  return SessionManager.listAll();
}

async function findPiSessionPath(
  dir: string | undefined,
  sessionId: string,
): Promise<string | null> {
  const infos = await listPiSessionInfos(dir);
  const match = infos.find((info) => info.id === sessionId);
  return match ? match.path : null;
}

export async function listPiSessions(
  options: AgentListSessionsRequest,
): Promise<AgentSessionInfoEntry[]> {
  try {
    const infos = await listPiSessionInfos(options.dir);

    // Sort newest-first for UI convenience and apply offset/limit.
    infos.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    const page = infos.slice(offset, offset + limit);

    return page.map((info) => ({
      sessionId: info.id,
      summary: info.name?.trim() || info.firstMessage || info.id,
      lastModified: info.modified.getTime(),
      cwd: info.cwd || undefined,
      firstPrompt: info.firstMessage || undefined,
      createdAt: info.created.getTime(),
      customTitle: info.name,
      provider: "pi" as const,
    }));
  } catch (error) {
    log.error(
      "Failed to list Pi sessions",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

export async function getPiSessionMessages(
  options: AgentGetSessionMessagesRequest,
): Promise<AgentTranscriptMessage[]> {
  try {
    const path = await findPiSessionPath(options.dir, options.sessionId);
    if (!path) return [];

    const manager = SessionManager.open(path);
    const { messages } = manager.buildSessionContext();

    return messages
      .map((message, index) => {
        const msg = message as Message;
        if (msg.role !== "user" && msg.role !== "assistant") return null;
        const text = extractMessageText(msg);
        if (text.length === 0) return null;
        return {
          type: msg.role,
          uuid: `${options.sessionId}-${index}`,
          session_id: options.sessionId,
          text,
        } satisfies AgentTranscriptMessage;
      })
      .filter((m): m is AgentTranscriptMessage => m !== null);
  } catch (error) {
    log.error(
      "Failed to get Pi session messages",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}
