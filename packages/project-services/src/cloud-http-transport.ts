/**
 * The cloud's transfer and receive endpoints over HTTP, for the transfer
 * client in the server bundled with a native app
 * (docs/plans/native-cloud-sync/technical-design.md, K9, WP2.7).
 *
 * tRPC procedures are called as the native account library calls them
 * (`native/account/src/trpc_call.h`): a query is a GET with the input in
 * `?input=`, a mutation a POST with the input as the JSON body, and the
 * answer is `{"result": {"data": …}}`. File bytes go over REST:
 * `PUT /api/transfers/:id/files/:hash` and `GET /api/receive/:set_id/files/:hash`.
 *
 * The bearer token is the short-lived access token the app hands the local
 * server for one transfer (SR3). It goes to `origin` and nowhere else: the
 * caller passes a `fetchImpl` that applies its egress policy, and a redirect
 * to another origin must not carry the header.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { z } from "zod";
import {
  captureRevisionSetOutput,
  receiveDocumentOutput,
  releaseRevisionSetOutput,
  type CaptureRevisionSetOutput,
  type ReceiveDocumentOutput
} from "@nodetool-ai/protocol/api-schemas/receive.js";
import {
  cancelTransferOutput,
  openTransferOutput,
  transferAttemptResult,
  transferStatusOutput,
  type CancelTransferOutput,
  type CommitTransferInput,
  type OpenTransferOutput,
  type TransferAttemptResult,
  type TransferDocumentKind,
  type TransferManifest,
  type TransferStatusOutput
} from "@nodetool-ai/protocol/api-schemas/transfer.js";
import { ReceiveSetExpiredError, type ReceiveTransport } from "./cloud-receive-client.js";
import type { SendTransport } from "./cloud-send-client.js";

/** A refusal or failure the cloud answered with. */
export class CloudRequestError extends Error {
  constructor(
    readonly status: number,
    /** The API error code, such as `REVISION_SET_EXPIRED`, or `HTTP_<status>`. */
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CloudRequestError";
  }

  /** The request may succeed when sent again: the cloud or the network failed, not the request. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 425 || this.status === 429 || this.status >= 500;
  }
}

/** The access token went stale or was revoked. The app signs in again and hands a new one. */
export class CloudSignedOutError extends Error {
  constructor() {
    super("The cloud session ended. Sign in again.");
    this.name = "CloudSignedOutError";
  }
}

export interface CloudHttpTransportOptions {
  /** The cloud server origin, such as `https://api.nodetool.ai`. */
  origin: string;
  /** The short-lived access token for this transfer. */
  accessToken: string;
  /** The fetch that applies the caller's egress policy. */
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
}

/** The bytes of a file on this computer as a request body, read as a stream. */
function fileBody(source: string): ReadableStream<Uint8Array> {
  const chunks = createReadStream(source)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done) controller.close();
      // SAFETY: a read stream opened without an encoding yields Buffers.
      else controller.enqueue(new Uint8Array(next.value as Buffer));
    },
    async cancel() {
      await chunks.return?.();
    }
  });
}

/** Unwraps the answer of a tRPC server with or without a transformer. */
function unwrap(value: unknown): unknown {
  if (value && typeof value === "object" && "json" in value) return (value as { json: unknown }).json;
  return value;
}

async function errorOf(response: Response): Promise<CloudRequestError | CloudSignedOutError> {
  if (response.status === 401) return new CloudSignedOutError();
  let code = `HTTP_${response.status}`;
  let message = `The cloud answered ${response.status}`;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const error = unwrap(body["error"]) as Record<string, unknown> | undefined;
    const data = error?.["data"] as Record<string, unknown> | undefined;
    if (typeof data?.["apiCode"] === "string") code = data["apiCode"];
    else if (typeof body["code"] === "string") code = body["code"];
    if (typeof error?.["message"] === "string") message = error["message"];
    else if (typeof body["detail"] === "string") message = body["detail"];
  } catch {
    // The body is not JSON. The status says enough.
  }
  return new CloudRequestError(response.status, code, message);
}

/** A transport that calls one cloud server as one account. */
export class CloudHttpTransport implements ReceiveTransport, SendTransport {
  private readonly origin: string;

