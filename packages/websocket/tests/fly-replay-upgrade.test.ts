/**
 * Owner-aware routing of a resuming WebSocket handshake.
 *
 * The hook runs on the raw upgrade, before any frame exists, and answers with
 * `fly-replay: instance=<owner>` so the proxy re-issues the whole handshake at
 * the machine holding the run. Driven here the way
 * `ws-upgrade-auth-rejection.test.ts` drives a refusal: a real Fastify server
 * with the hook registered, and a hand-written HTTP upgrade on a raw socket.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyWebSocket from "@fastify/websocket";
import { connect, type AddressInfo } from "node:net";

import { replayUpgradeToOwner } from "../src/lib/fly-replay.js";
import { initTestDb, Job } from "@nodetool-ai/models";

let app: FastifyInstance | null = null;

/** A server shaped like the real one: auth decorates userId, then the hook. */
async function startServer(): Promise<number> {
  const instance = Fastify();
  instance.decorateRequest("userId", null);
  instance.addHook("onRequest", async (req) => {
    req.userId = "1";
  });
  instance.addHook("onRequest", async (req, reply) => {
    await replayUpgradeToOwner(req, reply);
  });
  await instance.register(fastifyWebSocket);
  instance.get("/ws", { websocket: true }, (socket) => socket.close());
  instance.get("/api/thing", async () => ({ ok: true }));

  await instance.listen({ port: 0, host: "127.0.0.1" });
  app = instance;
  return (instance.server.address() as AddressInfo).port;
}

/** Send an upgrade and collect whatever the server writes back. */
function upgrade(
  port: number,
  path: string,
  headers: Record<string, string> = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    let received = "";
    const client = connect(port, "127.0.0.1", () => {
      const extra = Object.entries(headers)
        .map(([name, value]) => `${name}: ${value}\r\n`)
        .join("");
      client.write(
        `GET ${path} HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${port}\r\n` +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
          "Sec-WebSocket-Version: 13\r\n" +
          extra +
          "\r\n"
      );
    });
    client.on("data", (chunk) => {
      received += chunk.toString();
    });
    client.on("error", reject);
    setTimeout(() => {
      client.end();
      setTimeout(() => resolve(received), 100);
    }, 150);
  });
}

async function createJob(
  id: string,
  status: string,
  runnerInstance: string | null
): Promise<void> {
  await Job.create({
    id,
    workflow_id: "wf",
    user_id: "1",
    status,
    params: {},
    graph: { nodes: [], edges: [] },
    runner_instance: runnerInstance
  });
}

describe("fly-replay upgrade routing", () => {
  beforeEach(async () => {
    await initTestDb();
    process.env["NODETOOL_INSTANCE_ID"] = "machine-b";
  });

  afterEach(async () => {
    delete process.env["NODETOOL_INSTANCE_ID"];
    await app?.close();
    app = null;
  });

  it("replays a resume for a running job owned by another instance", async () => {
    await createJob("foreign-running", "running", "machine-a");
    const port = await startServer();

    const response = await upgrade(port, "/ws?resume_job=foreign-running");

    expect(response).toContain("fly-replay: instance=machine-a");
    expect(response).not.toContain("101 Switching Protocols");
  });

  it("upgrades normally when this instance owns the job", async () => {
    await createJob("mine", "running", "machine-b");
    const port = await startServer();

    const response = await upgrade(port, "/ws?resume_job=mine");

    expect(response).not.toContain("fly-replay");
    expect(response).toContain("101 Switching Protocols");
  });

  it("upgrades normally for a job that already reached a terminal status", async () => {
    await createJob("finished", "completed", "machine-a");
    const port = await startServer();

    const response = await upgrade(port, "/ws?resume_job=finished");

    expect(response).not.toContain("fly-replay");
    expect(response).toContain("101 Switching Protocols");
  });

  it("upgrades normally for an unknown job", async () => {
    const port = await startServer();

    const response = await upgrade(port, "/ws?resume_job=never-existed");

    expect(response).not.toContain("fly-replay");
    expect(response).toContain("101 Switching Protocols");
  });

  it("upgrades normally for another user's job", async () => {
    await Job.create({
      id: "someone-elses",
      workflow_id: "wf",
      user_id: "2",
      status: "running",
      params: {},
      graph: { nodes: [], edges: [] },
      runner_instance: "machine-a"
    });
    const port = await startServer();

    const response = await upgrade(port, "/ws?resume_job=someone-elses");

    expect(response).not.toContain("fly-replay");
    expect(response).toContain("101 Switching Protocols");
  });

  it("never replays a request the proxy already replayed once", async () => {
    await createJob("bouncing", "running", "machine-a");
    const port = await startServer();

    const response = await upgrade(port, "/ws?resume_job=bouncing", {
      "fly-replay-src": "instance=machine-c;region=iad"
    });

    expect(response).not.toContain("fly-replay:");
    expect(response).toContain("101 Switching Protocols");
  });

  it("stays inert without an instance id", async () => {
    delete process.env["NODETOOL_INSTANCE_ID"];
    await createJob("foreign-single", "running", "machine-a");
    const port = await startServer();

    const response = await upgrade(port, "/ws?resume_job=foreign-single");

    expect(response).not.toContain("fly-replay");
    expect(response).toContain("101 Switching Protocols");
  });

  it("leaves a plain HTTP request alone", async () => {
    await createJob("foreign-http", "running", "machine-a");
    const port = await startServer();

    const response = await fetch(
      `http://127.0.0.1:${port}/api/thing?resume_job=foreign-http`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("fly-replay")).toBeNull();
  });
});
