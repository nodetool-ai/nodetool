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