  constructor(private readonly options: CloudHttpTransportOptions) {
    this.origin = options.origin.replace(/\/+$/, "");
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { authorization: `Bearer ${this.options.accessToken}`, ...extra };
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.options.fetchImpl(`${this.origin}${path}`, init);
    } catch (error) {
      throw new CloudRequestError(0, "OFFLINE", error instanceof Error ? error.message : String(error));
    }
    return response;
  }

  /**
   * Calls a procedure and checks the answer against its output schema. A
   * self-hosted cloud can answer anything, and ids, hashes and paths from
   * the answer later name files on this computer.
   */
  private async procedure<T>(name: string, input: unknown, mutation: boolean, schema: z.ZodType<T>): Promise<T> {
    const response = mutation
      ? await this.send(`/trpc/${name}`, {
          method: "POST",
          headers: this.headers({ "content-type": "application/json" }),
          body: JSON.stringify(input)
        })
      : await this.send(`/trpc/${name}?input=${encodeURIComponent(JSON.stringify(input))}`, {
          method: "GET",
          headers: this.headers()
        });
    if (!response.ok) {
      const error = await errorOf(response);
      if (error instanceof CloudRequestError && error.code === "REVISION_SET_EXPIRED") {
        throw new ReceiveSetExpiredError(error.message);
      }
      throw error;
    }
    const body = (await response.json()) as { result?: { data?: unknown } };
    if (!body.result || typeof body.result !== "object") {
      throw new CloudRequestError(response.status, "INVALID_RESPONSE", "The cloud sent an answer without a result");
    }
    const parsed = schema.safeParse(unwrap(body.result.data));
    if (!parsed.success) {
      throw new CloudRequestError(response.status, "INVALID_RESPONSE", `The cloud's answer to ${name} is not valid`);
    }
    return parsed.data;
  }

  // ── receive ───────────────────────────────────────────────────────

  capture(input: { project_id: string }): Promise<CaptureRevisionSetOutput> {
    return this.procedure("receive.capture", input, true, captureRevisionSetOutput);
  }

  document(input: { set_id: string; kind: TransferDocumentKind; document_id: string }): Promise<ReceiveDocumentOutput> {
    return this.procedure("receive.document", input, false, receiveDocumentOutput);
  }

  async downloadFile(input: { set_id: string; hash: string }, destination: string): Promise<"ok" | "ERASED"> {
    const response = await this.send(`/api/receive/${input.set_id}/files/${input.hash}`, {
      method: "GET",
      headers: this.headers()
    });
    if (response.status === 410) return "ERASED";
    if (!response.ok || !response.body) {
      const error = await errorOf(response);
      if (error instanceof CloudRequestError && error.code === "REVISION_SET_EXPIRED") {
        throw new ReceiveSetExpiredError(error.message);
      }
      throw error;
    }
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(destination));
    return "ok";
  }

  async release(input: { set_id: string }): Promise<void> {
    await this.procedure("receive.release", input, true, releaseRevisionSetOutput);
  }

  // ── transfers ─────────────────────────────────────────────────────

  open(input: {
    transfer_id: string;
    project_id: string;
    first_publication: boolean;
    manifest: TransferManifest;
  }): Promise<OpenTransferOutput> {
    return this.procedure("transfers.open", input, true, openTransferOutput);
  }

  async stageFile(input: { transfer_id: string; hash: string; size: number }, source: string): Promise<void> {
    const size = (await stat(source)).size;
    if (size !== input.size) {
      throw new Error(`The file of ${input.hash} changed size since capture`);
    }
    const response = await this.send(`/api/transfers/${input.transfer_id}/files/${input.hash}`, {
      method: "PUT",
      headers: this.headers({ "content-type": "application/octet-stream", "content-length": String(size) }),
      body: fileBody(source),
      // Node's fetch needs this to send a stream as the request body.
      duplex: "half"
    } as RequestInit);
    if (!response.ok) throw await errorOf(response);
  }

  commit(input: CommitTransferInput): Promise<TransferAttemptResult> {
    return this.procedure("transfers.commit", input, true, transferAttemptResult);
  }

  status(input: { transfer_id: string }): Promise<TransferStatusOutput> {
    return this.procedure("transfers.status", input, false, transferStatusOutput);
  }

  cancel(input: { transfer_id: string }): Promise<CancelTransferOutput> {
    return this.procedure("transfers.cancel", input, true, cancelTransferOutput);
  }
}
