import type { FastifyRequest, FastifyReply } from "fastify";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { gzipSync } from "node:zlib";
import { GZIP_THRESHOLD } from "./compression.js";

/** Responses whose body `bridge` pipes to the client instead of buffering. */
const streamedResponses = new WeakSet<Response>();

/**
 * A response `bridge` sends as a stream: no buffering, no gzip, and no
 * `content-length`. For large downloads such as an export zip. The route
 * handler must `return reply` after `bridge`, or Fastify ends the response
 * before the stream has sent anything.
 */
export function streamedResponse(body: Readable, init: ResponseInit): Response {
  const response = new Response(
    Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>,
    init
  );
  streamedResponses.add(response);
  return response;
}

/**
 * Converts a Fastify request into a Web API Request, calls the handler,
 * then forwards the Web API Response back through the Fastify reply.
 * Gzip-compresses large responses (>256KB) when client accepts it.
 */
export async function bridge(
  req: FastifyRequest,
  reply: FastifyReply,
  handler: (request: Request) => Promise<Response>,
  authenticatedUserIdHeader = "x-user-id"
): Promise<void> {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url, `${proto}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  // Strip any client-supplied identity header, then forward only the
  // server-authenticated userId. x-user-id is meant to be server-set: without
  // this, a client could inject an identity on auth-exempt/public routes (where
  // req.userId is unset) and impersonate other users downstream.
  headers.delete("x-user-id");
  headers.delete(authenticatedUserIdHeader);
  if (req.userId != null) {
    headers.set(authenticatedUserIdHeader, req.userId);
  }

  const method = req.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  let rawBody: Buffer | undefined;
  if (hasBody && req.body != null) {
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
    } else {
      rawBody = Buffer.from(JSON.stringify(req.body));
    }
  }

  const request = new Request(url.toString(), {
    method,
    headers,
    body:
      rawBody && rawBody.byteLength > 0 ? new Uint8Array(rawBody) : undefined
  });

  const response = await handler(request);

  reply.status(response.status);
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });

  if (!response.body) {
    reply.send();
    return;
  }

  if (streamedResponses.has(response)) {
    reply.send(
      Readable.fromWeb(response.body as unknown as NodeWebReadableStream)
    );
    return;
  }

  const bodyBuffer = Buffer.from(await response.arrayBuffer());
  if (bodyBuffer.byteLength === 0) {
    reply.send();
    return;
  }

  const acceptEncoding = req.headers["accept-encoding"] ?? "";
  const enc = Array.isArray(acceptEncoding)
    ? acceptEncoding.join(", ")
    : acceptEncoding;
  if (bodyBuffer.length > GZIP_THRESHOLD && enc.includes("gzip")) {
    const compressed = gzipSync(bodyBuffer);
    reply.header("content-encoding", "gzip");
    reply.header("content-length", String(compressed.length));
    reply.send(compressed);
    return;
  }

  reply.header("content-length", String(bodyBuffer.length));
  reply.send(bodyBuffer);
}
