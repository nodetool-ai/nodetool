import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { nativeGameDocument, nativeGameTransactionForDimension } from "@nodetool-ai/protocol/native-game";

const response = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), result: z.object({ document: nativeGameDocument, revision: z.number().int().nonnegative(), playing: z.boolean() }).passthrough() }),
  z.object({ status: z.literal("error"), error: z.object({ code: z.string(), message: z.string(), currentRevision: z.number().int().nonnegative().optional() }) })
]);
export const nativeEditorRequest = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("inspect") }),
  z.object({ operation: z.literal("transaction"), expectedRevision: z.number().int().nonnegative(), operations: z.array(z.record(z.string(), z.json())).min(1).max(1024) }),
  z.object({ operation: z.enum(["undo", "redo"]), expectedRevision: z.number().int().nonnegative() }),
  z.object({ operation: z.enum(["save", "start", "stop", "step"]) }),
  z.object({ operation: z.literal("select"), entityId: z.string().min(1).max(128) })
]);
export type NativeEditorRequest = z.infer<typeof nativeEditorRequest>;
export type NativeEditorResult = Extract<z.infer<typeof response>, { status: "ok" }>["result"];
export class NativeEditorError extends Error {
  constructor(readonly code: string, message: string, readonly currentRevision?: number) { super(message); this.name = "NativeEditorError"; }
}
/** Sends an operation to the live editor's user-local socket, sharing its document revision. */
export async function requestNativeEditor(socketPath: string, input: NativeEditorRequest, options: { readonly signal?: AbortSignal; readonly requestId?: string; readonly timeoutMs?: number; readonly documentId?: string; readonly dimension?: "2d" | "3d" } = {}): Promise<NativeEditorResult> {
  options.signal?.throwIfAborted();
  let request = nativeEditorRequest.parse(input);
  if (request.operation === "transaction") {
    if (!options.dimension) {
      const { requestId: _requestId, ...inspectionOptions } = options;
      const inspected = await requestNativeEditor(socketPath, { operation: "inspect" }, inspectionOptions);
      return requestNativeEditor(socketPath, input, { ...options, dimension: inspected.document.dimension, documentId: options.documentId ?? inspected.document.id });
    }
    const transaction = nativeGameTransactionForDimension(options.dimension).parse({ requestId: options.requestId ?? randomUUID(), expectedRevision: request.expectedRevision, operations: request.operations });
    request = { operation: "transaction", expectedRevision: transaction.expectedRevision, operations: transaction.operations };
  }
  const requestId = options.requestId ?? randomUUID();
  const timeoutMs = z.number().int().min(1).max(60_000).parse(options.timeoutMs ?? 10_000);
  const requestEnvelope: NativeEditorRequest & { protocolVersion: number; requestId: string; documentId?: string } = { protocolVersion: 1, requestId, ...request };
  if (options.documentId) { requestEnvelope.documentId = options.documentId; }
  const payload = Buffer.from(`${JSON.stringify(requestEnvelope)}\n`);
  if (payload.length > 4 * 1024 * 1024) { throw new NativeEditorError("resource_limit", "Editor request exceeds frame limit"); }
  return await new Promise<NativeEditorResult>((resolve, reject) => {
    const socket = createConnection(socketPath);
    let bytes = Buffer.alloc(0);
    let settled = false;
    const finish = (error: Error | undefined, result?: NativeEditorResult): void => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      socket.destroy();
      if (error) { reject(error); } else if (result) { resolve(result); }
    };
    const abort = (): void => finish(new NativeEditorError("cancelled", "Editor request cancelled"));
    const timer = setTimeout(() => finish(new NativeEditorError("timeout", "Editor request timed out")), timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) { abort(); return; }
    socket.once("connect", () => socket.write(payload));
    socket.once("error", (error) => finish(error));
    socket.once("close", () => { if (!settled) { finish(new NativeEditorError("worker_failed", "Editor socket closed before responding")); } });
    socket.on("data", (chunk: Buffer) => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length > 8 * 1024 * 1024) { finish(new NativeEditorError("resource_limit", "Editor response exceeds frame limit")); return; }
      const end = bytes.indexOf(10);
      if (end < 0) { return; }
      try {
        const envelope = z.object({ requestId: z.literal(requestId), protocolVersion: z.literal(1).default(1) }).passthrough().parse(JSON.parse(bytes.subarray(0, end).toString("utf8")));
        const parsed = response.parse(envelope);
        if (parsed.status === "error") { finish(new NativeEditorError(parsed.error.code, parsed.error.message, parsed.error.currentRevision)); }
        else { finish(undefined, parsed.result); }
      } catch (error) { finish(new NativeEditorError("protocol_error", z.string().catch("Invalid editor response").parse(error instanceof Error ? error.message : error))); }
    });
  });
}
