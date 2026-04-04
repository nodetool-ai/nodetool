/**
 * OpenCode SDK agent integration for the Electron main process.
 *
 * Uses @opencode-ai/sdk to manage sessions and send prompts.
 * OpenCode runs as a local server; we spawn it and connect via the SDK client.
 */

import { randomUUID } from "node:crypto";
import { logMessage } from "./logger";
import type {
  AgentModelDescriptor,
  AgentMessage,
  AgentListSessionsRequest,
  AgentSessionInfoEntry,
  AgentGetSessionMessagesRequest,
  AgentTranscriptMessage,
  FrontendToolManifest,
} from "./types.d";
import type { WebContents } from "electron";

// The SDK client type — we use a structural interface instead of importing
// the type directly to avoid static resolution issues with Vite's bundler.
// The actual SDK is loaded dynamically via import() at runtime.
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
        parts: Array<{ type: string; id?: string; text?: string; tool?: string; state?: unknown }>;
      }>;
    }>;
    prompt(options: Record<string, unknown>): Promise<{
      data?: {
        info: { id: string; role: string; sessionID: string };
        parts: Array<{ type: string; id?: string; text?: string; tool?: string; state?: unknown }>;
      };
    }>;
    abort(options: Record<string, unknown>): Promise<unknown>;
  };
}

// ---------------------------------------------------------------------------
// OpenCode client singleton
// ---------------------------------------------------------------------------

let clientInstance: OpencodeClient | null = null;
let serverClose: (() => void) | null = null;

async function getClient(): Promise<OpencodeClient> {
  if (clientInstance) {
    return clientInstance;
  }

  // The SDK is ESM-only with strict exports (no CJS, no "main" field).
  // We locate it by walking up from __dirname to find node_modules.
  const { join } = await import("node:path");
  const { existsSync } = await import("node:fs");

  let searchDir = __dirname;
  let sdkEntry = "";
  for (let i = 0; i < 10; i++) {
    const candidate = join(searchDir, "node_modules", "@opencode-ai", "sdk", "dist", "index.js");
    if (existsSync(candidate)) {
      sdkEntry = candidate;
      break;
    }
    searchDir = join(searchDir, "..");
  }
  if (!sdkEntry) {
    throw new Error("Could not find @opencode-ai/sdk in node_modules");
  }

  const sdk = await (import(/* webpackIgnore: true */ sdkEntry) as Promise<{
    createOpencode: (opts?: unknown) => Promise<{ client: unknown; server: { url: string; close: () => void } }>;
  }>);
  const { client, server } = await sdk.createOpencode();
  clientInstance = client as unknown as OpencodeClient;
  serverClose = server.close;
  logMessage(`OpenCode server started at ${server.url}`);
  return clientInstance;
}

/** Returns the client only if already started, without spawning the server. */
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

// ---------------------------------------------------------------------------
// Model listing
// ---------------------------------------------------------------------------

