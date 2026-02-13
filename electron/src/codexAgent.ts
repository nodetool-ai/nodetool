import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { logMessage } from "./logger";
import type { AgentModelDescriptor, AgentMessage, FrontendToolManifest } from "./types.d";
import type { WebContents } from "electron";
import { ipcMain } from "electron";
import { IpcChannels } from "./types.d";

interface RpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcResponse {
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface RpcNotification {
  method: string;
  params?: Record<string, unknown>;
}

interface RpcServerRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface TurnTracker {
  text: string;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface AgentMessageStreamState {
  turnId: string;
  text: string;
}

const FRONTEND_TOOLS_RESPONSE_TIMEOUT_MS = 15000;

function getCodexExecutablePath(): string {
  const whichCommand = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(whichCommand, ["codex"], {
    encoding: "utf8",
  });

  if (result.status === 0 && result.stdout.trim().length > 0) {
    const [firstPath] = result.stdout.trim().split(/\r?\n/);
    if (firstPath && firstPath.trim().length > 0) {
      return firstPath.trim();
    }
  }

  throw new Error("Could not find Codex executable. Install Codex CLI or add it to PATH.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asRpcResponse(value: Record<string, unknown>): RpcResponse | null {
  if (typeof value.id !== "number") {
    return null;
  }
  return {
    id: value.id,
    result: value.result,
    error:
      isRecord(value.error) &&
      typeof value.error.code === "number" &&
      typeof value.error.message === "string"
        ? {
            code: value.error.code,
            message: value.error.message,
          }
        : undefined,
  };
}

function asRpcServerRequest(
  value: Record<string, unknown>,
): RpcServerRequest | null {
  if (typeof value.id !== "number" || typeof value.method !== "string") {
    return null;
  }
  return {
    id: value.id,
    method: value.method,
    params: isRecord(value.params) ? value.params : undefined,
  };
}

function asRpcNotification(value: Record<string, unknown>): RpcNotification | null {
  if (typeof value.method !== "string") {
    return null;
  }
  return {
    method: value.method,
    params: isRecord(value.params) ? value.params : undefined,
  };
}

function toJsonString(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function normalizeDynamicToolSchema(schema: unknown): Record<string, unknown> {
  const fallback: Record<string, unknown> = {
    type: "object",
    properties: {},
    additionalProperties: true,
  };

  let candidate: unknown = schema;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return fallback;
    }
  }

  if (!isRecord(candidate)) {
    return fallback;
  }

  const type = candidate.type;
  if (type === undefined) {
    return {
      ...candidate,
      type: "object",
    };
  }

  if (type === "object") {
    return candidate;
  }

  // Codex/OpenAI tool schemas must have object root.
  return fallback;
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

export async function listCodexModels(
  workspacePath: string,
): Promise<AgentModelDescriptor[]> {
  const executable = getCodexExecutablePath();
  const processHandle = spawn(executable, ["app-server"], {
    cwd: workspacePath,
    env: process.env,
    stdio: "pipe",
  });

  let stdoutBuffer = "";
  let nextId = 1;

  const request = (method: string, params: Record<string, unknown>): Promise<unknown> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Codex request timed out: ${method}`));
      }, 30000);

      const onData = (chunk: Buffer): void => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }
          if (!isRecord(parsed)) {
            continue;
          }
          if (parsed.id !== id) {
            continue;
          }
          processHandle.stdout.removeListener("data", onData);
          clearTimeout(timeout);
          if (isRecord(parsed.error) && typeof parsed.error.message === "string") {
            reject(new Error(parsed.error.message));
            return;
          }
          resolve(parsed.result);
          return;
        }
      };

      processHandle.stdout.on("data", onData);
      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      processHandle.stdin.write(`${payload}\n`);
    });
  };

  try {
    await request("initialize", {
      clientInfo: {
        name: "nodetool",
        version: "0.0.0",
      },
    });
    const result = await request("model/list", {});
    if (!isRecord(result) || !Array.isArray(result.data)) {
      return [];
    }

    const models: AgentModelDescriptor[] = [];
    for (const item of result.data) {
      if (!isRecord(item)) {
        continue;
      }
      const id = asString(item.id) ?? asString(item.model);
      if (!id) {
        continue;
      }
      models.push({
        id,
        label: asString(item.displayName) ?? id,
        isDefault: item.isDefault === true,
      });
    }
    return models;
  } finally {
    if (!processHandle.killed) {
      processHandle.kill();
    }
  }
}

export class CodexQuerySession {
  private closed = false;
  private readonly model: string;
  private readonly workspacePath: string;
  private readonly systemPrompt: string;
  private resolvedThreadId: string | null;
  private processHandle: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  private inFlight = false;
  private initialized = false;
  private threadReady = false;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly turnTrackers = new Map<string, TurnTracker>();
  private readonly agentMessageStreams = new Map<string, AgentMessageStreamState>();
  private currentTurnId: string | null = null;
  private readonly appServerConfigArgs: string[];
  private streamContext: {
    webContents: WebContents | null;
    sessionId: string;
  } | null = null;

  private emitAssistantToolCall(
    toolCallId: string,
    toolName: string,
    args: unknown,
  ): void {
    if (!this.streamContext?.webContents) {
      return;
    }
    this.streamContext.webContents.send(IpcChannels.AGENT_STREAM_MESSAGE, {
      sessionId: this.streamContext.sessionId,
      message: {
        type: "assistant",
        uuid: toolCallId,
        session_id: this.resolvedThreadId ?? this.streamContext.sessionId,
        content: [],
        tool_calls: [
          {
            id: toolCallId,
            type: "function",
            function: {
              name: toolName,
              arguments: toJsonString(args),
            },
          },
        ],
      } satisfies AgentMessage,
      done: false,
    });
  }

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    appServerConfigArgs?: string[];
  }) {
    this.model = options.model;
    this.workspacePath = options.workspacePath;
    this.systemPrompt = options.systemPrompt ?? "";
    this.resolvedThreadId = options.resumeSessionId ?? null;
    this.appServerConfigArgs = options.appServerConfigArgs ?? [];
  }

  private writeRpc(message: RpcRequest | Record<string, unknown>): void {
    if (!this.processHandle) {
      throw new Error("Codex app-server is not running");
    }
    const payload = JSON.stringify(message);
    logMessage(`Codex stdin: ${payload}`);
    this.processHandle.stdin.write(`${payload}\n`);
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 30000,
  ): Promise<unknown> {
    const id = this.nextRequestId++;

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        method,
        resolve,
        reject,
        timeout,
      });

      this.writeRpc({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });
    });
  }

  private async handleServerRequest(request: RpcServerRequest): Promise<void> {
    const responseBase = {
      jsonrpc: "2.0",
      id: request.id,
    };

    if (
      request.method === "item/commandExecution/requestApproval" ||
      request.method === "item/fileChange/requestApproval"
    ) {
      this.writeRpc({ ...responseBase, result: { decision: "accept" } });
      return;
    }

    if (request.method === "item/tool/requestUserInput") {
      const answers: Record<string, { answers: string[] }> = {};
      const questions = isRecord(request.params)
        ? request.params.questions
        : undefined;
      if (Array.isArray(questions)) {
        for (const question of questions) {
          if (!isRecord(question)) {
            continue;
          }
          const questionId = asString(question.id);
          if (!questionId) {
            continue;
          }

          let selectedAnswer = "";
          const options = question.options;
          if (Array.isArray(options) && options.length > 0) {
            const firstOption = options[0];
            if (typeof firstOption === "string") {
              selectedAnswer = firstOption;
            } else if (isRecord(firstOption)) {
              selectedAnswer =
                asString(firstOption.value) ?? asString(firstOption.label) ?? "";
            }
          }
          answers[questionId] = { answers: [selectedAnswer] };
        }
      }

      this.writeRpc({ ...responseBase, result: { answers } });
      return;
    }

    if (request.method === "item/tool/call") {
      const params = request.params;
      const toolCallId = isRecord(params) ? asString(params.callId) : null;
      const toolName = isRecord(params) ? asString(params.tool) : null;
      const args = isRecord(params) ? params.arguments : undefined;
      const context = this.streamContext;

      if (!toolCallId || !toolName) {
        this.writeRpc({
          ...responseBase,
          result: {
            contentItems: [{ type: "inputText", text: "Invalid dynamic tool request" }],
            success: false,
          },
        });
        return;
      }

      this.emitAssistantToolCall(toolCallId, toolName, args);

      if (!context?.webContents) {
        this.writeRpc({
          ...responseBase,
          result: {
            contentItems: [
              {
                type: "inputText",
                text: `Tool ${toolName} unavailable: no renderer context`,
              },
            ],
            success: false,
          },
        });
        return;
      }

      try {
        const result = await executeFrontendTool(
          context.webContents,
          context.sessionId,
          toolCallId,
          toolName,
          args,
        );
        const text =
          typeof result === "string" ? result : JSON.stringify(result ?? null);
        this.writeRpc({
          ...responseBase,
          result: {
            contentItems: [{ type: "inputText", text }],
            success: true,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.writeRpc({
          ...responseBase,
          result: {
            contentItems: [{ type: "inputText", text: `Tool ${toolName} failed: ${message}` }],
            success: false,
          },
        });
      }
      return;
    }

    this.writeRpc({ ...responseBase, result: {} });
  }

  private handleNotification(notification: RpcNotification): void {
    const { method, params } = notification;

    if (method === "thread/started" && isRecord(params) && isRecord(params.thread)) {
      const threadId = asString(params.thread.id);
      if (threadId) {
        this.resolvedThreadId = threadId;
        this.threadReady = true;
      }
      return;
    }

    if (method === "item/agentMessage/delta" && isRecord(params)) {
      const turnId = asString(params.turnId);
      const delta = asString(params.delta);
      const itemId = asString(params.itemId);
      if (!turnId || !delta || !itemId) {
        return;
      }
      const tracker = this.turnTrackers.get(turnId);
      if (tracker) {
        const stream =
          this.agentMessageStreams.get(itemId) ?? {
            turnId,
            text: "",
          };
        stream.text += delta;
        this.agentMessageStreams.set(itemId, stream);
        if (this.streamContext?.webContents) {
          this.streamContext.webContents.send(IpcChannels.AGENT_STREAM_MESSAGE, {
            sessionId: this.streamContext.sessionId,
            message: {
              type: "assistant",
              uuid: itemId,
              session_id: this.resolvedThreadId ?? this.streamContext.sessionId,
              content: [{ type: "text", text: stream.text }],
            } satisfies AgentMessage,
            done: false,
          });
        }
      }
      return;
    }

    if (method === "item/started" && isRecord(params) && isRecord(params.item)) {
      const itemType = asString(params.item.type);
      const itemId = asString(params.item.id);
      if (!itemType || !itemId) {
        return;
      }

      if (itemType === "agentMessage") {
        const turnId = asString(params.turnId);
        if (turnId) {
          this.agentMessageStreams.set(itemId, { turnId, text: "" });
        }
        return;
      }

      if (itemType === "commandExecution") {
        this.emitAssistantToolCall(itemId, "commandExecution", {
          command: params.item.command,
          cwd: params.item.cwd,
        });
      } else if (itemType === "mcpToolCall") {
        const toolName =
          asString(params.item.toolName) ??
          asString(params.item.name) ??
          "mcpToolCall";
        this.emitAssistantToolCall(itemId, toolName, {
          server: params.item.server,
          arguments: params.item.arguments,
        });
      } else if (itemType === "webSearch") {
        this.emitAssistantToolCall(itemId, "webSearch", {
          query: params.item.query,
        });
      } else if (itemType === "fileChange") {
        this.emitAssistantToolCall(itemId, "fileChange", {
          changes: params.item.changes,
          summary: params.item.summary,
        });
      } else if (itemType === "collabAgentToolCall") {
        const toolName =
          asString(params.item.toolName) ??
          asString(params.item.name) ??
          "collabAgentToolCall";
        this.emitAssistantToolCall(itemId, toolName, {
          arguments: params.item.arguments,
          result: params.item.result,
        });
      }
      return;
    }

    if (method === "item/completed" && isRecord(params) && isRecord(params.item)) {
      const turnId = asString(params.turnId);
      const itemType = asString(params.item.type);
      const itemText = asString(params.item.text);
      const itemId = asString(params.item.id);
      if (!turnId || itemType !== "agentMessage") {
        return;
      }

      const tracker = this.turnTrackers.get(turnId);
      if (!tracker) {
        return;
      }

      const completedText = itemText ?? "";
      if (itemId) {
        const stream = this.agentMessageStreams.get(itemId);
        const streamText = stream?.text.trim() ?? "";
        if (!streamText && completedText.trim().length > 0 && this.streamContext?.webContents) {
          this.streamContext.webContents.send(IpcChannels.AGENT_STREAM_MESSAGE, {
            sessionId: this.streamContext.sessionId,
            message: {
              type: "assistant",
              uuid: itemId,
              session_id: this.resolvedThreadId ?? this.streamContext.sessionId,
              content: [{ type: "text", text: completedText }],
            } satisfies AgentMessage,
            done: false,
          });
        }
        this.agentMessageStreams.delete(itemId);
      }

      if (completedText.trim().length > 0) {
        // Resolve turn with the last completed assistant message in this turn.
        tracker.text = completedText;
      }
      return;
    }

    if (method === "turn/completed" && isRecord(params) && isRecord(params.turn)) {
      const turnId = asString(params.turn.id);
      const status = asString(params.turn.status);
      if (!turnId || !status) {
        return;
      }

      const tracker = this.turnTrackers.get(turnId);
      if (!tracker) {
        return;
      }

      this.turnTrackers.delete(turnId);
      clearTimeout(tracker.timeout);
      for (const [itemId, stream] of this.agentMessageStreams.entries()) {
        if (stream.turnId === turnId) {
          this.agentMessageStreams.delete(itemId);
        }
      }
      if (this.currentTurnId === turnId) {
        this.currentTurnId = null;
      }

      if (status === "completed" || status === "interrupted" || status === "cancelled") {
        tracker.resolve(tracker.text.trim());
        return;
      }

      const errorMessage = isRecord(params.turn.error)
        ? asString(params.turn.error.message)
        : null;
      tracker.reject(new Error(errorMessage ?? `Codex turn failed: ${status}`));
      return;
    }

    if (method === "error") {
      logMessage(`Codex notification error: ${JSON.stringify(params)}`, "warn");
    }
  }

  private handleRpcLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    logMessage(`Codex stdout: ${line}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    if (!isRecord(parsed)) {
      return;
    }

    const hasId = typeof parsed.id === "number";
    const hasMethod = typeof parsed.method === "string";

    if (hasId && ("result" in parsed || "error" in parsed) && !hasMethod) {
      const response = asRpcResponse(parsed);
      if (!response) {
        return;
      }
      const pending = this.pendingRequests.get(response.id);
      if (!pending) {
        return;
      }
      this.pendingRequests.delete(response.id);
      clearTimeout(pending.timeout);

      if (response.error) {
        pending.reject(new Error(response.error.message));
      } else {
        pending.resolve(response.result);
      }
      return;
    }

    if (hasMethod && hasId) {
      const request = asRpcServerRequest(parsed);
      if (!request) {
        return;
      }
      void this
        .handleServerRequest(request)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.writeRpc({
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32000, message },
          });
        });
      return;
    }

