/**
 * Agent runtime — manages Pi and in-house LLM agent sessions.
 *
 * Sessions live entirely in-process; renderers connect over WebSocket
 * (see `socket-route.ts`) and provide a transport for streaming
 * messages and bridging frontend tool execution.
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { uiToolSchemas } from "@nodetool-ai/protocol";
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

// AgentSdkProvider interface lives in `sdk-provider.ts` (re-exported at the
// top of this file) so the LLM provider can import it without creating a
// circular dependency back to this module.

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
  pi: new PiSdkProvider(),
  llm: new LlmAgentSdkProvider(),
};

function getProvider(name?: string): AgentSdkProvider {
  return providers[name ?? "llm"] ?? providers.llm;
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
    // system access, so a workspace is irrelevant. The "pi" provider needs
    // one for its file-system tools.
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
          // The session resolved its real id (e.g. our DB thread id for the
          // LLM provider). Re-key under that id and stamp ownership so
          // subsequent commands targeted at the real id stay scoped to the
          // same user.
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
