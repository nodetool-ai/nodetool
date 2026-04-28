/**
 * ToolClient — typed HTTP client for the in-container tool server.
 *
 * Each method corresponds to a Fastify route on the sandbox-agent server.
 * Requests are validated on both sides against the shared Zod schemas in
 * @nodetool/sandbox/schemas.
 *
 * The client has no session state; a fresh client can be created against
 * an existing sandbox endpoint URL.
 */

import type { z } from "zod";
import {
  FileReadInput,
  FileReadOutput,
  FileWriteInput,
  FileWriteOutput,
  FileStrReplaceInput,
  FileStrReplaceOutput,
  FileFindInContentInput,
  FileFindInContentOutput,
  FileFindByNameInput,
  FileFindByNameOutput,
  ShellExecInput,
  ShellExecOutput,
  ShellViewInput,
  ShellViewOutput,
  ShellWaitInput,
  ShellWaitOutput,
  ShellWriteToProcessInput,
  ShellWriteToProcessOutput,
  ShellKillProcessInput,
  ShellKillProcessOutput,
  BrowserViewInput,
  BrowserViewOutput,
  BrowserNavigateInput,
  BrowserNavigateOutput,
  BrowserRestartInput,
  BrowserRestartOutput,
  BrowserClickInput,
  BrowserClickOutput,
  BrowserInputTextInput,
  BrowserInputTextOutput,
  BrowserMoveMouseInput,
  BrowserMoveMouseOutput,
  BrowserPressKeyInput,
  BrowserPressKeyOutput,
  BrowserSelectOptionInput,
  BrowserSelectOptionOutput,
  BrowserScrollInput,
  BrowserScrollOutput,
  BrowserConsoleExecInput,
  BrowserConsoleExecOutput,
  BrowserConsoleViewInput,
  BrowserConsoleViewOutput,
  ScreenCaptureInput,
  ScreenCaptureOutput,
  ScreenFindInput,
  ScreenFindOutput,
  MouseMoveInput,
  MouseMoveOutput,
  MouseClickInput,
  MouseClickOutput,
  MouseDragInput,
  MouseDragOutput,
  MouseScrollInput,
  MouseScrollOutput,
  KeyPressInput,
  KeyPressOutput,
  KeyTypeInput,
  KeyTypeOutput,
  CursorPositionOutput,
  InfoSearchWebInput,
  InfoSearchWebOutput,
  MessageNotifyUserInput,
  MessageNotifyUserOutput,
  MessageAskUserInput,
  MessageAskUserOutput,
  IdleInput,
  IdleOutput,
  ExposePortInput,
  ExposePortOutput,
  SandboxEvent,
  HealthOutput
} from "./schemas/index.js";

export class ToolInvocationError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "ToolInvocationError";
    this.status = status;
    this.body = body;
  }
}

export interface ToolClientOptions {
  /** Base URL of the in-container tool server, e.g. http://127.0.0.1:32768 */
  baseUrl: string;
  /** Fetch implementation; defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default: 60_000. */
  timeoutMs?: number;
}

