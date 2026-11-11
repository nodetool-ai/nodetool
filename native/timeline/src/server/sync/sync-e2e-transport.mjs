import crypto from "node:crypto";
import http from "node:http";
import { NONCE_HEADER, PROOF_HEADER } from "../../../scripts/scratch-safety.mjs";

// Like scratch-server.mjs provenWrite: prove /ready on the very socket that
// carries the POST. A port ownership check alone has a replacement race.
export async function scratchPost(session, server, target, headers, input) {
  await session.assertScratch(server.base);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const connect = agent.createConnection;
  let socket;
  let opened = false;
  agent.createConnection = function (options, callback) {
    if (opened) {
      queueMicrotask(() => callback(new Error("proven connection closed, refusing to reconnect")));
      return undefined;
    }
    opened = true;
    socket = connect.call(this, options, callback);
    return socket;
  };
  const signal = AbortSignal.timeout(30_000);
  const exchange = (method, targetPath, requestHeaders, bytes) => new Promise((resolve, reject) => {
    const request = http.request(new URL(targetPath, server.base), {
      method, headers: requestHeaders, agent, signal
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve({
        status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("error", reject);
    request.end(bytes);
  });
  try {
    const nonce = crypto.randomBytes(32).toString("hex");
    const ready = await exchange("GET", "/ready", { [NONCE_HEADER]: nonce });
    const proof = ready.headers[PROOF_HEADER];
    const expected = crypto.createHmac("sha256", server.instance).update(nonce).digest();
    if (ready.status !== 200 || typeof proof !== "string" || !/^[0-9a-f]{64}$/.test(proof)
      || !crypto.timingSafeEqual(Buffer.from(proof, "hex"), expected)) {
      throw new Error("scratch /ready did not prove the server instance");
    }
    await session.assertScratch(server.base);
    if (!socket || socket.destroyed || !socket.writable || signal.aborted) {
      throw new Error("proven connection closed before POST");
    }
    const bytes = Buffer.from(JSON.stringify(input));
    const response = await exchange("POST", target, { ...headers, "content-length": bytes.length }, bytes);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${target}: HTTP ${response.status}: ${response.body}`);
    }
    return response;
  } finally {
    agent.destroy();
  }
}


// Only the native host uses this origin. MCP writes and runner queries keep
// their scratch-proven direct connection, so they cannot inflate this count.
export async function countingTimelineProxy(origin) {
  const target = new URL(origin);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.port === "7777") {
    throw new Error("counting proxy requires a loopback scratch HTTP origin outside port 7777");
  }
  let gets = 0;
  const sockets = new Set();
  const requests = new Set();
  const proxy = http.createServer((request, response) => {
    if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
      response.writeHead(400); response.end("Expected an origin-relative request target"); return;
    }
    const { pathname, search } = new URL(request.url, target);
    if (request.method === "GET" && pathname === "/trpc/timeline.get") {
      ++gets;
    }
    const upstream = http.request({
      protocol: "http:", hostname: "127.0.0.1", port: target.port || 80,
      path: pathname + search,
      method: request.method,
      headers: { ...request.headers, host: target.host },
      agent: false
    }, (reply) => {
      response.writeHead(reply.statusCode, reply.headers);
      reply.on("error", () => response.destroy());
      reply.pipe(response);
    });
    requests.add(upstream);
    upstream.on("close", () => requests.delete(upstream));
    upstream.on("error", () => { response.destroy(); });
    response.on("close", () => upstream.destroy());
    request.pipe(upstream);
  });
  proxy.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${proxy.address().port}`,
    timelineGets: () => gets,
    async close() {
      for (const request of requests) { request.destroy(); }
      for (const socket of sockets) { socket.destroy(); }
      await new Promise((resolve) => proxy.close(resolve));
    }
  };
}
