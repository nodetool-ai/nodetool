/**
 * LlmAgentSdkProvider — runs an in-process LLM as an agent against the same
 * `ui_*` tool surface the Claude/Codex/OpenCode/Pi harnesses use, and the
 * same workflow-builder system prompt.
 *
 * Architecture:
 *
 *   AgentPanel (renderer)
 *     │
 *     └── /ws/agent (AgentSocketTransport)
 *           │
 *           ├── create_session{ provider:"llm", chatProviderId, model }
 *           ├── send_message{ message }
 *           │
 *           ▼
 *     LlmAgentSession.send()
 *       │
 *       ├── manifest := transport.requestToolManifest(sessionId)
 *       ├── tools    := manifest.map(UiBridgeTool)   (each delegates back to
 *       │                                              transport.executeTool)
 *       ├── provider := getProvider(chatProviderId)   (anthropic/openai/...)
 *       │
 *       └── processChat({ provider, model, tools, ... })
 *             ├── streams text chunks  ──► onMessage(AgentMessage{type:"assistant"})
 *             ├── invokes tool         ──► UiBridgeTool.process()
 *             │                                ──► transport.executeTool()
 *             │                                       ──► renderer runs ui_* tool
 *             └── returns final assistant text
 *
 * Unlike the harness providers, there is no subprocess and no MCP server
 * here; tool dispatch is direct over the existing AgentTransport.
 */

import { randomUUID } from "node:crypto";

import { processChat } from "@nodetool/chat";
import { Tool } from "@nodetool/agents";
import {
  ProcessingContext,
  getProvider as getRuntimeProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
} from "@nodetool/runtime";
import type { BaseProvider, Message } from "@nodetool/runtime";
import type {
  AgentMessage,
  AgentModelDescriptor,
  AgentTranscriptMessage,
  FrontendToolManifest,
} from "@nodetool/protocol";
import { createLogger } from "@nodetool/config";

import {
  SYSTEM_PROMPT,
  type AgentQuerySession,
  type AgentSdkProvider,
} from "./agent-runtime.js";
import type { AgentTransport } from "./transport.js";

const log = createLogger("nodetool.websocket.agent.llm");

const MAX_AGGREGATED_MODELS = 200;

/**
 * Wraps a renderer-resident UI tool as an in-process Tool. `process()` proxies
 * the call back over the AgentTransport — same path the MCP server uses for
 * harness providers, but without the MCP indirection.
 */
class UiBridgeTool extends Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;

  constructor(
    private readonly transport: AgentTransport,
    private readonly sessionId: string,
    manifest: FrontendToolManifest,
  ) {
    super();
    this.name = manifest.name;
    this.description = manifest.description;
    // Manifest parameters are already JSON Schema (see toolSchemas.ts and the
    // renderer's frontend tool registration). Pass through unchanged.
    this.inputSchema =
      (manifest.parameters as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      };
  }

  async process(
    _ctx: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return await this.transport.executeTool(
      this.sessionId,
      randomUUID(),
      this.name,
      params,
    );
  }
}

interface LlmAgentSessionOptions {
  chatProviderId: string;
  model: string;
  systemPrompt?: string;
  userId?: string;
}

class LlmAgentSession implements AgentQuerySession {
  private closed = false;
  private inFlight = false;
  private abortController: AbortController | null = null;
  private readonly conversation: Message[] = [];
  private readonly chatProviderId: string;
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly userId: string;

  constructor(opts: LlmAgentSessionOptions) {
    this.chatProviderId = opts.chatProviderId;
    this.model = opts.model;
    this.systemPrompt = opts.systemPrompt ?? SYSTEM_PROMPT;
    this.userId = opts.userId ?? "1";
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
      throw new Error("A request is already in progress for this session");
    }
    if (!transport) {
      throw new Error("LLM agent session requires an active transport");
    }
    this.inFlight = true;
    this.abortController = new AbortController();

    const out: AgentMessage[] = [];
    const emit = (msg: AgentMessage) => {
      out.push(msg);
      onMessage?.(msg);
    };

