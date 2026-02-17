/**
 * Pi Coding Agent integration for the Electron main process.
 *
 * Spawns the `pi` CLI in RPC mode and communicates via the JSON-line protocol
 * documented at https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md
 *
 * The session implements the same AgentQuerySession interface used by Claude
 * and Codex so it can be plugged into the existing agent infrastructure.
 */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as readline from "node:readline";
import { logMessage } from "./logger";
import type {
  AgentModelDescriptor,
  AgentMessage,
  FrontendToolManifest,
} from "./types.d";
import type { WebContents } from "electron";
import { ipcMain } from "electron";
import { IpcChannels } from "./types.d";

// ============================================================================
// Helpers
// ============================================================================

const FRONTEND_TOOLS_RESPONSE_TIMEOUT_MS = 15000;

function getPiExecutablePath(): string {
  const whichCommand = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(whichCommand, ["pi"], {
    encoding: "utf8",
  });

  if (result.status === 0 && result.stdout.trim().length > 0) {
    const [firstPath] = result.stdout.trim().split(/\r?\n/);
    if (firstPath && firstPath.trim().length > 0) {
      return firstPath.trim();
    }
  }

  throw new Error(
    "Could not find pi executable. Install the pi coding agent CLI or add it to PATH.",
  );
}

async function requestRendererToolsEvent<T>(
  webContents: WebContents,
  requestChannel: string,
  responseChannel: string,
  requestPayload: Record<string, unknown>,
): Promise<T> {
  const requestId = randomUUID();

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ipcMain.removeListener(responseChannel, onResponse);
      reject(
        new Error(`Timed out waiting for renderer response on ${responseChannel}`),
      );
    }, FRONTEND_TOOLS_RESPONSE_TIMEOUT_MS);

    const onResponse = (
      responseEvent: Electron.IpcMainEvent,
      response: { requestId?: string; error?: string; manifest?: T; result?: T },
    ): void => {
      if (responseEvent.sender !== webContents) {
        return;
      }
      if (!response || response.requestId !== requestId) {
        return;
      }

      clearTimeout(timeout);
      ipcMain.removeListener(responseChannel, onResponse);

      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      if ("manifest" in response && response.manifest !== undefined) {
        resolve(response.manifest);
        return;
      }
      if ("result" in response && response.result !== undefined) {
        resolve(response.result);
        return;
      }

      reject(new Error(`Renderer response for ${responseChannel} had no payload`));
    };

    ipcMain.on(responseChannel, onResponse);
    webContents.send(requestChannel, {
      requestId,
      ...requestPayload,
    });
  });
}

async function executeFrontendTool(
  webContents: WebContents,
  sessionId: string,
  toolCallId: string,
  name: string,
  args: unknown,
): Promise<unknown> {
  const response = await requestRendererToolsEvent<{
    result: unknown;
    isError: boolean;
    error?: string;
  }>(
    webContents,
    IpcChannels.FRONTEND_TOOLS_CALL_REQUEST,
    IpcChannels.FRONTEND_TOOLS_CALL_RESPONSE,
    { sessionId, toolCallId, name, args },
  );

  if (response.isError) {
    throw new Error(response.error || "Tool execution failed");
  }

  return response.result;
}

// ============================================================================
// RPC Command / Response helpers
// ============================================================================

interface PiRpcCommand {
  id?: string;
  type: string;
  [key: string]: unknown;
}

