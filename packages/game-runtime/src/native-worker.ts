import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pack, unpack } from "msgpackr";
import { z } from "zod";

const responseSchema = z.discriminatedUnion("status", [
  z.object({ protocolVersion: z.literal(1), requestId: z.string(), status: z.literal("ok"), result: z.unknown() }),
  z.object({ protocolVersion: z.literal(1), requestId: z.string(), status: z.literal("error"),
    error: z.object({ code: z.string(), message: z.string(), path: z.string().optional(), currentRevision: z.union([z.string(), z.number()]).optional(),
      details: z.record(z.string(), z.unknown()).optional() }) })
]);

export class NativeGameWorkerError extends Error {
  constructor(readonly code: string, message: string, readonly currentRevision?: string | number,
    readonly path?: string, readonly details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "NativeGameWorkerError";
  }
}

export interface NativeGameWorkerOptions {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly maxFrameBytes?: number;
  readonly requestTimeoutMs?: number;
  readonly killGraceMs?: number;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  dispose(): void;
}

/** A dedicated child receives no inherited provider credentials or application environment. */
export class NativeGameWorker {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly maxFrameBytes: number;
  private readonly timeoutMs: number;
  private readonly killGraceMs: number;
  private buffer = Buffer.alloc(0);
  private closed = false;
  private stopping = false;
  private diagnostics = "";

  constructor(options: NativeGameWorkerOptions) {
    this.maxFrameBytes = options.maxFrameBytes ?? 16 * 1024 * 1024;
    this.timeoutMs = options.requestTimeoutMs ?? 30_000;
    this.killGraceMs = options.killGraceMs ?? 250;
    this.child = spawn(options.executable, [...(options.args ?? [])], {
      stdio: "pipe", env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.receive(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.diagnostics = (this.diagnostics + chunk.toString("utf8")).slice(-8192);
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.stdin.on("error", (error) => this.fail(error));
    this.child.on("exit", (code, signal) => this.fail(new NativeGameWorkerError("worker_exit",
      `Native game worker exited (${signal ?? code}): ${this.diagnostics}`)));
  }

  async request(operation: string, input: Readonly<Record<string, unknown>> = {}, options: {
    readonly signal?: AbortSignal; readonly requestId?: string;
  } = {}): Promise<unknown> {
    options.signal?.throwIfAborted();
    if (this.closed || this.stopping) { throw new NativeGameWorkerError("worker_closed", "Native game worker is closed"); }
    if (this.pending.size >= 64 || this.child.stdin.writableLength > this.maxFrameBytes) {
      throw new NativeGameWorkerError("backpressure", "Native game worker request queue is full");
    }
    const requestId = options.requestId ?? randomUUID();
    if (this.pending.has(requestId)) { throw new NativeGameWorkerError("duplicate_request", "Request is already pending"); }
    const payload = pack({ ...input, protocolVersion: 1, requestId, operation });
    if (payload.length > this.maxFrameBytes) { throw new NativeGameWorkerError("frame_limit", "Request exceeds frame limit"); }
    const frame = Buffer.allocUnsafe(payload.length + 4);
    frame.writeUInt32BE(payload.length); payload.copy(frame, 4);
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        const error = new NativeGameWorkerError("cancelled", "Native game request cancelled");
        this.cancelAndStop(requestId, error);
      };
      const timer = setTimeout(() => this.cancelAndStop(requestId,
        new NativeGameWorkerError("timeout", "Native game request timed out")), this.timeoutMs);
      const dispose = (): void => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); };
      this.pending.set(requestId, { resolve, reject, dispose });
      options.signal?.addEventListener("abort", abort, { once: true });
      this.child.stdin.write(frame, (error) => { if (error) { this.fail(error); } });
    });
  }

  close(): void {
    if (this.closed) { return; }
    this.fail(new NativeGameWorkerError("worker_closed", "Native game worker closed"));
  }

  private cancelAndStop(targetRequestId: string, error: Error): void {
    const pending = this.pending.get(targetRequestId);
    if (!pending) { return; }
    this.stopping = true;
    pending.dispose(); pending.reject(error); this.pending.delete(targetRequestId);
    // An unacknowledged mutation has an unknown outcome. Terminate this worker rather than reuse uncertain state.
    const payload = pack({ protocolVersion: 1, requestId: randomUUID(), operation: "cancel", targetRequestId });
    const frame = Buffer.allocUnsafe(payload.length + 4);
    frame.writeUInt32BE(payload.length); payload.copy(frame, 4);
    this.child.stdin.write(frame);
    const timer = setTimeout(() => this.fail(error), this.killGraceMs);
    timer.unref();
  }

  private receive(chunk: Buffer): void {
    if (this.closed) { return; }
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (length === 0 || length > this.maxFrameBytes) {
        this.fail(new NativeGameWorkerError("frame_limit", "Worker response exceeds frame limit")); return;
      }
      if (this.buffer.length < length + 4) { return; }
      const bytes = this.buffer.subarray(4, length + 4);
      this.buffer = this.buffer.subarray(length + 4);
      try {
        const response = responseSchema.parse(unpack(bytes));
        const pending = this.pending.get(response.requestId);
        if (!pending) { continue; }
        pending.dispose(); this.pending.delete(response.requestId);
        if (response.status === "error") {
          pending.reject(new NativeGameWorkerError(response.error.code, response.error.message, response.error.currentRevision, response.error.path, response.error.details));
        } else { pending.resolve(response.result); }
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error))); return;
      }
    }
  }

  private fail(error: Error): void {
    if (this.closed) { return; }
    this.closed = true;
    for (const pending of this.pending.values()) { pending.dispose(); pending.reject(error); }
    this.pending.clear();
    this.child.kill("SIGKILL");
  }
}
