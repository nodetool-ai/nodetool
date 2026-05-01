/**
 * OpenCode SDK agent integration.
 *
 * Uses @opencode-ai/sdk to manage sessions and send prompts. OpenCode runs
 * as a local server; we spawn it and connect via the SDK client.
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
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

const log = createLogger("nodetool.websocket.agent.opencode");

interface OpencodeModelInfo {
  id: string;
  name: string;
  reasoning: boolean;
  tool_call: boolean;
  status?: "alpha" | "beta" | "deprecated";
}

interface OpencodeProviderInfo {
  name: string;
  id: string;
  models: Record<string, OpencodeModelInfo>;
}

interface OpencodeConfiguredModel {
  id: string;
  name: string;
  capabilities: {
    reasoning: boolean;
    toolcall: boolean;
  };
}

interface OpencodeConfiguredProvider {
  id: string;
  name: string;
  source: "env" | "config" | "custom" | "api";
  models: Record<string, OpencodeConfiguredModel>;
}

interface OpencodeClient {
  provider: {
    list(options?: Record<string, unknown>): Promise<{
      data?: {
        all: Array<OpencodeProviderInfo>;
        default: Record<string, string>;
        connected: Array<string>;
      };
    }>;
  };
  config: {
    providers(options?: Record<string, unknown>): Promise<{
      data?: {
        providers: Array<OpencodeConfiguredProvider>;
        default: Record<string, string>;
      };
    }>;
  };
  session: {
    create(options: Record<string, unknown>): Promise<{ data?: { id: string } }>;
    list(options: Record<string, unknown>): Promise<{
      data?: Array<{
        id: string;
        title: string;
        directory: string;
        time: { created: number; updated: number };
      }>;
    }>;
    messages(options: Record<string, unknown>): Promise<{
      data?: Array<{
        info: { id: string; role: string; sessionID: string };
        parts: Array<{
          type: string;
          id?: string;
          text?: string;
          tool?: string;
          state?: unknown;
        }>;
      }>;
    }>;
    prompt(options: Record<string, unknown>): Promise<{
      data?: {
        info: { id: string; role: string; sessionID: string };
        parts: Array<{
          type: string;
          id?: string;
          text?: string;
          tool?: string;
          state?: unknown;
        }>;
      };
    }>;
    abort(options: Record<string, unknown>): Promise<unknown>;
  };
}

let clientInstance: OpencodeClient | null = null;
let serverClose: (() => void) | null = null;

async function getClient(): Promise<OpencodeClient> {
  if (clientInstance) {
    return clientInstance;
  }

  const sdk = (await import("@opencode-ai/sdk")) as unknown as {
    createOpencode: (
      opts?: unknown,
    ) => Promise<{ client: unknown; server: { url: string; close: () => void } }>;
  };
  const { client, server } = await sdk.createOpencode();
  clientInstance = client as unknown as OpencodeClient;
  serverClose = server.close;
  log.info(`OpenCode server started at ${server.url}`);
  return clientInstance;
}

function getClientIfRunning(): OpencodeClient | null {
  return clientInstance;
}

export function closeOpenCodeServer(): void {
  if (serverClose) {
    serverClose();
    serverClose = null;
    clientInstance = null;
  }
}

export async function listOpenCodeModels(
  workspacePath?: string,
): Promise<AgentModelDescriptor[]> {
  const models: AgentModelDescriptor[] = [];
  const seen = new Set<string>();

  const query = workspacePath ? { query: { directory: workspacePath } } : {};

  let client: OpencodeClient;
  try {
    client = await getClient();
  } catch (error) {
    log.error(
      "Failed to start OpenCode server for model listing",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }

  // Primary source: providers the user has actually configured (env vars,
  // opencode.json, oauth). These are ready to use without further setup.
  try {
    const configured = await client.config.providers(query);
    if (configured.data?.providers) {
      const defaultModelIds = new Set(
        Object.values(configured.data.default ?? {}),
      );
      for (const provider of configured.data.providers) {
        for (const [modelId, modelInfo] of Object.entries(provider.models)) {
          if (!modelInfo.capabilities?.toolcall) continue;
          const compositeId = `${provider.id}/${modelId}`;
          if (seen.has(compositeId)) continue;
          seen.add(compositeId);
          models.push({
            id: compositeId,
            label: `${modelInfo.name} (${provider.name})`,
            provider: "opencode",
            isDefault: defaultModelIds.has(modelId),
            supportsMaxTurns: false,
            supportsReasoningEffort:
              modelInfo.capabilities?.reasoning ?? false,
          });
        }
      }
    }
  } catch (error) {
    log.warn(
      `config.providers failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Supplemental source: the full catalog from provider.list. Appends models
  // that weren't in the configured set (labelled "not connected") so the
  // user can discover and configure them. Also used as the sole source if
  // config.providers returned nothing usable.
  try {
    const all = await client.provider.list(query);
    if (all.data) {
      const connectedSet = new Set(all.data.connected ?? []);
      const defaultModelIds = new Set(Object.values(all.data.default ?? {}));
      for (const provider of all.data.all ?? []) {
        const isConnected = connectedSet.has(provider.id);
        for (const [modelId, modelInfo] of Object.entries(provider.models)) {
          if (modelInfo.status === "deprecated") continue;
          if (!modelInfo.tool_call) continue;
          const compositeId = `${provider.id}/${modelId}`;
          if (seen.has(compositeId)) continue;
          seen.add(compositeId);
          const label = isConnected
            ? `${modelInfo.name} (${provider.name})`
            : `${modelInfo.name} (${provider.name}, not connected)`;
          models.push({
            id: compositeId,
            label,
            provider: "opencode",
            isDefault: isConnected && defaultModelIds.has(modelId),
            supportsMaxTurns: false,
            supportsReasoningEffort: modelInfo.reasoning,
          });
        }
      }
    }
  } catch (error) {
    log.error(
      "provider.list failed",
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  if (models.length > 0 && !models.some((m) => m.isDefault)) {
    models[0].isDefault = true;
  }

  log.info(`Listed ${models.length} OpenCode model(s)`);
  return models;
}

export async function listOpenCodeSessions(
  options: AgentListSessionsRequest,
): Promise<AgentSessionInfoEntry[]> {
  try {
    const client = getClientIfRunning();
    if (!client) return [];

    const result = await client.session.list({
      query: { directory: options.dir },
    });
    if (!result.data) return [];

    return result.data.map((s) => ({
      sessionId: s.id,
      summary: s.title,
      lastModified: s.time.updated,
      cwd: s.directory,
      createdAt: s.time.created,
      provider: "opencode" as const,
    }));
  } catch (error) {
    log.error(
      "Failed to list OpenCode sessions",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

export async function getOpenCodeSessionMessages(
  options: AgentGetSessionMessagesRequest,
): Promise<AgentTranscriptMessage[]> {
  try {
    const client = getClientIfRunning();
    if (!client) return [];

    const result = await client.session.messages({
      path: { id: options.sessionId },
    });
    if (!result.data) return [];

    return result.data
      .map((entry) => {
        const role =
          entry.info.role === "user" ? ("user" as const) : ("assistant" as const);
        const textParts = entry.parts
          .filter(
            (p): p is {
              type: "text";
              text: string;
              id: string;
              sessionID: string;
              messageID: string;
            } => p.type === "text" && "text" in p,
          )
          .map((p) => p.text);

        return {
          type: role,
          uuid: entry.info.id,
          session_id: entry.info.sessionID,
          text: textParts.join("\n"),
        };
      })
      .filter((m) => m.text.length > 0);
  } catch (error) {
    log.error(
      "Failed to get OpenCode session messages",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

export class OpenCodeQuerySession {
  private closed = false;
  private readonly providerID: string;
  private readonly modelID: string;
  private readonly workspacePath: string;
  private readonly systemPrompt: string;
  private sessionId: string | null;
  private inFlight = false;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
  }) {
    const parts = options.model.split("/");
    if (parts.length >= 2) {
      this.providerID = parts[0];
      this.modelID = parts.slice(1).join("/");
    } else {
      this.providerID = "anthropic";
      this.modelID = options.model;
    }
    this.workspacePath = options.workspacePath;
    this.systemPrompt = options.systemPrompt ?? "";
    this.sessionId = options.resumeSessionId ?? null;
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;

    const client = await getClient();
    const result = await client.session.create({
      body: { title: "NodeTool Agent Session" },
      query: { directory: this.workspacePath },
    });

    if (!result.data) {
      throw new Error("Failed to create OpenCode session");
    }

    this.sessionId = result.data.id;
    log.info(`OpenCode session created: ${this.sessionId}`);

    if (this.systemPrompt.trim().length > 0) {
      await client.session.prompt({
        path: { id: this.sessionId },
        body: {
          noReply: true,
          parts: [{ type: "text", text: this.systemPrompt }],
          model: { providerID: this.providerID, modelID: this.modelID },
        },
      });
    }

    return this.sessionId;
  }

  async send(
    message: string,
    _transport: AgentTransport | null,
    sessionId: string,
    _manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
    _mcpServerUrl?: string | null,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A request is already in progress for this session");
    }

    this.inFlight = true;

    try {
      const ocSessionId = await this.ensureSession();
      const client = await getClient();

      const result = await client.session.prompt({
        path: { id: ocSessionId },
        body: {
          parts: [{ type: "text", text: message }],
          model: { providerID: this.providerID, modelID: this.modelID },
        },
      });

      if (!result.data) {
        throw new Error("OpenCode prompt returned no data");
      }

      const resolvedSessionId = this.sessionId ?? sessionId;
      const outputMessages: AgentMessage[] = [];

      for (const part of result.data.parts) {
        if (part.type === "text" && part.text && part.text.trim().length > 0) {
          const msg: AgentMessage = {
            type: "assistant",
            uuid: part.id ?? randomUUID(),
            session_id: resolvedSessionId,
            content: [{ type: "text", text: part.text! }],
          };
          outputMessages.push(msg);
          if (onMessage) onMessage(msg);
        } else if (part.type === "tool" && "tool" in part) {
          const toolInput =
            "state" in part &&
            part.state &&
            typeof part.state === "object" &&
            "input" in part.state
              ? (part.state as { input?: unknown }).input
              : {};
          const msg: AgentMessage = {
            type: "assistant",
            uuid: part.id ?? randomUUID(),
            session_id: resolvedSessionId,
            content: [],
            tool_calls: [
              {
                id: part.id ?? randomUUID(),
                type: "function",
                function: {
                  name: part.tool ?? "unknown",
                  arguments: JSON.stringify(toolInput ?? {}),
                },
              },
            ],
          };
          outputMessages.push(msg);
          if (onMessage) onMessage(msg);
        }
      }

      if (outputMessages.length === 0) {
        const msg: AgentMessage = {
          type: "result",
          uuid: randomUUID(),
          session_id: resolvedSessionId,
          subtype: "success",
          text: "Completed",
        };
        outputMessages.push(msg);
        if (onMessage) onMessage(msg);
      }

      return outputMessages;
    } catch (error) {
      const errorMsg: AgentMessage = {
        type: "result",
        uuid: randomUUID(),
        session_id: this.sessionId ?? sessionId,
        subtype: "error",
        is_error: true,
        errors: [error instanceof Error ? error.message : String(error)],
      };
      if (onMessage) onMessage(errorMsg);
      return [errorMsg];
    } finally {
      this.inFlight = false;
    }
  }

  async interrupt(): Promise<void> {
    if (this.sessionId) {
      try {
        const client = await getClient();
        await client.session.abort({
          path: { id: this.sessionId },
        });
      } catch (error) {
        log.warn(
          `Failed to abort OpenCode session: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
  }
}