export class ToolClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ToolClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  // --- Health ------------------------------------------------------------

  async health(): Promise<HealthOutput> {
    return this.get("/health", HealthOutput);
  }

  // --- File tools --------------------------------------------------------

  async fileRead(input: FileReadInput): Promise<FileReadOutput> {
    return this.post("/file/read", input, FileReadInput, FileReadOutput);
  }

  async fileWrite(input: FileWriteInput): Promise<FileWriteOutput> {
    return this.post("/file/write", input, FileWriteInput, FileWriteOutput);
  }

  async fileStrReplace(
    input: FileStrReplaceInput
  ): Promise<FileStrReplaceOutput> {
    return this.post(
      "/file/str-replace",
      input,
      FileStrReplaceInput,
      FileStrReplaceOutput
    );
  }

  async fileFindInContent(
    input: FileFindInContentInput
  ): Promise<FileFindInContentOutput> {
    return this.post(
      "/file/find-in-content",
      input,
      FileFindInContentInput,
      FileFindInContentOutput
    );
  }

  async fileFindByName(
    input: FileFindByNameInput
  ): Promise<FileFindByNameOutput> {
    return this.post(
      "/file/find-by-name",
      input,
      FileFindByNameInput,
      FileFindByNameOutput
    );
  }

  // --- Shell tools -------------------------------------------------------

  async shellExec(input: ShellExecInput): Promise<ShellExecOutput> {
    return this.post("/shell/exec", input, ShellExecInput, ShellExecOutput);
  }

  async shellView(input: ShellViewInput): Promise<ShellViewOutput> {
    return this.post("/shell/view", input, ShellViewInput, ShellViewOutput);
  }

  async shellWait(input: ShellWaitInput): Promise<ShellWaitOutput> {
    return this.post("/shell/wait", input, ShellWaitInput, ShellWaitOutput);
  }

  async shellWriteToProcess(
    input: ShellWriteToProcessInput
  ): Promise<ShellWriteToProcessOutput> {
    return this.post(
      "/shell/write",
      input,
      ShellWriteToProcessInput,
      ShellWriteToProcessOutput
    );
  }

  async shellKillProcess(
    input: ShellKillProcessInput
  ): Promise<ShellKillProcessOutput> {
    return this.post(
      "/shell/kill",
      input,
      ShellKillProcessInput,
      ShellKillProcessOutput
    );
  }

  // --- Browser tools -----------------------------------------------------

  async browserView(input: BrowserViewInput = {}): Promise<BrowserViewOutput> {
    return this.post("/browser/view", input, BrowserViewInput, BrowserViewOutput);
  }

  async browserNavigate(
    input: BrowserNavigateInput
  ): Promise<BrowserNavigateOutput> {
    return this.post(
      "/browser/navigate",
      input,
      BrowserNavigateInput,
      BrowserNavigateOutput
    );
  }

  async browserRestart(
    input: BrowserRestartInput = {}
  ): Promise<BrowserRestartOutput> {
    return this.post(
      "/browser/restart",
      input,
      BrowserRestartInput,
      BrowserRestartOutput
    );
  }

  async browserClick(input: BrowserClickInput): Promise<BrowserClickOutput> {
    return this.post(
      "/browser/click",
      input,
      BrowserClickInput,
      BrowserClickOutput
    );
  }

  async browserInput(
    input: BrowserInputTextInput
  ): Promise<BrowserInputTextOutput> {
    return this.post(
      "/browser/input",
      input,
      BrowserInputTextInput,
      BrowserInputTextOutput
    );
  }

  async browserMoveMouse(
    input: BrowserMoveMouseInput
  ): Promise<BrowserMoveMouseOutput> {
    return this.post(
      "/browser/move-mouse",
      input,
      BrowserMoveMouseInput,
      BrowserMoveMouseOutput
    );
  }

  async browserPressKey(
    input: BrowserPressKeyInput
  ): Promise<BrowserPressKeyOutput> {
    return this.post(
      "/browser/press-key",
      input,
      BrowserPressKeyInput,
      BrowserPressKeyOutput
    );
  }

  async browserSelectOption(
    input: BrowserSelectOptionInput
  ): Promise<BrowserSelectOptionOutput> {
    return this.post(
      "/browser/select-option",
      input,
      BrowserSelectOptionInput,
      BrowserSelectOptionOutput
    );
  }

  async browserScroll(input: BrowserScrollInput): Promise<BrowserScrollOutput> {
    return this.post(
      "/browser/scroll",
      input,
      BrowserScrollInput,
      BrowserScrollOutput
    );
  }

  async browserConsoleExec(
    input: BrowserConsoleExecInput
  ): Promise<BrowserConsoleExecOutput> {
    return this.post(
      "/browser/console-exec",
      input,
      BrowserConsoleExecInput,
      BrowserConsoleExecOutput
    );
  }

  async browserConsoleView(
    input: BrowserConsoleViewInput = {}
  ): Promise<BrowserConsoleViewOutput> {
    return this.post(
      "/browser/console-view",
      input,
      BrowserConsoleViewInput,
      BrowserConsoleViewOutput
    );
  }

  // --- Desktop tools -----------------------------------------------------

  async screenCapture(
    input: ScreenCaptureInput = {}
  ): Promise<ScreenCaptureOutput> {
    return this.post(
      "/desktop/capture",
      input,
      ScreenCaptureInput,
      ScreenCaptureOutput
    );
  }

  async screenFind(input: ScreenFindInput): Promise<ScreenFindOutput> {
    return this.post("/desktop/find", input, ScreenFindInput, ScreenFindOutput);
  }

  async mouseMove(input: MouseMoveInput): Promise<MouseMoveOutput> {
    return this.post(
      "/desktop/mouse/move",
      input,
      MouseMoveInput,
      MouseMoveOutput
    );
  }

  async mouseClick(input: MouseClickInput): Promise<MouseClickOutput> {
    return this.post(
      "/desktop/mouse/click",
      input,
      MouseClickInput,
      MouseClickOutput
    );
  }

  async mouseDrag(input: MouseDragInput): Promise<MouseDragOutput> {
    return this.post(
      "/desktop/mouse/drag",
      input,
      MouseDragInput,
      MouseDragOutput
    );
  }

  async mouseScroll(input: MouseScrollInput): Promise<MouseScrollOutput> {
    return this.post(
      "/desktop/mouse/scroll",
      input,
      MouseScrollInput,
      MouseScrollOutput
    );
  }

  async keyPress(input: KeyPressInput): Promise<KeyPressOutput> {
    return this.post("/desktop/key/press", input, KeyPressInput, KeyPressOutput);
  }

  async keyType(input: KeyTypeInput): Promise<KeyTypeOutput> {
    return this.post("/desktop/key/type", input, KeyTypeInput, KeyTypeOutput);
  }

  async cursorPosition(): Promise<CursorPositionOutput> {
    return this.get("/desktop/cursor-position", CursorPositionOutput);
  }

  // --- Search ------------------------------------------------------------

  async infoSearchWeb(
    input: InfoSearchWebInput
  ): Promise<InfoSearchWebOutput> {
    return this.post(
      "/search/web",
      input,
      InfoSearchWebInput,
      InfoSearchWebOutput
    );
  }

  // --- Messaging ---------------------------------------------------------

  async messageNotifyUser(
    input: MessageNotifyUserInput
  ): Promise<MessageNotifyUserOutput> {
    return this.post(
      "/message/notify",
      input,
      MessageNotifyUserInput,
      MessageNotifyUserOutput
    );
  }

  async messageAskUser(
    input: MessageAskUserInput
  ): Promise<MessageAskUserOutput> {
    return this.post(
      "/message/ask",
      input,
      MessageAskUserInput,
      MessageAskUserOutput
    );
  }

  async idle(input: IdleInput = {}): Promise<IdleOutput> {
    return this.post("/idle", input, IdleInput, IdleOutput);
  }

  // --- Deploy ------------------------------------------------------------

  async exposePort(input: ExposePortInput): Promise<ExposePortOutput> {
    return this.post(
      "/deploy/expose-port",
      input,
      ExposePortInput,
      ExposePortOutput
    );
  }

  /**
   * Consume the server-sent event stream from /events.
   *
   * Yields each SandboxEvent as it's pushed by the sandbox. Cancel by
   * passing an AbortSignal; the async iterator will return cleanly on
   * abort. If the server closes the stream, the iterator returns.
   */
  async *events(options?: { signal?: AbortSignal }): AsyncGenerator<
    SandboxEvent,
    void
  > {
    const res = await this.fetchImpl(`${this.baseUrl}/events`, {
      method: "GET",
      headers: { accept: "text/event-stream" },
      signal: options?.signal
    });
    if (!res.ok || !res.body) {
      throw new ToolInvocationError(
        res.status,
        null,
        `failed to open event stream: ${res.status}`
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line.
        let idx = buffer.indexOf("\n\n");
        while (idx !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = parseSseFrame(frame);
          if (event) yield event;
          idx = buffer.indexOf("\n\n");
        }
      }
    } finally {
      try {
        reader.cancel();
      } catch {
        // ignore
      }
    }
  }

  // --- Internals ---------------------------------------------------------

  private async get<TOut>(
    path: string,
    outSchema: z.ZodType<TOut>
  ): Promise<TOut> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}${path}`;
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: "GET",
          signal: controller.signal
        });
      } catch (err) {
        throw new Error(formatFetchError("GET", url, err));
      }
      return await this.parseResponse(res, outSchema);
    } finally {
      clearTimeout(timer);
    }
  }

  private async post<TIn, TOut>(
    path: string,
    input: TIn,
    inSchema: z.ZodType<TIn>,
    outSchema: z.ZodType<TOut>
  ): Promise<TOut> {
    const validated = inSchema.parse(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}${path}`;
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(validated),
          signal: controller.signal
        });
      } catch (err) {
        throw new Error(formatFetchError("POST", url, err));
      }
      return await this.parseResponse(res, outSchema);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseResponse<TOut>(
    res: Response,
    outSchema: z.ZodType<TOut>
  ): Promise<TOut> {
    const text = await res.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      const msg =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `sandbox tool ${res.status}`;
      throw new ToolInvocationError(res.status, body, msg);
    }
    return outSchema.parse(body);
  }
}

function formatFetchError(method: string, url: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error && err.cause instanceof Error
      ? ` (${err.cause.message})`
      : "";
  return `sandbox request failed: ${method} ${url}: ${message}${cause}`;
}

function parseSseFrame(frame: string): SandboxEvent | null {
  // Per SSE spec: lines prefixed with "data:" are concatenated (newline-
  // joined); we only use the data field.
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  try {
    const parsed = SandboxEvent.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
