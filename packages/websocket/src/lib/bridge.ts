import type { FastifyRequest, FastifyReply } from "fastify";
import { gzipSync } from "node:zlib";

const GZIP_THRESHOLD = 256 * 1024;

/**
 * Converts a Fastify request into a Web API Request, calls the handler,
 * then forwards the Web API Response back through the Fastify reply.
 * Gzip-compresses large responses (>256KB) when client accepts it.
 */
export async function bridge(
  req: FastifyRequest,
  reply: FastifyReply,
  handler: (request: Request) => Promise<Response>
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
  // Forward authenticated userId as x-user-id header for route handlers
  if (req.userId != null) {
    headers.set("x-user-id", req.userId);
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