export async function listOpenCodeModels(): Promise<AgentModelDescriptor[]> {
  try {
    const client = await getClient();
    const result = await client.provider.list();
    if (!result.data) {
      return [];
    }

    const { all: providerList, default: defaults, connected } = result.data;
    const connectedSet = new Set(connected);

    // Build a set of default model IDs for quick lookup
    const defaultModelIds = new Set(Object.values(defaults));

    const models: AgentModelDescriptor[] = [];
    for (const provider of providerList) {
      // Only show models from connected providers
      if (!connectedSet.has(provider.id)) {
        continue;
      }

      for (const [modelId, modelInfo] of Object.entries(provider.models)) {
        // Skip deprecated models
        if (modelInfo.status === "deprecated") {
          continue;
        }

        // Only include models that support tool calling (needed for agent)
        if (!modelInfo.tool_call) {
          continue;
        }

        const compositeId = `${provider.id}/${modelId}`;
        models.push({
          id: compositeId,
          label: `${modelInfo.name} (${provider.name})`,
          provider: "opencode",
          isDefault: defaultModelIds.has(modelId),
          supportsMaxTurns: false,
          supportsReasoningEffort: modelInfo.reasoning,
        });
      }
    }

    // Ensure at least one default
    if (models.length > 0 && !models.some((m) => m.isDefault)) {
      models[0].isDefault = true;
    }

    return models;
  } catch (error) {
    logMessage(`Failed to list OpenCode models: ${error}`, "error");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Session listing
// ---------------------------------------------------------------------------

export async function listOpenCodeSessions(
  options: AgentListSessionsRequest,
): Promise<AgentSessionInfoEntry[]> {
  try {
    const client = getClientIfRunning();
    if (!client) {
      return [];
    }
    const result = await client.session.list({
      query: { directory: options.dir },
    });

    if (!result.data) {
      return [];
    }

    return result.data.map((s) => ({
      sessionId: s.id,
      summary: s.title,
      lastModified: s.time.updated,
      cwd: s.directory,
      createdAt: s.time.created,
      provider: "opencode" as const,
    }));
  } catch (error) {
    logMessage(`Failed to list OpenCode sessions: ${error}`, "error");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Session messages
// ---------------------------------------------------------------------------

export async function getOpenCodeSessionMessages(
  options: AgentGetSessionMessagesRequest,
): Promise<AgentTranscriptMessage[]> {
  try {
    const client = getClientIfRunning();
    if (!client) {
      return [];
    }
    const result = await client.session.messages({
      path: { id: options.sessionId },
    });

    if (!result.data) {
      return [];
    }

    return result.data
      .map((entry) => {
        const role = entry.info.role === "user" ? "user" as const : "assistant" as const;
        const textParts = entry.parts
          .filter((p): p is { type: "text"; text: string; id: string; sessionID: string; messageID: string } =>
            p.type === "text" && "text" in p
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
    logMessage(`Failed to get OpenCode session messages: ${error}`, "error");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Session implementation
// ---------------------------------------------------------------------------

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
    // Model format: "providerID/modelID" (e.g., "anthropic/claude-sonnet-4-20250514")
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
    if (this.sessionId) {
      return this.sessionId;
    }

    const client = await getClient();
    const result = await client.session.create({
      body: { title: "NodeTool Agent Session" },
      query: { directory: this.workspacePath },
    });

    if (!result.data) {
      throw new Error("Failed to create OpenCode session");
    }

    this.sessionId = result.data.id;
    logMessage(`OpenCode session created: ${this.sessionId}`);

    // Send system prompt as context-only message
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
    _webContents: WebContents | null,
    sessionId: string,
    _manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
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

      // Convert response parts to AgentMessages
      for (const part of result.data.parts) {
        if (part.type === "text" && part.text && part.text.trim().length > 0) {
          const msg: AgentMessage = {
            type: "assistant",
            uuid: part.id ?? randomUUID(),
            session_id: resolvedSessionId,
            content: [{ type: "text", text: part.text! }],
          };
          outputMessages.push(msg);
          if (onMessage) {
            onMessage(msg);
          }
        } else if (part.type === "tool" && "tool" in part) {
          const toolInput = "state" in part && part.state && typeof part.state === "object" && "input" in part.state
            ? (part.state as { input?: unknown }).input
            : {};
          const msg: AgentMessage = {
            type: "assistant",
            uuid: part.id ?? randomUUID(),
            session_id: resolvedSessionId,
            content: [],
            tool_calls: [{
              id: part.id ?? randomUUID(),
              type: "function",
              function: {
                name: part.tool ?? "unknown",
                arguments: JSON.stringify(toolInput ?? {}),
              },
            }],
          };
          outputMessages.push(msg);
          if (onMessage) {
            onMessage(msg);
          }
        }
      }

      // If no text was extracted, add result summary
      if (outputMessages.length === 0) {
        const msg: AgentMessage = {
          type: "result",
          uuid: randomUUID(),
          session_id: resolvedSessionId,
          subtype: "success",
          text: "Completed",
        };
        outputMessages.push(msg);
        if (onMessage) {
          onMessage(msg);
        }
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
      if (onMessage) {
        onMessage(errorMsg);
      }
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
        logMessage(`Failed to abort OpenCode session: ${error}`, "warn");
      }
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
  }
}