    if (hasMethod && !hasId) {
      const notification = asRpcNotification(parsed);
      if (notification) {
        this.handleNotification(notification);
      }
    }
  }

  private startProcessIfNeeded(): void {
    if (this.processHandle) {
      return;
    }

    const executable = getCodexExecutablePath();
    const args = ["app-server", ...this.appServerConfigArgs];
    logMessage(`Starting Codex app-server process: ${executable} ${args.join(" ")}`);

    this.processHandle = spawn(executable, args, {
      cwd: this.workspacePath,
      env: process.env,
      stdio: "pipe",
    });

    this.processHandle.stdout.on("data", (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString("utf8");
      const lines = this.stdoutBuffer.split(/\r?\n/);
      this.stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        this.handleRpcLine(line);
      }
    });

    this.processHandle.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) {
        logMessage(`Codex stderr: ${text}`, "warn");
      }
    });

    this.processHandle.on("error", (error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.rejectAllPending(err);
    });

    this.processHandle.on("close", (code) => {
      if (this.stdoutBuffer.trim().length > 0) {
        this.handleRpcLine(this.stdoutBuffer.trim());
      }
      this.stdoutBuffer = "";
      this.processHandle = null;
      this.initialized = false;
      this.threadReady = false;

      const err = new Error(`Codex app-server process exited with code ${code ?? -1}`);
      this.rejectAllPending(err);
    });
  }

  private rejectAllPending(error: Error): void {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${pending.method}: ${error.message}`));
      this.pendingRequests.delete(requestId);
    }

    for (const [turnId, tracker] of this.turnTrackers.entries()) {
      clearTimeout(tracker.timeout);
      tracker.reject(error);
      this.turnTrackers.delete(turnId);
    }
    this.agentMessageStreams.clear();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.request("initialize", {
      clientInfo: {
        name: "nodetool",
        version: "0.0.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    this.initialized = true;
  }

  private async ensureThread(manifest: FrontendToolManifest[]): Promise<void> {
    if (this.threadReady && this.resolvedThreadId) {
      return;
    }

    if (this.resolvedThreadId) {
      try {
        const resumeResult = await this.request("thread/resume", {
          threadId: this.resolvedThreadId,
        });

        if (isRecord(resumeResult) && isRecord(resumeResult.thread)) {
          const resumedId = asString(resumeResult.thread.id);
          if (resumedId) {
            this.resolvedThreadId = resumedId;
            this.threadReady = true;
            return;
          }
        }
      } catch (error) {
        logMessage(
          `Codex thread resume failed, falling back to thread/start: ${error}`,
          "warn",
        );
      }
    }

    const dynamicTools = manifest.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: normalizeDynamicToolSchema(tool.parameters),
    }));
    const startResult = await this.request("thread/start", {
      model: this.model,
      dynamicTools,
    });
    if (isRecord(startResult) && isRecord(startResult.thread)) {
      const threadId = asString(startResult.thread.id);
      if (threadId) {
        this.resolvedThreadId = threadId;
        this.threadReady = true;
      }
    }

    if (!this.resolvedThreadId) {
      throw new Error("Codex thread/start did not return a thread id");
    }
  }

  private waitForTurnCompletion(turnId: string, timeoutMs = 300000): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.turnTrackers.delete(turnId);
        for (const [itemId, stream] of this.agentMessageStreams.entries()) {
          if (stream.turnId === turnId) {
            this.agentMessageStreams.delete(itemId);
          }
        }
        reject(new Error(`Codex turn timed out: ${turnId}`));
      }, timeoutMs);

      this.turnTrackers.set(turnId, {
        text: "",
        resolve,
        reject,
        timeout,
      });
    });
  }

  private buildPrompt(message: string): string {
    const promptParts: string[] = [];
    if (this.systemPrompt.trim().length > 0) {
      promptParts.push(`System instructions:\n${this.systemPrompt}`);
    }
    promptParts.push(`Workspace: ${this.workspacePath}\n\n${message}`);
    return promptParts.join("\n\n");
  }

  private async runTurn(prompt: string): Promise<string> {
    const turnStart = await this.request("turn/start", {
      threadId: this.resolvedThreadId,
      input: [{ type: "text", text: prompt }],
    });

    const turnId =
      isRecord(turnStart) && isRecord(turnStart.turn)
        ? asString(turnStart.turn.id)
        : null;

    if (!turnId) {
      throw new Error("Codex turn/start did not return a turn id");
    }
    this.currentTurnId = turnId;
    return this.waitForTurnCompletion(turnId);
  }

  async send(
    message: string,
    webContents: WebContents | null,
    sessionId: string,
    manifest: FrontendToolManifest[],
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A Codex request is already in progress for this session");
    }

    this.inFlight = true;

    try {
      this.streamContext = {
        webContents,
        sessionId,
      };
      this.startProcessIfNeeded();
      await this.ensureInitialized();
      await this.ensureThread(manifest);
      const prompt = this.buildPrompt(message);

      let assistantText: string;
      try {
        assistantText = await this.runTurn(prompt);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        const isToolSchemaError =
          messageText.includes("invalid_function_parameters") ||
          messageText.includes("Invalid schema for function");

        if (!isToolSchemaError) {
          throw error;
        }

        logMessage(
          "Codex thread has invalid dynamic tool schema; restarting thread and retrying turn",
          "warn",
        );
        this.threadReady = false;
        this.resolvedThreadId = null;
        await this.ensureThread(manifest);
        assistantText = await this.runTurn(prompt);
      }
      const messages: AgentMessage[] = [];
      // Return a lightweight marker to let caller update canonical session alias.
      messages.push({
        type: "system",
        uuid: randomUUID(),
        session_id: this.resolvedThreadId ?? sessionId,
        ...(assistantText.length > 0 ? { text: assistantText } : {}),
      });

      return messages;
    } finally {
      this.currentTurnId = null;
      this.streamContext = null;
      this.inFlight = false;
    }
  }

  async interrupt(): Promise<void> {
    if (!this.inFlight || !this.resolvedThreadId || !this.currentTurnId) {
      return;
    }

    logMessage(
      `Interrupting Codex turn ${this.currentTurnId} on thread ${this.resolvedThreadId}`,
    );
    try {
      await this.request(
        "turn/interrupt",
        {
          threadId: this.resolvedThreadId,
          turnId: this.currentTurnId,
        },
        10000,
      );
    } catch (error) {
      logMessage(`Failed to interrupt Codex turn: ${error}`, "warn");
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

    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Codex session closed"));
    }
    this.pendingRequests.clear();

    for (const tracker of this.turnTrackers.values()) {
      clearTimeout(tracker.timeout);
      tracker.reject(new Error("Codex session closed"));
    }
    this.turnTrackers.clear();
    this.agentMessageStreams.clear();

    if (this.processHandle && !this.processHandle.killed) {
      this.processHandle.kill();
    }
    this.processHandle = null;
  }
}
