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

  // --- Internals ---------------------------------------------------------

  private async get<TOut>(
    path: string,
    outSchema: z.ZodType<TOut>
  ): Promise<TOut> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        signal: controller.signal
      });
      return this.parseResponse(res, outSchema);
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
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validated),
        signal: controller.signal
      });
      return this.parseResponse(res, outSchema);
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
