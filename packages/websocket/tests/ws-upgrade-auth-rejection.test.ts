import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyWebSocket from "@fastify/websocket";
import { connect, type AddressInfo, type Socket } from "node:net";

import { denyUnauthorized } from "../src/lib/ws-upgrade.js";

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

/**
 * A server shaped like the real one: a global `onRequest` hook that refuses
 * everything, plus a WebSocket route the hook must keep unreachable.
 */
async function startServer(): Promise<{
  port: number;
  sockets: Set<Socket>;
}> {
  const instance = Fastify();

  const sockets = new Set<Socket>();
  instance.server.on("connection", (socket) => sockets.add(socket as Socket));

  // Registration order matters, and this is the order server.ts uses: the auth
  // hook goes on before @fastify/websocket. Fastify runs onRequest hooks in
  // registration order, so a 401 here short-circuits before the plugin's own
  // hook can mark the request as an upgrade — which is what its onResponse
  // cleanup keys off to destroy the socket. Register the plugin first and the
  // leak hides.
  instance.addHook("onRequest", async (req, reply) => {
    denyUnauthorized(req, reply, { error: "Unauthorized" });
  });

  await instance.register(fastifyWebSocket);

  instance.get("/ws", { websocket: true }, () => {
    throw new Error("a rejected upgrade must never reach the route handler");
  });
  instance.get("/api/thing", async () => ({ ok: true }));

  await instance.listen({ port: 0, host: "127.0.0.1" });
  app = instance;

  return { port: (instance.server.address() as AddressInfo).port, sockets };
}

/**
 * Open a WebSocket handshake, read whatever comes back, then walk away without
 * a close handshake — what a browser tab or a proxy does when it gives up on a
 * reconnect. The server, not the client, is responsible for the socket after
 * this point.
 */
function rejectedUpgrade(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let received = "";
    const client = connect(port, "127.0.0.1", () => {
      client.write(
        "GET /ws HTTP/1.1\r\n" +
          `Host: 127.0.0.1:${port}\r\n` +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
          "Sec-WebSocket-Version: 13\r\n\r\n"
      );
    });
    client.on("data", (chunk) => {
      received += chunk.toString();
    });
    client.on("error", reject);
    setTimeout(() => {
      client.end();
      setTimeout(() => resolve(received), 200);
    }, 200);
  });
}

describe("denyUnauthorized", () => {
  it("destroys the socket of a rejected WebSocket upgrade", async () => {
    const { port, sockets } = await startServer();

    const response = await rejectedUpgrade(port);
    expect(response).toContain("401");

    // The leak this guards: answering an upgrade through `reply.send()` leaves
    // the socket open. The peer is gone, so it parks in CLOSE_WAIT and its
    // descriptor is never released — one per rejected connect, until the
    // process hits its fd limit and stops accepting anything at all.
    const leaked = [...sockets].filter((socket) => !socket.destroyed);
    expect(leaked).toHaveLength(0);
  });

  it("still refuses a plain HTTP request through the normal reply path", async () => {
    const { port } = await startServer();

    const response = await fetch(`http://127.0.0.1:${port}/api/thing`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