    try {
      const provider = await getRuntimeProvider(this.chatProviderId, this.userId);
      const tools = manifest.map(
        (m) => new UiBridgeTool(transport, sessionId, m),
      );

      // Inject system prompt once at the start of the conversation. Subsequent
      // turns reuse the existing history (so the model has full context).
      if (this.conversation.length === 0 && this.systemPrompt) {
        this.conversation.push({
          role: "system",
          content: this.systemPrompt,
        } as Message);
      }

      // ProcessingContext is required by the Tool interface but UiBridgeTool
      // ignores it (the renderer holds all state). A minimal ctx is enough.
      const ctx = new ProcessingContext({
        jobId: `llm-agent-${sessionId}`,
        userId: this.userId,
      });

      let assistantText = "";
      await processChat({
        userInput: message,
        messages: this.conversation,
        model: this.model,
        provider,
        context: ctx,
        tools,
        signal: this.abortController.signal,
        callbacks: {
          onChunk: (text) => {
            assistantText += text;
            emit({
              type: "assistant",
              uuid: randomUUID(),
              session_id: sessionId,
              text,
              content: [{ type: "text", text }],
            });
          },
          onToolCall: (toolCall) => {
            emit({
              type: "assistant",
              uuid: randomUUID(),
              session_id: sessionId,
              tool_calls: [
                {
                  id: toolCall.id,
                  type: "function",
                  function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.args ?? {}),
                  },
                },
              ],
            });
          },
        },
      });

      emit({
        type: "result",
        uuid: randomUUID(),
        session_id: sessionId,
        text: assistantText,
        is_error: false,
        subtype: "success",
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(
        `LLM agent session ${sessionId} failed`,
        error instanceof Error ? error : new Error(errMsg),
      );
      emit({
        type: "result",
        uuid: randomUUID(),
        session_id: sessionId,
        subtype: "error",
        is_error: true,
        errors: [errMsg],
      });
    } finally {
      this.inFlight = false;
      this.abortController = null;
    }

    return out;
  }

  async interrupt(): Promise<void> {
    this.abortController?.abort();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.abortController?.abort();
  }
}

/**
 * Aggregate language models from every configured chat provider, filter to
 * those that support tool calls, and tag each descriptor with its underlying
 * `chatProviderId`. The renderer surfaces these as a single flat list under
 * the "llm" agent provider.
 */
async function listAllToolCapableLanguageModels(
  userId = "1",
): Promise<AgentModelDescriptor[]> {
  const providerIds = listRegisteredProviderIds();
  const out: AgentModelDescriptor[] = [];

  for (const providerId of providerIds) {
    if (!(await isProviderConfigured(providerId, userId))) continue;
    let provider: BaseProvider;
    try {
      provider = await getRuntimeProvider(providerId, userId);
    } catch {
      continue;
    }

    let models: Awaited<ReturnType<BaseProvider["getAvailableLanguageModels"]>>;
    try {
      models = await provider.getAvailableLanguageModels();
    } catch {
      continue;
    }
    if (!models || models.length === 0) continue;

    const flags = await Promise.all(
      models.map((m) =>
        provider
          .hasToolSupport(m.id)
          .catch(() => true), // unknown ⇒ assume supported, matches BaseProvider default
      ),
    );

    for (let i = 0; i < models.length; i++) {
      if (flags[i] === false) continue;
      const m = models[i];
      out.push({
        id: m.id,
        label: `${m.name || m.id} (${providerId})`,
        provider: "llm",
        chatProviderId: providerId,
      });
      if (out.length >= MAX_AGGREGATED_MODELS) return out;
    }
  }

  if (out.length > 0) {
    out[0].isDefault = true;
  }
  return out;
}

export class LlmAgentSdkProvider implements AgentSdkProvider {
  readonly name = "llm";

  async listModels(_workspacePath?: string): Promise<AgentModelDescriptor[]> {
    return listAllToolCapableLanguageModels();
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    chatProviderId?: string;
    userId?: string;
  }): AgentQuerySession {
    if (!options.chatProviderId) {
      throw new Error(
        "LLM agent session requires `chatProviderId` (e.g. 'anthropic', 'openai').",
      );
    }
    if (options.resumeSessionId) {
      // The LLM agent doesn't persist sessions to disk yet — the renderer is
      // the source of truth for transcripts. Surface a clear error rather
      // than silently starting a new session.
      throw new Error(
        "LLM agent provider does not support resuming previous sessions yet.",
      );
    }
    return new LlmAgentSession({
      chatProviderId: options.chatProviderId,
      model: options.model,
      systemPrompt: options.systemPrompt,
      userId: options.userId,
    });
  }

  async listSessions(): Promise<never[]> {
    return [];
  }

  async getSessionMessages(): Promise<AgentTranscriptMessage[]> {
    return [];
  }
}
