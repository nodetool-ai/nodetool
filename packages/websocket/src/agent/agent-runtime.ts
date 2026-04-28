/**
 * Agent runtime — manages Claude/Codex/OpenCode agent SDK sessions.
 *
 * Sessions live entirely in-process; renderers connect over WebSocket
 * (see `socket-route.ts`) and provide a transport for streaming
 * messages and bridging frontend tool execution.
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool/config";
import {
  query,
  listSessions,
  getSessionMessages,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  Query,
  SDKSessionInfo,
  SessionMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { uiToolSchemas } from "@nodetool/protocol";
import {
  CodexQuerySession,
  listCodexModels,
} from "./codex-agent.js";
import {
  OpenCodeQuerySession,
  listOpenCodeModels,
  listOpenCodeSessions,
  getOpenCodeSessionMessages,
  closeOpenCodeServer,
} from "./opencode-agent.js";
import {
  PiQuerySession,
  listPiModels,
  listPiSessions,
  getPiSessionMessages,
} from "./pi-agent.js";
import {
  stopMcpToolServer,
} from "./mcp-tool-server.js";
import { LlmAgentSdkProvider } from "./llm-agent.js";
import {
  getLocalMcpServerUrl,
  setMcpFrontendTransport,
} from "../mcp-server.js";
import type { AgentTransport } from "./transport.js";
import type {
  AgentGetSessionMessagesRequest,
  AgentListSessionsRequest,
  AgentMessage,
  AgentModelDescriptor,
  AgentModelParams,
  AgentModelsRequest,
  AgentSessionInfoEntry,
  AgentSessionOptions,
  AgentTranscriptMessage,
  FrontendToolManifest,
} from "./types.js";

const log = createLogger("nodetool.websocket.agent.runtime");

// SYSTEM_PROMPT, AgentQuerySession, and AgentSdkProvider live in
// `sdk-provider.ts` to break a circular import: `llm-agent.ts` needs
// SYSTEM_PROMPT and the interfaces, and this file in turn imports
// LlmAgentSdkProvider from llm-agent.js. Re-exported here for the
// existing import sites.
export {
  SYSTEM_PROMPT,
  type AgentQuerySession,
  type AgentSdkProvider,
} from "./sdk-provider.js";
import { SYSTEM_PROMPT } from "./sdk-provider.js";
import type {
  AgentQuerySession,
  AgentSdkProvider,
} from "./sdk-provider.js";

const CLAUDE_DISALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "NotebookEdit",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Task",
  "TaskOutput",
];

function getMissingFrontendTools(
  manifest: FrontendToolManifest[],
): string[] {
  const manifestNames = new Set(
    manifest
      .map((tool) => tool.name)
      .filter(
        (name): name is string =>
          typeof name === "string" && name.startsWith("ui_"),
      ),
  );

  return Object.keys(uiToolSchemas).filter((name) => !manifestNames.has(name));
}

function convertSdkMessage(
  msg: { type: string; [key: string]: unknown },
  sessionId: string,
): AgentMessage | null {
  const uuid = randomUUID();

  if (msg.type === "assistant") {
    const message = msg.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (!Array.isArray(content)) return null;

    const textBlocks: Array<{ type: string; text: string }> = [];
    const toolCalls: AgentMessage["tool_calls"] = [];

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        textBlocks.push({ type: "text", text: b.text });
      } else if (
        b.type === "tool_use" &&
        typeof b.id === "string" &&
        typeof b.name === "string"
      ) {
        toolCalls.push({
          id: b.id,
          type: "function",
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input ?? {}),
          },
        });
      }
    }

    if (textBlocks.length === 0 && toolCalls.length === 0) return null;

    return {
      type: "assistant",
      uuid,
      session_id: sessionId,
      content: textBlocks.length > 0 ? textBlocks : undefined,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  if (msg.type === "result") {
    const subtype = msg.subtype as string | undefined;
    if (subtype === "success") {
      return {
        type: "result",
        uuid,
        session_id: sessionId,
        subtype: "success",
        text: typeof msg.result === "string" ? msg.result : undefined,
      };
    }
    return {
      type: "result",
      uuid,
      session_id: sessionId,
      subtype: subtype ?? "error",
      is_error: true,
      errors: Array.isArray(msg.errors)
        ? (msg.errors as string[])
        : [String(msg.result ?? "Unknown error")],
    };
  }

  if (msg.type === "system") return null;

  if (msg.type === "stream_event") {
    const event = msg as Record<string, unknown>;
    const partial = event.message as Record<string, unknown> | undefined;
    const content = partial?.content;
    if (Array.isArray(content)) {
      const textBlocks: Array<{ type: string; text: string }> = [];
      for (const block of content) {
        if (block && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.text === "string") {
            textBlocks.push({ type: "text", text: b.text });
          }
        }
      }
      if (textBlocks.length > 0) {
        return {
          type: "assistant",
          uuid,
          session_id: sessionId,
          content: textBlocks,
        };
      }
    }
    return null;
  }

  return null;
}

class ClaudeAgentSession implements AgentQuerySession {
  private closed = false;
  private readonly model: string;
  private readonly workspacePath: string;
  private readonly systemPrompt: string;
  private readonly maxTurns: number;
  private resolvedSessionId: string | null;
  private inFlight = false;
  private activeQuery: Query | null = null;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    maxTurns?: number;
  }) {
    this.model = options.model;
    this.workspacePath = options.workspacePath;
    this.systemPrompt = options.systemPrompt ?? SYSTEM_PROMPT;
    this.maxTurns = options.maxTurns ?? 50;
    this.resolvedSessionId = options.resumeSessionId ?? null;
  }

  async send(
    message: string,
    _transport: AgentTransport | null,
    sessionId: string,
    _manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
    mcpServerUrl?: string | null,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A request is already in progress for this session");
    }

    this.inFlight = true;

    try {
      // The MCP tool server and its per-session transport mapping are owned
      // by the runtime layer (see AgentRuntime.sendMessageStreaming). The
      // session itself just consumes the URL it was handed.
      const hasMcp = Boolean(mcpServerUrl);
      const allowedTools = hasMcp
        ? Object.keys(uiToolSchemas).map((n) => `mcp__nodetool-ui__${n}`)
        : [];

      const queryHandle = query({
        prompt: message,
        options: {
          model: this.model,
          cwd: this.workspacePath,
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: this.systemPrompt,
          },
          // The NodeTool system prompt, `CLAUDE_DISALLOWED_TOOLS`, and the
          // per-session workspace sandbox are the guardrails here. We
          // intentionally bypass Claude Code's interactive permission
          // prompts because the agent is running headless on the NodeTool
          // server and has no way to surface them. The allowed-tools list
          // below is the actual whitelist of what it can do.
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          disallowedTools: CLAUDE_DISALLOWED_TOOLS,
          allowedTools,
          maxTurns: this.maxTurns,
          ...(mcpServerUrl && {
            mcpServers: {
              "nodetool-ui": {
                type: "http" as const,
                url: mcpServerUrl,
              },
            },
          }),
          ...(this.resolvedSessionId && { resume: this.resolvedSessionId }),
        },
      });
      this.activeQuery = queryHandle;

      const outputMessages: AgentMessage[] = [];
      for await (const msg of queryHandle) {
        if (
          msg.type === "system" &&
          (msg as Record<string, unknown>).subtype === "init"
        ) {
          this.resolvedSessionId = (msg as Record<string, unknown>)
            .session_id as string;
        }

        const agentMsg = convertSdkMessage(
          msg as { type: string; [key: string]: unknown },
          this.resolvedSessionId ?? sessionId,
        );
        if (!agentMsg) continue;

        outputMessages.push(agentMsg);
        if (onMessage) onMessage(agentMsg);
      }

      return outputMessages;
    } catch (error) {
      const errorMsg: AgentMessage = {
        type: "result",
        uuid: randomUUID(),
        session_id: this.resolvedSessionId ?? sessionId,
        subtype: "error",
        is_error: true,
        errors: [error instanceof Error ? error.message : String(error)],
      };
      if (onMessage) onMessage(errorMsg);
      return [errorMsg];
    } finally {
      this.activeQuery = null;
      this.inFlight = false;
    }
  }

  async interrupt(): Promise<void> {
    if (this.activeQuery) {
      this.activeQuery.interrupt();
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.activeQuery) {
      this.activeQuery.close();
      this.activeQuery = null;
    }
  }
}

// AgentSdkProvider interface lives in `sdk-provider.ts` (re-exported at the
// top of this file) so the LLM provider can import it without creating a
// circular dependency back to this module.

const DEFAULT_CLAUDE_MODELS: AgentModelDescriptor[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    isDefault: true,
    provider: "claude",
    supportsMaxTurns: true,
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    provider: "claude",
    supportsMaxTurns: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "claude",
    supportsMaxTurns: true,
  },
];

class ClaudeSdkProvider implements AgentSdkProvider {
  readonly name = "claude";

  async listModels(
    _userId: string,
    _workspacePath?: string,
  ): Promise<AgentModelDescriptor[]> {
    return DEFAULT_CLAUDE_MODELS;
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    userId: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    modelParams?: AgentModelParams;
  }): AgentQuerySession {
    const systemPrompt = options.systemPrompt ?? SYSTEM_PROMPT;
    return new ClaudeAgentSession({
      ...options,
      systemPrompt,
      maxTurns: options.modelParams?.maxTurns,
    });
  }

  async listSessions(
    options: AgentListSessionsRequest,
    _userId: string,
  ): Promise<AgentSessionInfoEntry[]> {
    try {
      const sdkSessions: SDKSessionInfo[] = await listSessions({
        dir: options.dir,
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
      });

      return sdkSessions.map((s) => ({
        sessionId: s.sessionId,
        summary: s.summary,
        lastModified: s.lastModified,
        cwd: s.cwd,
        gitBranch: s.gitBranch,
        customTitle: s.customTitle,
        firstPrompt: s.firstPrompt,
        createdAt: s.createdAt,
        provider: "claude" as const,
      }));
    } catch (error) {
      log.error(
        "Failed to list Claude sessions",
        error instanceof Error ? error : new Error(String(error)),
      );
      return [];
    }
  }

  async getSessionMessages(
    options: AgentGetSessionMessagesRequest,
    _userId: string,
  ): Promise<AgentTranscriptMessage[]> {
    try {
      const sdkMessages: SessionMessage[] = await getSessionMessages(
        options.sessionId,
        { dir: options.dir },
      );

      return sdkMessages
        .filter((m) => m.type === "user" || m.type === "assistant")
        .map((m) => {
          const msg = m.message as Record<string, unknown>;
          let textContent = "";

          if (typeof msg.content === "string") {
            textContent = msg.content;
          } else if (Array.isArray(msg.content)) {
            textContent = (msg.content as Array<Record<string, unknown>>)
              .filter(
                (block) =>
                  block.type === "text" && typeof block.text === "string",
              )
              .map((block) => block.text as string)
              .join("\n");
          }

          return {
            type: m.type as "user" | "assistant",
            uuid: m.uuid,
            session_id: m.session_id,
            text: textContent,
          };
        })
        .filter((m) => m.text.length > 0);
    } catch (error) {
      log.error(
        "Failed to get Claude session messages",
        error instanceof Error ? error : new Error(String(error)),
      );
      return [];
    }
  }
}

class CodexSdkProvider implements AgentSdkProvider {
  readonly name = "codex";

  async listModels(
    _userId: string,
    _workspacePath?: string,
  ): Promise<AgentModelDescriptor[]> {
    return listCodexModels();
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    userId: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    modelParams?: AgentModelParams;
  }): AgentQuerySession {
    return new CodexQuerySession({
      ...options,
      systemPrompt: options.systemPrompt ?? SYSTEM_PROMPT,
      reasoningEffort: options.modelParams?.reasoningEffort,
    });
  }

  async listSessions(
    _options: AgentListSessionsRequest,
    _userId: string,
  ): Promise<AgentSessionInfoEntry[]> {
    return [];
  }

  async getSessionMessages(
    _options: AgentGetSessionMessagesRequest,
    _userId: string,
  ): Promise<AgentTranscriptMessage[]> {
    return [];
  }
}

class OpenCodeSdkProvider implements AgentSdkProvider {
  readonly name = "opencode";

  async listModels(
    _userId: string,
    workspacePath?: string,
  ): Promise<AgentModelDescriptor[]> {
    return listOpenCodeModels(workspacePath);
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    userId: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    modelParams?: AgentModelParams;
  }): AgentQuerySession {
    return new OpenCodeQuerySession({
      ...options,
      systemPrompt: options.systemPrompt ?? SYSTEM_PROMPT,
    });
  }

  async listSessions(
    options: AgentListSessionsRequest,
    _userId: string,
  ): Promise<AgentSessionInfoEntry[]> {
    return listOpenCodeSessions(options);
  }

  async getSessionMessages(
    options: AgentGetSessionMessagesRequest,
    _userId: string,
  ): Promise<AgentTranscriptMessage[]> {
    return getOpenCodeSessionMessages(options);
  }
}

class PiSdkProvider implements AgentSdkProvider {
  readonly name = "pi";

  async listModels(
    _userId: string,
    _workspacePath?: string,
  ): Promise<AgentModelDescriptor[]> {
    return listPiModels();
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    userId: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    modelParams?: AgentModelParams;
  }): AgentQuerySession {
    return new PiQuerySession({
      ...options,
      systemPrompt: options.systemPrompt ?? SYSTEM_PROMPT,
    });
  }

  async listSessions(
    options: AgentListSessionsRequest,
    _userId: string,
  ): Promise<AgentSessionInfoEntry[]> {
    return listPiSessions(options);
  }

  async getSessionMessages(
    options: AgentGetSessionMessagesRequest,
    _userId: string,
  ): Promise<AgentTranscriptMessage[]> {
    return getPiSessionMessages(options);
  }
}

const providers: Record<string, AgentSdkProvider> = {
  claude: new ClaudeSdkProvider(),
  codex: new CodexSdkProvider(),
  opencode: new OpenCodeSdkProvider(),
  pi: new PiSdkProvider(),
  llm: new LlmAgentSdkProvider(),
};

function getProvider(name?: string): AgentSdkProvider {
  return providers[name ?? "claude"] ?? providers.claude;
}

/**
 * AgentRuntime — manages all active agent sessions.
 *
 * One instance is shared per process. Each WebSocket connection routes its
 * commands through this runtime; sessions are addressable by their sessionId
 * from any connection (so a user can reconnect mid-stream), but every
 * mutating operation is gated by the calling user's id — sessionIds are
 * predictable (counter-based for the temp id; thread-id for LLM after the
 * first turn) so the runtime must enforce ownership rather than rely on
 * sessionId being a secret.
 */
