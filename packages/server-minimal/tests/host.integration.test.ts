import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pack, unpack } from "msgpackr";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";
import { createMinimalServer } from "../src/index.js";

it("executes remote streaming through HTTP, SQLite and the actor engine after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "minimal-host-"));
  const options = { directory, masterKey: "fixture-key".repeat(8), tokens: { ["a".repeat(32)]: "alice", ["b".repeat(32)]: "bob" }, provider: { async *stream() { yield { done: false as const, text: "hello" }; yield { done: false as const, text: " world" }; yield { done: true as const, usage: { inputTokens: 1, outputTokens: 2 } }; } } };
  let app = await createMinimalServer(options);
  const headers = { authorization: `Bearer ${"a".repeat(32)}` };
  try {
    const created = await app.inject({ method: "POST", url: "/api/workflows", headers, payload: { name: "fixture", graph: { nodes: [{ id: "text", type: "openai.text.ChatComplete", properties: { model: "fixture", prompt: "hello" } }, { id: "out", type: "nodetool.output.Output", properties: { name: "result" } }], edges: [{ source: "text", target: "out", sourceHandle: "output", targetHandle: "value" }] } } });
    expect(created.statusCode).toBe(200);
    const id = created.json().id;
    await app.close();
    app = await createMinimalServer(options);
    expect((await app.inject({ method: "GET", url: `/api/workflows/${id}`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/workflows/${id}`, headers: { authorization: `Bearer ${"b".repeat(32)}` } })).statusCode).toBe(404);
    const run = await app.inject({ method: "POST", url: `/api/workflows/${id}/run`, headers, payload: {} });
    expect(run.statusCode).toBe(202);
    const jobId = run.json().job_id;
    let job: { status?: string; metadata_json?: { result?: unknown; usage?: unknown } } = {};
    for (let attempt = 0; attempt < 100; attempt++) {
      job = (await app.inject({ method: "GET", url: `/api/jobs/${jobId}`, headers })).json();
      if (job.status !== "running") break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(job.status).toBe("completed");
    expect(job.metadata_json?.usage).toEqual({ input_tokens: 1, output_tokens: 2 });
    expect(job.metadata_json?.result).toEqual({ result: ["hello world"] });
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});

it("creates an empty workflow through the existing default graph contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "minimal-empty-"));
  const token = "a".repeat(32);
  const app = await createMinimalServer({ directory, masterKey: "fixture-key".repeat(8), tokens: { [token]: "alice" } });
  try {
    const created = await app.inject({ method: "POST", url: "/api/workflows", headers: { authorization: `Bearer ${token}` }, payload: {} });
    expect(created.statusCode).toBe(200);
    expect(created.json().graph).toEqual({ nodes: [], edges: [] });
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});


it("reports an orphaned persisted run as unknown after a real SQLite restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "minimal-orphan-"));
  const token = "a".repeat(32);
  const options = { directory, masterKey: "fixture-key".repeat(8), tokens: { [token]: "alice" } };
  let app = await createMinimalServer(options);
  try {
    await app.close();
    const repository = createSqliteRepository(join(directory, "nodetool.db"));
    const stale = await repository.put("jobs", "alice", { workflow_id: "saved-workflow", status: "running" });
    repository.close();
    app = await createMinimalServer(options);
    await app.ready();
    const socket = await app.injectWS(`/ws?api_key=${token}`);
    const frame = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No restart reconciliation frame")), 3000);
      socket.once("message", bytes => { clearTimeout(timeout); resolve(unpack(bytes)); });
    });
    socket.send(pack({ command: "reconnect_job", data: { job_id: stale.id, workflow_id: "saved-workflow", last_seq: 4 } }));
    expect(await frame).toMatchObject({ type: "job_resumed", status: "unknown", job_id: stale.id, workflow_id: "saved-workflow", replay_count: 0 });
    socket.close();
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
