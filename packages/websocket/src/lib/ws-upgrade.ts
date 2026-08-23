import type { FastifyReply, FastifyRequest } from "fastify";

/** True when this request is a WebSocket handshake rather than a plain call. */
export function isWebSocketUpgrade(req: FastifyRequest): boolean {
  return req.headers["upgrade"]?.toLowerCase() === "websocket";
}

/**
 * Refuse a request with 401, closing the connection when it is a WebSocket
 * handshake.
 *
 * An upgrade cannot be refused through `reply.send()`. @fastify/websocket
 * dispatches the handshake through the normal Fastify stack against a
 * `ServerResponse` it assigned to the raw socket by hand, so that socket is
 * outside the HTTP server's connection bookkeeping: writing a response to it
 * closes nothing. The plugin does clean up after a refused upgrade, but from an
 * `onResponse` hook gated on the `request.ws` flag its own `onRequest` hook
 * sets — and hooks run in registration order, so an auth hook registered before
 * the plugin short-circuits first and that cleanup never runs.
 *
 * The socket then outlives the request. The peer goes away, it parks in
 * CLOSE_WAIT, and its descriptor is never released — one leaked fd per rejected
 * connect. A client retrying a stale token exhausts the process's fd limit in
 * hours, after which `accept()` fails and the server resets every incoming
 * connection, health checks included.
 *
 * So answer the handshake on the socket and destroy it. `reply.hijack()` takes
 * the request out of Fastify's lifecycle first, since we own the response from
 * that point on.
 */
export function denyUnauthorized(
  req: FastifyRequest,
  reply: FastifyReply,
  body: { error: string },
  challenge?: string
): void {
  if (!isWebSocketUpgrade(req)) {
    if (challenge) {
      reply.header("WWW-Authenticate", challenge);
    }
    reply.status(401).send(body);
    return;
  }

  reply.hijack();

  const socket = req.raw.socket;
  if (!socket || socket.destroyed) return;
  socket.write(
    "HTTP/1.1 401 Unauthorized\r\n" +
      "Connection: close\r\n" +
      "Content-Length: 0\r\n" +
      "\r\n"
  );
  socket.destroy();
}