class AgentRuntime {
  private readonly activeSessions = new Map<string, AgentQuerySession>();
  /** Owning userId for each entry in `activeSessions`. */
  private readonly sessionOwners = new Map<string, string>();
  private sessionCounter = 0;

  /**
   * Throw a uniform "not yours" error so callers can't probe session ids.
   * Returns the session if the caller owns it, otherwise throws.
   */
  private getOwnedSession(
    sessionId: string,
    userId: string,
  ): AgentQuerySession {
    const session = this.activeSessions.get(sessionId);
    const owner = this.sessionOwners.get(sessionId);
    if (!session || !owner || owner !== userId) {
      // Same error whether the session doesn't exist or belongs to someone
      // else — don't leak existence to other users.
      throw new Error(`No active agent session with ID: ${sessionId}`);
    }
    return session;
  }

  async createSession(
    options: AgentSessionOptions,
    userId: string,
  ): Promise<string> {
    if (!userId) {
      throw new Error(
        "createSession requires an authenticated userId — agent socket must be authenticated",
      );
    }
    // The "llm" provider runs in-process with only ui_* tools — no file
    // system access, so a workspace is irrelevant. Every other provider
    // (CLI harness) must have one.
    const requiresWorkspace = options.provider !== "llm";
    if (requiresWorkspace) {
      if (!options.resumeSessionId && !options.workspacePath) {
        throw new Error(
          "workspacePath is required when creating a new agent session",
        );
      }
      if (!options.workspacePath) {
        throw new Error("workspacePath is required");
      }
    }

    const provider = getProvider(options.provider);
    const tempId = `${provider.name}-session-${++this.sessionCounter}`;
    const sessionMode = options.resumeSessionId ? "resuming" : "creating";
    log.info(
      `${sessionMode} ${provider.name} agent session for user ${userId} with model: ${options.model}${
        options.workspacePath ? ` (workspace: ${options.workspacePath})` : ""
      }`,
    );

    const session = provider.createSession({
      model: options.model,
      workspacePath: options.workspacePath ?? "",
      userId,
      resumeSessionId: options.resumeSessionId,
      modelParams: options.modelParams,
      chatProviderId: options.chatProviderId,
    });

    this.activeSessions.set(tempId, session);
    this.sessionOwners.set(tempId, userId);
    log.info(`${provider.name} agent session created: ${tempId}`);
    return tempId;
  }

