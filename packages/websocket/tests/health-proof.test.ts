/**
 * The /health proof the desktop app checks before it reuses a running server.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("@nodetool-ai/models", () => ({ pingDb: vi.fn().mockResolvedValue(undefined) }));

import healthRoute, {
  SERVER_PROOF_HEADER,
  SERVER_PROOF_NONCE_HEADER,
  serverProofFor
} from "../src/routes/health.js";

const KEY = "a".repeat(64);
const NONCE = "0123456789abcdef0123456789abcdef";

async function listen(key: string | undefined): Promise<{ app: FastifyInstance; port: number }> {
  if (key === undefined) {
    delete process.env["NODETOOL_SERVER_PROOF_KEY"];
  } else {
    process.env["NODETOOL_SERVER_PROOF_KEY"] = key;
  }
  const app = Fastify({ logger: false });
  await app.register(healthRoute);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { app, port: address.port };
}

describe("/health server proof", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    delete process.env["NODETOOL_SERVER_PROOF_KEY"];
  });

  it("answers a nonce with the HMAC of the nonce and its own port", async () => {
    const started = await listen(KEY);
    app = started.app;
    const res = await fetch(`http://127.0.0.1:${started.port}/health`, {
      headers: { [SERVER_PROOF_NONCE_HEADER]: NONCE }
    });
    expect(res.status).toBe(200);
    expect(res.headers.get(SERVER_PROOF_HEADER)).toBe(serverProofFor(KEY, started.port, NONCE));
    expect(res.headers.get(SERVER_PROOF_HEADER)).not.toBe(serverProofFor(KEY, started.port + 1, NONCE));
  });

  it("sends no proof without a key", async () => {
    const started = await listen(undefined);
    app = started.app;
    const res = await fetch(`http://127.0.0.1:${started.port}/health`, {
      headers: { [SERVER_PROOF_NONCE_HEADER]: NONCE }
    });
    expect(res.status).toBe(200);
    expect(res.headers.get(SERVER_PROOF_HEADER)).toBeNull();
  });

  it("sends no proof for a missing or malformed nonce", async () => {
    const started = await listen(KEY);
    app = started.app;
    const missing = await fetch(`http://127.0.0.1:${started.port}/health`);
    expect(missing.headers.get(SERVER_PROOF_HEADER)).toBeNull();
    const malformed = await fetch(`http://127.0.0.1:${started.port}/health`, {
      headers: { [SERVER_PROOF_NONCE_HEADER]: "short" }
    });
    expect(malformed.headers.get(SERVER_PROOF_HEADER)).toBeNull();
  });
});