interface PiRpcResponse {
  id?: string;
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface PiAssistantMessageEvent {
  type: string;
  contentIndex?: number;
  delta?: string;
  partial?: unknown;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface PiEvent {
  type: string;
  message?: PiAgentMessage;
  assistantMessageEvent?: PiAssistantMessageEvent;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    details?: unknown;
  };
  isError?: boolean;
  messages?: PiAgentMessage[];
  [key: string]: unknown;
}

interface PiAgentMessage {
  role: string;
  content?: string | Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown> }>;
  usage?: {
    input?: number;
    output?: number;
    cost?: { total?: number };
  };
  stopReason?: string;
  timestamp?: number;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

// ============================================================================
// PiQuerySession
// ============================================================================

export class PiQuerySession {
  private closed = false;
  private processHandle: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private readonly model: string;
  private readonly workspacePath: string;
  private readonly systemPrompt: string;
  private inFlight = false;
  private requestId = 0;
  private readonly pendingRequests = new Map<
    string,
    { resolve: (response: PiRpcResponse) => void; reject: (error: Error) => void }
  >();
  private eventListeners: Array<(event: PiEvent) => void> = [];
  private streamContext: {
    webContents: WebContents | null;
    sessionId: string;
  } | null = null;
  private interruptRequested = false;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
  }) {
    this.model = options.model;
    this.workspacePath = options.workspacePath;
    this.systemPrompt = options.systemPrompt ?? "";
  }

  private startProcessIfNeeded(): void {
    if (this.processHandle) {
      return;
    }

    const executable = getPiExecutablePath();
    const args = [
      "--mode",
      "rpc",
      "--no-session",
      "--model",
      this.model,
    ];

    logMessage(`Starting pi RPC process: ${executable} ${args.join(" ")}`);

    this.processHandle = spawn(executable, args, {
      cwd: this.workspacePath,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.rl = readline.createInterface({
      input: this.processHandle.stdout!,
      terminal: false,
    });

    this.rl.on("line", (line) => {
      this.handleLine(line);
    });

    this.processHandle.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) {
        logMessage(`Pi stderr: ${text}`, "warn");
      }
    });

    this.processHandle.on("error", (error) => {
      logMessage(`Pi process error: ${error.message}`, "error");
      this.rejectAllPending(
        error instanceof Error ? error : new Error(String(error)),
      );
    });

    this.processHandle.on("close", (code) => {
      logMessage(`Pi process exited with code ${code ?? -1}`);
      this.processHandle = null;
      this.rl = null;
      this.rejectAllPending(
        new Error(`Pi process exited with code ${code ?? -1}`),
      );
    });
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }
    logMessage(`Pi stdout: ${line}`);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    // Check if it's a response to a pending request
    if (
      data.type === "response" &&
      typeof data.id === "string" &&
      this.pendingRequests.has(data.id)
    ) {
      const pending = this.pendingRequests.get(data.id)!;
      this.pendingRequests.delete(data.id);
      pending.resolve(data as unknown as PiRpcResponse);
      return;
    }

    // Otherwise it's an event – forward to listeners
    for (const listener of this.eventListeners) {
      listener(data as unknown as PiEvent);
    }
  }

  private async sendCommand(command: Omit<PiRpcCommand, "id">): Promise<PiRpcResponse> {
    if (!this.processHandle?.stdin) {
      throw new Error("Pi RPC process is not running");
    }

    const id = `req_${++this.requestId}`;
    const fullCommand = { ...command, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for response to ${command.type}`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      const payload = JSON.stringify(fullCommand);
      logMessage(`Pi stdin: ${payload}`);
      this.processHandle!.stdin!.write(`${payload}\n`);
    });
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  async send(
    message: string,
    webContents: WebContents | null,
    sessionId: string,
    manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A Pi request is already in progress for this session");
    }

    this.inFlight = true;
    this.interruptRequested = false;
    const outputMessages: AgentMessage[] = [];
    const toolManifestMap = new Map(manifest.map((tool) => [tool.name, tool]));

    const emitMessage = (agentMessage: AgentMessage): void => {
      outputMessages.push(agentMessage);
      if (onMessage) {
        onMessage(agentMessage);
      }
    };

    try {
      this.startProcessIfNeeded();

      this.streamContext = { webContents, sessionId };

      // Accumulate text for the current assistant message
      let currentAssistantText = "";
      let currentAssistantId = randomUUID();

      // Set up event listener for streaming
      const eventPromise = new Promise<void>((resolve, reject) => {
        const listener = async (event: PiEvent): Promise<void> => {
          try {
            if (event.type === "message_update" && event.assistantMessageEvent) {
              const ame = event.assistantMessageEvent;

              if (ame.type === "text_delta" && typeof ame.delta === "string") {
                currentAssistantText += ame.delta;
                emitMessage({
                  type: "assistant",
                  uuid: currentAssistantId,
                  session_id: sessionId,
                  content: [{ type: "text", text: currentAssistantText }],
                });
              } else if (ame.type === "text_start") {
                currentAssistantText = "";
                currentAssistantId = randomUUID();
              } else if (ame.type === "toolcall_end" && ame.toolCall) {
                const tc = ame.toolCall;
                emitMessage({
                  type: "assistant",
                  uuid: randomUUID(),
                  session_id: sessionId,
                  content: [],
                  tool_calls: [
                    {
                      id: tc.id,
                      type: "function",
                      function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.arguments ?? {}),
                      },
                    },
                  ],
                });
              }
            }

            // Handle tool execution – pi calls a tool
            if (event.type === "tool_execution_start") {
              const toolCallId = event.toolCallId as string;
              const toolName = event.toolName as string;
              const args = event.args;

              // Check if this is a frontend tool we need to bridge
              if (toolManifestMap.has(toolName) && webContents) {
                try {
                  const result = await executeFrontendTool(
                    webContents,
                    sessionId,
                    toolCallId,
                    toolName,
                    args,
                  );

                  // Send the tool result back to pi via extension_ui_response
                  // Pi handles tool results internally; we just need to process the events
                  logMessage(
                    `Pi frontend tool ${toolName} executed successfully`,
                  );
                  // Note: Pi agent handles tool execution internally via its own
                  // tool system. Frontend tools are called by pi's tool_execution
                  // events which we intercept. However, pi's built-in tools
                  // (bash, read, write, etc.) are executed by pi itself.
                  // For frontend tools, we need to respond via stdin.
                  // But pi's RPC protocol doesn't have a mechanism for external
                  // tool result injection – it uses its own internal tools.
                  // So we emit the tool call for display purposes only.
                  void result;
                } catch (error) {
                  logMessage(
                    `Pi frontend tool ${toolName} failed: ${error}`,
                    "warn",
                  );
                }
              }
            }

            if (event.type === "agent_end") {
              // Remove listener and resolve
              const idx = this.eventListeners.indexOf(listener);
              if (idx !== -1) {
                this.eventListeners.splice(idx, 1);
              }
              resolve();
            }
          } catch (error) {
            logMessage(`Error handling pi event: ${error}`, "error");
          }
        };

        this.eventListeners.push(listener);

        // Set a long timeout for the whole operation
        setTimeout(() => {
          const idx = this.eventListeners.indexOf(listener);
          if (idx !== -1) {
            this.eventListeners.splice(idx, 1);
          }
          reject(new Error("Pi agent timed out waiting for agent_end"));
        }, 300000); // 5 minutes
      });

      // Send the prompt
      const response = await this.sendCommand({
        type: "prompt",
        message,
      });

      if (!response.success) {
        throw new Error(
          (response as { error?: string }).error ?? "Failed to send prompt to pi",
        );
      }

      // Wait for agent_end
      await eventPromise;

      return outputMessages;
    } finally {
      this.streamContext = null;
      this.inFlight = false;
    }
  }

  async interrupt(): Promise<void> {
    if (!this.inFlight) {
      return;
    }

    this.interruptRequested = true;
    logMessage("Interrupting Pi execution");

    try {
      await this.sendCommand({ type: "abort" });
    } catch (error) {
      logMessage(`Failed to abort pi: ${error}`, "warn");
      if (this.processHandle && !this.processHandle.killed) {
        this.processHandle.kill("SIGINT");
      }
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.rejectAllPending(new Error("Pi session closed"));

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.processHandle && !this.processHandle.killed) {
      this.processHandle.kill("SIGTERM");
    }
    this.processHandle = null;
  }
}

// ============================================================================
// Model listing
// ============================================================================

const DEFAULT_PI_MODELS: AgentModelDescriptor[] = [
  {
    id: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    isDefault: true,
  },
  {
    id: "claude-3-7-sonnet-20250219",
    label: "Claude 3.7 Sonnet",
  },
  {
    id: "claude-3-5-sonnet-20241022",
    label: "Claude 3.5 Sonnet",
  },
];

export async function listPiModels(
  workspacePath: string,
): Promise<AgentModelDescriptor[]> {
  let executable: string;
  try {
    executable = getPiExecutablePath();
  } catch {
    return DEFAULT_PI_MODELS;
  }

  const processHandle = spawn(executable, ["--mode", "rpc", "--no-session"], {
    cwd: workspacePath,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let requestId = 0;

  const sendAndWait = (command: Record<string, unknown>): Promise<PiRpcResponse> => {
    const id = `req_${++requestId}`;
    const fullCommand = { ...command, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for pi response"));
      }, 10000);

      const onLine = (line: string): void => {
        if (!line.trim()) {
          return;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }

        if (parsed.type === "response" && parsed.id === id) {
          clearTimeout(timeout);
          rl.removeListener("line", onLine);
          resolve(parsed as unknown as PiRpcResponse);
        }
      };

      rl.on("line", onLine);
      processHandle.stdin.write(`${JSON.stringify(fullCommand)}\n`);
    });
  };

  const rl = readline.createInterface({
    input: processHandle.stdout!,
    terminal: false,
  });

  try {
    // Wait a moment for process to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (processHandle.exitCode !== null) {
      return DEFAULT_PI_MODELS;
    }

    const response = await sendAndWait({ type: "get_available_models" });

    if (!response.success || !response.data) {
      return DEFAULT_PI_MODELS;
    }

    const data = response.data as { models?: Array<Record<string, unknown>> };
    if (!Array.isArray(data.models)) {
      return DEFAULT_PI_MODELS;
    }

    const models: AgentModelDescriptor[] = [];
    for (const model of data.models) {
      const id =
        typeof model.id === "string" ? model.id : null;
      if (!id) {
        continue;
      }
      const name =
        typeof model.name === "string" ? model.name : id;

      models.push({
        id,
        label: name,
        isDefault: models.length === 0,
      });
    }

    return models.length > 0 ? models : DEFAULT_PI_MODELS;
  } catch (error) {
    logMessage(`Failed to list Pi models: ${error}`, "warn");
    return DEFAULT_PI_MODELS;
  } finally {
    rl.close();
    if (!processHandle.killed) {
      processHandle.kill();
    }
  }
}