  /**
   * Send a message and stream replies through the given transport.
   * Returns when the agent turn completes.
   */
  async sendMessageStreaming(
    sessionId: string,
    message: string,
    transport: AgentTransport,
    userId: string,
  ): Promise<void> {
    const session = this.getOwnedSession(sessionId, userId);

    log.info(`Sending message to agent session ${sessionId} (streaming)`);

    // Frontend UI tools are proxied through the shared /mcp endpoint using
    // whichever renderer transport is currently active.
    setMcpFrontendTransport(transport);
    const mcpServerUrl = getLocalMcpServerUrl();

    let frontendTools: FrontendToolManifest[] = [];
    try {
      frontendTools = await transport.requestToolManifest(sessionId);
      log.debug(
        `Frontend tools manifest for session ${sessionId}: ${frontendTools.length} tool(s) [${frontendTools
          .map((t) => t.name)
          .join(", ")}]`,
      );

      const missingFrontendTools = getMissingFrontendTools(frontendTools);
      if (missingFrontendTools.length > 0) {
        throw new Error(
          `Renderer frontend tool manifest is incomplete for session ${sessionId}. Missing tools: ${missingFrontendTools.join(", ")}`,
        );
      }
    } catch (error) {
      log.warn(
        `Failed to get frontend tools manifest: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    let messageCount = 0;
    await session.send(
      message,
      transport,
      sessionId,
      frontendTools,
      (serialized) => {
        if (
          serialized.session_id &&
          serialized.session_id !== sessionId &&
          !this.activeSessions.has(serialized.session_id)
        ) {
          // The SDK / LLM session resolved its real id (e.g. Claude session
          // id, our DB thread id). Re-key under that id and stamp ownership
          // so subsequent commands targeted at the real id stay scoped to
          // the same user.
          this.activeSessions.set(serialized.session_id, session);
          this.sessionOwners.set(serialized.session_id, userId);
        }
        messageCount++;
        transport.streamMessage(sessionId, serialized, false);
      },
      mcpServerUrl,
    );

    transport.streamMessage(
      sessionId,
      {
        type: "system",
        uuid: randomUUID(),
        session_id: sessionId,
      },
      true,
    );

    log.info(
      `Agent session ${sessionId}: streamed ${messageCount} messages`,
    );
  }

  async stopExecution(sessionId: string, userId: string): Promise<void> {
    const session = this.getOwnedSession(sessionId, userId);
    await session.interrupt();
  }

  closeSession(sessionId: string, userId: string): void {
    const session = this.activeSessions.get(sessionId);
    const owner = this.sessionOwners.get(sessionId);
    if (!session || owner !== userId) return;
    log.info(`Closing agent session: ${sessionId}`);
    session.close();
    for (const [id, s] of this.activeSessions.entries()) {
      if (s === session) {
        this.activeSessions.delete(id);
        this.sessionOwners.delete(id);
      }
    }
  }

  closeAllSessions(): void {
    const uniqueSessions = new Set(this.activeSessions.values());
    for (const session of uniqueSessions) {
      log.info("Closing agent session on shutdown");
      session.close();
    }
    this.activeSessions.clear();
    this.sessionOwners.clear();
    closeOpenCodeServer();
    stopMcpToolServer();
  }

  async listModels(
    options: AgentModelsRequest,
    userId: string,
  ): Promise<AgentModelDescriptor[]> {
    const provider = getProvider(options.provider);
    return provider.listModels(userId, options.workspacePath);
  }

  async listSessionsForRequest(
    options: AgentListSessionsRequest,
    userId: string,
  ): Promise<AgentSessionInfoEntry[]> {
    if (options.provider) {
      const provider = getProvider(options.provider);
      return provider.listSessions(options, userId);
    }
    const results = await Promise.all(
      Object.values(providers).map((p) => p.listSessions(options, userId)),
    );
    return results.flat();
  }

  async getSessionMessagesForRequest(
    options: AgentGetSessionMessagesRequest,
    userId: string,
  ): Promise<AgentTranscriptMessage[]> {
    for (const provider of Object.values(providers)) {
      const messages = await provider.getSessionMessages(options, userId);
      if (messages.length > 0) {
        return messages;
      }
    }
    return [];
  }
}

let runtimeInstance: AgentRuntime | null = null;

export function getAgentRuntime(): AgentRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new AgentRuntime();
  }
  return runtimeInstance;
}

export type { AgentRuntime };
