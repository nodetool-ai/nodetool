/**
 * Codex SDK agent integration.
 *
 * Uses the official @openai/codex-sdk to manage threads and stream events.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@nodetool/config";
import {
  Codex,
  type ThreadEvent,
  type ThreadItem,
  type ThreadOptions,
} from "@openai/codex-sdk";
import {
  getMcpToolServerUrl,
  startMcpToolServer,
  setMcpToolServerTransport,
} from "./mcp-tool-server.js";
import type { AgentTransport } from "./transport.js";
import type {
  AgentMessage,
  AgentModelDescriptor,
  FrontendToolManifest,
} from "./types.js";

const log = createLogger("nodetool.websocket.agent.codex");

let codexInstance: Codex | null = null;

function getCodex(): Codex {
  if (!codexInstance) {
    codexInstance = new Codex();
  }
  return codexInstance;
}

export async function listCodexModels(): Promise<AgentModelDescriptor[]> {
  return [
    { id: "gpt-5.4", label: "GPT-5.4", isDefault: true, provider: "codex" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "codex" },
  ];
}

export class CodexQuerySession {
  private closed = false;
  private readonly model: string;
  private readonly workspacePath: string;
  private readonly systemPrompt: string;
  private readonly reasoningEffort:
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | undefined;
  private threadId: string | null;
  private inFlight = false;
  private abortController: AbortController | null = null;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  }) {
    this.model = options.model;
    this.workspacePath = options.workspacePath;
    this.systemPrompt = options.systemPrompt ?? "";
    this.reasoningEffort = options.reasoningEffort;
    this.threadId = options.resumeSessionId ?? null;
  }

  /**
   * Write a .mcp.json to the workspace so the Codex CLI picks up the
   * NodeTool UI tools MCP server.
   */
  private async ensureMcpConfig(transport: AgentTransport | null): Promise<void> {
    let mcpUrl = getMcpToolServerUrl();

    if (!mcpUrl && transport) {
      mcpUrl = await startMcpToolServer(transport);
    } else if (mcpUrl && transport) {
      setMcpToolServerTransport(transport);
    }

    if (!mcpUrl) {
      log.warn("MCP tool server not available for Codex session");
      return;
    }

    const configPath = join(this.workspacePath, ".mcp.json");

    if (existsSync(configPath)) {
      try {
        const existing = JSON.parse(readFileSync(configPath, "utf8")) as {
          mcpServers?: { "nodetool-ui"?: { url?: string } };
        };
        if (existing?.mcpServers?.["nodetool-ui"]?.url === mcpUrl) {
          return;
        }
      } catch {
        // Corrupted file, overwrite
      }
    }

    const config = {
      mcpServers: {
        "nodetool-ui": {
          type: "http",
          url: mcpUrl,
        },
      },
    };

    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
      log.info(`Wrote Codex MCP config to ${configPath}`);
    } catch (error) {
      log.warn(
        `Failed to write .mcp.json: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private getThread(): ReturnType<Codex["startThread"]> {
    const codex = getCodex();
    const threadOptions: ThreadOptions = {
      model: this.model,
      workingDirectory: this.workspacePath,
      approvalPolicy: "never",
      sandboxMode: "workspace-write",
      ...(this.reasoningEffort && {
        modelReasoningEffort: this.reasoningEffort,
      }),
    };

    if (this.threadId) {
      log.info(`Resuming Codex thread: ${this.threadId}`);
      return codex.resumeThread(this.threadId, threadOptions);
    }

    log.info(`Starting new Codex thread (model: ${this.model})`);
    return codex.startThread(threadOptions);
  }

  private buildPrompt(message: string): string {
    if (this.systemPrompt.trim().length > 0) {
      return `System instructions:\n${this.systemPrompt}\n\nWorkspace: ${this.workspacePath}\n\n${message}`;
    }
    return message;
  }

  async send(
    message: string,
    transport: AgentTransport | null,
    sessionId: string,
    _manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error(
        "A Codex request is already in progress for this session",
      );
    }

    this.inFlight = true;
    this.abortController = new AbortController();

    try {
      await this.ensureMcpConfig(transport);
      const thread = this.getThread();
      const prompt = this.buildPrompt(message);
      const { events } = await thread.runStreamed(prompt, {
        signal: this.abortController.signal,
      });

      const outputMessages: AgentMessage[] = [];
      const itemTexts = new Map<string, string>();

      for await (const event of events) {
        if (event.type === "thread.started") {
          this.threadId = event.thread_id;
          log.info(`Codex thread started: ${this.threadId}`);
          continue;
        }

        const agentMsg = this.convertEvent(event, sessionId, itemTexts);
        if (!agentMsg) continue;

        outputMessages.push(agentMsg);
        if (onMessage) {
          onMessage(agentMsg);
        }
      }

      const doneMsg: AgentMessage = {
        type: "system",
        uuid: randomUUID(),
        session_id: this.threadId ?? sessionId,
      };
      outputMessages.push(doneMsg);
      if (onMessage) {
        onMessage(doneMsg);
      }

      return outputMessages;
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        log.info("Codex turn was interrupted");
        return [];
      }

      const errorMsg: AgentMessage = {
        type: "result",
        uuid: randomUUID(),
        session_id: this.threadId ?? sessionId,
        subtype: "error",
        is_error: true,
        errors: [error instanceof Error ? error.message : String(error)],
      };
      if (onMessage) {
        onMessage(errorMsg);
      }
      return [errorMsg];
    } finally {
      this.abortController = null;
      this.inFlight = false;
    }
  }

  private convertEvent(
    event: ThreadEvent,
    sessionId: string,
    itemTexts: Map<string, string>,
  ): AgentMessage | null {
    const resolvedSessionId = this.threadId ?? sessionId;

    switch (event.type) {
      case "item.started":
      case "item.updated":
        return this.convertItemToStreamMessage(
          event.item,
          resolvedSessionId,
          itemTexts,
        );

      case "item.completed":
        return this.convertCompletedItem(
          event.item,
          resolvedSessionId,
          itemTexts,
        );

      case "turn.failed":
        return {
          type: "result",
          uuid: randomUUID(),
          session_id: resolvedSessionId,
          subtype: "error",
          is_error: true,
          errors: [event.error.message],
        };

      default:
        return null;
    }
  }

  private convertItemToStreamMessage(
    item: ThreadItem,
    sessionId: string,
    itemTexts: Map<string, string>,
  ): AgentMessage | null {
    if (item.type === "agent_message") {
      const prev = itemTexts.get(item.id) ?? "";
      if (item.text !== prev) {
        itemTexts.set(item.id, item.text);
        return {
          type: "assistant",
          uuid: item.id,
          session_id: sessionId,
          content: [{ type: "text", text: item.text }],
        };
      }
      return null;
    }

    if (item.type === "command_execution") {
      return {
        type: "assistant",
        uuid: item.id,
        session_id: sessionId,
        content: [],
        tool_calls: [
          {
            id: item.id,
            type: "function",
            function: {
              name: "commandExecution",
              arguments: JSON.stringify({ command: item.command }),
            },
          },
        ],
      };
    }

    if (item.type === "file_change") {
      return {
        type: "assistant",
        uuid: item.id,
        session_id: sessionId,
        content: [],
        tool_calls: [
          {
            id: item.id,
            type: "function",
            function: {
              name: "fileChange",
              arguments: JSON.stringify({ changes: item.changes }),
            },
          },
        ],
      };
    }

    if (item.type === "mcp_tool_call") {
      return {
        type: "assistant",
        uuid: item.id,
        session_id: sessionId,
        content: [],
        tool_calls: [
          {
            id: item.id,
            type: "function",
            function: {
              name: item.tool,
              arguments: JSON.stringify(item.arguments ?? {}),
            },
          },
        ],
      };
    }

    if (item.type === "web_search") {
      return {
        type: "assistant",
        uuid: item.id,
        session_id: sessionId,
        content: [],
        tool_calls: [
          {
            id: item.id,
            type: "function",
            function: {
              name: "webSearch",
              arguments: JSON.stringify({ query: item.query }),
            },
          },
        ],
      };
    }

    return null;
  }

  private convertCompletedItem(
    item: ThreadItem,
    sessionId: string,
    itemTexts: Map<string, string>,
  ): AgentMessage | null {
    if (item.type === "agent_message" && item.text.trim().length > 0) {
      itemTexts.delete(item.id);
      return {
        type: "assistant",
        uuid: item.id,
        session_id: sessionId,
        content: [{ type: "text", text: item.text }],
      };
    }

    if (item.type === "error") {
      return {
        type: "result",
        uuid: item.id,
        session_id: sessionId,
        subtype: "error",
        is_error: true,
        errors: [item.message],
      };
    }

    return null;
  }

  async interrupt(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
