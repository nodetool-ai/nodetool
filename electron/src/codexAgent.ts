import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { logMessage } from "./logger";
import type { AgentModelDescriptor, ClaudeAgentMessage, FrontendToolManifest } from "./types.d";
import type { WebContents } from "electron";
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
  messageId: string | null;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

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
  private resolvedThreadId: string | null;
  private processHandle: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  private inFlight = false;
  private initialized = false;
  private threadReady = false;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly turnTrackers = new Map<string, TurnTracker>();
  private streamContext: {
    webContents: WebContents | null;
    sessionId: string;
  } | null = null;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
  }) {
    this.model = options.model;
    this.workspacePath = options.workspacePath;
    this.resolvedThreadId = options.resumeSessionId ?? null;
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
      if (!turnId || !delta) {
        return;
      }
      const tracker = this.turnTrackers.get(turnId);
      if (tracker) {
        tracker.text += delta;
        const itemId = asString(params.itemId);
        if (itemId) {
          tracker.messageId = itemId;
        }
        if (this.streamContext?.webContents) {
          this.streamContext.webContents.send(IpcChannels.CLAUDE_AGENT_STREAM_MESSAGE, {
            sessionId: this.streamContext.sessionId,
            message: {
              type: "assistant",
              uuid: tracker.messageId ?? randomUUID(),
              session_id: this.resolvedThreadId ?? this.streamContext.sessionId,
              content: [{ type: "text", text: tracker.text }],
            } satisfies ClaudeAgentMessage,
            done: false,
          });
        }
      }
      return;
    }

    if (method === "item/completed" && isRecord(params) && isRecord(params.item)) {
      const turnId = asString(params.turnId);
      const itemType = asString(params.item.type);
      const itemText = asString(params.item.text);
      if (!turnId || itemType !== "agentMessage" || !itemText) {
        return;
      }

      const tracker = this.turnTrackers.get(turnId);
      if (!tracker) {
        return;
      }

      if (!tracker.text.trim()) {
        tracker.text = itemText;
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

      if (status === "completed") {
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
    const args = ["app-server"];
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
    });
    this.initialized = true;
  }

  private async ensureThread(): Promise<void> {
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

    const startResult = await this.request("thread/start", {
      model: this.model,
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
        reject(new Error(`Codex turn timed out: ${turnId}`));
      }, timeoutMs);

      this.turnTrackers.set(turnId, {
        text: "",
        messageId: null,
        resolve,
        reject,
        timeout,
      });
    });
  }

  async send(
    message: string,
    _webContents: WebContents | null,
    sessionId: string,
    _manifest: FrontendToolManifest[],
  ): Promise<ClaudeAgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A Codex request is already in progress for this session");
    }

    this.inFlight = true;

    try {
      this.streamContext = {
        webContents: _webContents,
        sessionId,
      };
      this.startProcessIfNeeded();
      await this.ensureInitialized();
      await this.ensureThread();

      const prompt = `Workspace: ${this.workspacePath}\n\n${message}`;
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

      const assistantText = await this.waitForTurnCompletion(turnId);
      const messages: ClaudeAgentMessage[] = [];
      // Return a lightweight marker to let caller update canonical session alias.
      messages.push({
        type: "system",
        uuid: randomUUID(),
        session_id: this.resolvedThreadId ?? sessionId,
        ...(assistantText.length > 0 ? { text: assistantText } : {}),
      });

      return messages;
    } finally {
      this.streamContext = null;
      this.inFlight = false;
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

    if (this.processHandle && !this.processHandle.killed) {
      this.processHandle.kill();
    }
    this.processHandle = null;
  }
}
