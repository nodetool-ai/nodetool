import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, TokenType } from "@nodetool-ai/auth";
import { resolveResourceId, type Repository, type ResourceDocument, type ResourceKind } from "@nodetool-ai/models-core";
import { pack, unpack } from "msgpackr";
import { createServerCore } from "../src/index.js";
class TestAuth extends AuthProvider {
  async verifyToken(token: string) { return { ok: token === "alice" || token === "bob" || token === "app-session", userId: token, tokenType: token === "app-session" ? TokenType.APP_SESSION : TokenType.USER }; }
}
function memoryRepository(): Repository {
  const records = new Map<ResourceKind, ResourceDocument[]>();
  return {
    async put(kind, userId, document) {
      const rows = records.get(kind) ?? [];
      const value = { ...document, id: document.id ?? randomBytes(16).toString("hex"), user_id: userId, created_at: "now", updated_at: "now" };
      records.set(kind, [...rows.filter(row => row.id !== value.id), value]);
      return value;
    },
    async get(kind, userId, id) { return resolveResourceId((records.get(kind) ?? []).filter(row => row.user_id === userId), id); },
    async list(kind, userId) { return (records.get(kind) ?? []).filter(row => row.user_id === userId); },
    async delete(kind, userId, id) {
      const found = await this.get(kind, userId, id);
      if (!found) return false;
      records.set(kind, (records.get(kind) ?? []).filter(row => row.id !== found.id));
      return true;
    },
    close() {}
  };
}
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(action => action())); });
async function fixture(diagnostics: readonly unknown[] = []) {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-host-"));
  const repository = memoryRepository();
  const app = await createServerCore({ repository, auth: new TestAuth(), assetDirectory: directory, executor: { validate: () => diagnostics, run: async () => ({ result: "ok" }) } });
  cleanup.push(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { app, repository };
}
describe("authenticated lean host", () => {
  it("bounds socket output and replay while allowing disconnected work to finish", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-backpressure-"));
    const repository = memoryRepository();
    const workflow = await repository.put("workflows", "alice", { graph: { nodes: [], edges: [] } });
    const app = await createServerCore({ repository, auth: new TestAuth(), assetDirectory: directory, executor: { validate: () => [], run: async ({ emit }) => {
      emit({ type: "chunk", content: "x".repeat(1024 * 1024) });
      return { result: "kept" };
    } } });
    cleanup.push(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
    await app.ready();
    const socket = await app.injectWS("/ws?api_key=alice");
    const closed = new Promise<number>(resolve => socket.once("close", resolve));
    const jobId = "backpressure-fixture";
    socket.send(pack({ command: "run_job", data: { job_id: jobId, workflow_id: workflow.id } }));
    expect(await closed).toBe(1013);
    let job = await repository.get("jobs", "alice", jobId);
    for (let attempt = 0; job?.status === "running" && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1));
      job = await repository.get("jobs", "alice", jobId);
    }
    expect(job?.status).toBe("completed");
    const reconnect = await app.injectWS("/ws?api_key=alice");
    const header = new Promise<Record<string, unknown>>(resolve => reconnect.on("message", bytes => { const frame = unpack(bytes); if (frame.type === "job_resumed") resolve(frame); }));
    reconnect.send(pack({ command: "reconnect_job", data: { job_id: jobId, last_seq: 0 } }));
    expect(await header).toMatchObject({ status: "finished", replay_incomplete: true, replay_count: 1 });
    reconnect.close();
  });
  it("preserves client job identity and replays owner scoped reconnects", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-reconnect-"));
    const repository = memoryRepository();
    const workflow = await repository.put("workflows", "alice", { graph: { nodes: [], edges: [] } });
    const app = await createServerCore({ repository, auth: new TestAuth(), assetDirectory: directory, executor: { validate: () => [], run: async ({ signal, emit }) => {
      emit({ type: "node_update", node_id: "fixture", status: "running" });
      return new Promise(resolve => signal.addEventListener("abort", () => resolve({ cancelled: true }), { once: true }));
    } } });
    cleanup.push(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
    await app.ready();
    const first = await app.injectWS("/ws?api_key=alice");
    const waitFor = (socket: typeof first, predicate: (frame: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.removeListener("message", receive); reject(new Error("Missing expected frame")); }, 3000);
      const receive = (bytes: Buffer): void => { const frame = unpack(bytes); if (predicate(frame)) { clearTimeout(timeout); socket.removeListener("message", receive); resolve(frame); } };
      socket.on("message", receive);
    });
    const jobId = "0123456789abcdef0123456789abcdef";
    const running = waitFor(first, frame => frame.type === "node_update");
    first.send(pack({ command: "run_job", data: { job_id: jobId, workflow_id: workflow.id } }));
    const initial = await running;
    expect(initial).toMatchObject({ job_id: jobId, workflow_id: workflow.id });
    expect(initial.job_seq).toBe(2);
    const duplicate = waitFor(first, frame => frame.type === "job_update" && frame.status === "failed");
    first.send(pack({ command: "run_job", data: { job_id: jobId, workflow_id: workflow.id } }));
    expect(await duplicate).toMatchObject({ job_id: jobId, workflow_id: workflow.id, status: "failed", error: "Job ID already exists" });
    expect(await repository.list("jobs", "alice")).toHaveLength(1);
    first.close();
    const other = await app.injectWS("/ws?api_key=bob");
    const denied = waitFor(other, frame => frame.type === "job_update");
    other.send(pack({ command: "reconnect_job", data: { job_id: jobId, workflow_id: workflow.id, last_seq: 0 } }));
    expect(await denied).toMatchObject({ status: "failed", error: "Job not found" });
    other.send(pack({ command: "cancel_job", data: { job_id: jobId } }));
    const resumed = await app.injectWS("/ws?api_key=alice");
    const header = waitFor(resumed, frame => frame.type === "job_resumed");
    const replay = waitFor(resumed, frame => frame.type === "node_update");
    resumed.send(pack({ command: "reconnect_job", data: { job_id: jobId, workflow_id: workflow.id, last_seq: 1 } }));
    expect(await header).toMatchObject({ job_id: jobId, workflow_id: workflow.id, status: "running", replay_count: 1 });
    expect((await replay).job_seq).toBe(2);
    const terminal = waitFor(resumed, frame => frame.status === "cancelled");
    resumed.send(pack({ command: "cancel_job", data: { job_id: jobId } }));
    const ended = await terminal;
    expect(ended).toMatchObject({ job_id: jobId, workflow_id: workflow.id, result: { cancelled: true } });
    const finishedHeader = waitFor(resumed, frame => frame.type === "job_resumed");
    const finished = waitFor(resumed, frame => frame.status === "cancelled");
    resumed.send(pack({ command: "reconnect_job", data: { job_id: jobId, last_seq: 2 } }));
    expect(await finishedHeader).toMatchObject({ status: "finished", replay_count: 1 });
    expect((await finished).result).toEqual({ cancelled: true });
    other.close(); resumed.close();
  });

  it("paginates tenant workflows with mode and project filters", async () => {
    const { app, repository } = await fixture();
    const graph = { nodes: [], edges: [] };
    await repository.put("workflows", "alice", { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", graph, project_id: "one", run_mode: "workflow" });
    await repository.put("workflows", "alice", { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", graph, project_id: "one", run_mode: "workflow" });
    await repository.put("workflows", "alice", { graph, project_id: "two", run_mode: "workflow" });
    await repository.put("workflows", "alice", { graph, project_id: "one", run_mode: "chat" });
    await repository.put("workflows", "bob", { graph, project_id: "one", run_mode: "workflow" });
    const headers = { authorization: "Bearer alice" };
    const first = (await app.inject({ method: "GET", url: "/api/workflows?limit=1&project_id=one", headers })).json();
    expect(first.workflows.map((row: { id: string }) => row.id)).toEqual(["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
    expect(first.next).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const second = (await app.inject({ method: "GET", url: `/api/workflows?limit=1&project_id=one&cursor=${first.next}`, headers })).json();
    expect(second.workflows.map((row: { id: string }) => row.id)).toEqual(["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]);
    expect(second.next).toBeNull();
    const chat = (await app.inject({ method: "GET", url: "/api/workflows?run_mode=chat", headers })).json();
    expect(chat.workflows).toHaveLength(1);
  });
  it("returns not found when running a missing or another tenant's workflow", async () => {
    const { app, repository } = await fixture();
    const saved = await repository.put("workflows", "bob", { graph: { nodes: [], edges: [] } });
    for (const id of ["missing", saved.id]) {
      const response = await app.inject({ method: "POST", url: `/api/workflows/${id}/run`, headers: { authorization: "Bearer alice" }, payload: {} });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Workflow not found" });
    }
  });

  it("contains terminal persistence failures and emits a sanitized failure", async () => {
    const { app, repository } = await fixture();
    const saved = await repository.put("workflows", "alice", { graph: { nodes: [], edges: [] } });
    const originalPut = repository.put;
    repository.put = async (kind, userId, document) => {
      if (kind === "jobs" && document.status !== "running") {
        throw new Error("SQLITE_FULL: private database path");
      }
      return originalPut(kind, userId, document);
    };
    const log = vi.spyOn(app.log, "error");
    await app.ready();
    const socket = await app.injectWS("/ws?api_key=alice");
    const failed = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No persistence failure event")), 3000);
      socket.on("message", bytes => {
        const event = unpack(bytes);
        if (event.status === "failed") { clearTimeout(timeout); resolve(event); }
      });
    });
    socket.send(pack({ command: "run_job", data: { workflow_id: saved.id } }));
    expect(await failed).toMatchObject({ status: "failed", error: "Saving job status failed" });
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private database path");
    const serverSocket = [...app.websocketServer.clients][0];
    if (!serverSocket) { throw new Error("Missing server socket"); }
    vi.spyOn(serverSocket, "send").mockImplementation(() => { throw new Error("Socket closed during emit"); });
    socket.send(pack({ command: "run_job", data: { workflow_id: saved.id } }));
    await vi.waitFor(() => expect(log.mock.calls.some(call => call[1] === "Sending job failure event failed")).toBe(true));
    socket.close();
  });
  it("accepts existing multipart file and metadata fields without decoding", async () => {
    const { app } = await fixture();
    const boundary = "nodetool-fixture";
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="asset"\r\n\r\n{"name":"stored binary"}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      Buffer.from([0, 255, 128, 4]), Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const result = await app.inject({ method: "POST", url: "/api/assets", headers: { authorization: "Bearer alice", "content-type": `multipart/form-data; boundary=${boundary}` }, payload });
    expect(result.statusCode).toBe(200);
    expect(result.json().name).toBe("stored binary");
    expect(result.json().size).toBe(4);
  });
  it("requires bearer headers on HTTP and rejects application-scoped sessions", async () => {
    const { app } = await fixture();
    expect((await app.inject({ url: "/api/workflows?api_key=alice" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/workflows", headers: { cookie: "api_key=alice" } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/workflows", headers: { authorization: "Bearer app-session" } })).statusCode).toBe(401);
  });
  it("returns structured unavailable-feature diagnostics without changing saved graphs", async () => {
    const issue = { nodeType: "Code", code: "FEATURE_NOT_INSTALLED", featureIds: ["sandbox"] };
    const { app, repository } = await fixture([issue]);
    const graph = { nodes: [], edges: [] };
    const saved = await repository.put("workflows", "alice", { graph });
    const response = await app.inject({ method: "POST", url: `/api/workflows/${saved.id}/run`, headers: { authorization: "Bearer alice" }, payload: {} });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "FEATURE_NOT_INSTALLED", validation_issues: [issue] });
    expect((await repository.get("workflows", "alice", saved.id))?.graph).toEqual(graph);
    await app.ready();
    const socket = await app.injectWS("/ws?api_key=alice");
    const failed = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No validation event")), 3000);
      socket.once("message", bytes => { clearTimeout(timeout); resolve(unpack(bytes)); });
    });
    socket.send(pack({ command: "run_job", data: { workflow_id: saved.id } }));
    expect(await failed).toMatchObject({ status: "failed", code: "FEATURE_NOT_INSTALLED", validation_issues: [issue] });
    socket.close();
  });
  it("streams MsgPack terminal events and cancels a tenant owned run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-cancel-"));
    const repository = memoryRepository();
    const saved = await repository.put("workflows", "alice", { graph: { nodes: [], edges: [] } });
    const app = await createServerCore({ repository, auth: new TestAuth(), assetDirectory: directory,
      executor: { validate: () => [], run: async ({ signal }) => new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve({ cancelled: true }), { once: true });
      }) } });
    cleanup.push(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
    await app.ready();
    const socket = await app.injectWS("/ws?api_key=alice");
    const terminal = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No cancellation terminal event")), 3000);
      socket.on("message", bytes => {
        const event = unpack(bytes);
        if (event.status === "running") socket.send(pack({ command: "cancel_job", data: { job_id: event.job_id } }));
        if (event.status === "cancelled") { clearTimeout(timeout); resolve(event); }
      });
    });
    socket.send(pack({ command: "run_job", data: { workflow_id: saved.id } }));
    expect((await terminal).status).toBe("cancelled");
    socket.close();
  });
  it("keeps unknown node properties and enforces tenant ownership with short IDs", async () => {
    const { app } = await fixture();
    expect((await app.inject({ method: "GET", url: "/api/workflows" })).statusCode).toBe(401);
    const graph = { nodes: [{ id: "n", type: "uninstalled.Node", data: { value: "keep me" } }], edges: [] };
    const created = await app.inject({ method: "POST", url: "/api/workflows", headers: { authorization: "Bearer alice" }, payload: { name: "stored", graph } });
    expect(created.statusCode).toBe(200);
    const id = created.json().id;
    const loaded = await app.inject({ method: "GET", url: `/api/workflows/${id.slice(0, 12)}`, headers: { authorization: "Bearer alice" } });
    expect(loaded.json().graph).toEqual(graph);
    expect((await app.inject({ method: "GET", url: `/api/workflows/${id}`, headers: { authorization: "Bearer bob" } })).statusCode).toBe(404);
  });
  it("forwards binary assets intact and isolates downloads", async () => {
    const { app } = await fixture();
    const bytes = Buffer.from([0, 255, 14, 33, 0, 128]);
    const upload = await app.inject({ method: "POST", url: "/api/assets", headers: { authorization: "Bearer alice", "content-type": "application/octet-stream" }, payload: bytes });
    expect(upload.statusCode).toBe(200);
    const id = upload.json().id;
    const metadata = await app.inject({ method: "GET", url: `/api/assets/${id.slice(0, 12)}`, headers: { authorization: "Bearer alice" } });
    expect(metadata.json()).toMatchObject({ id, size: bytes.length });
    const download = await app.inject({ method: "GET", url: `/api/storage/${id}`, headers: { authorization: "Bearer alice" } });
    expect(download.rawPayload).toEqual(bytes);
    expect((await app.inject({ method: "GET", url: `/api/storage/${id}`, headers: { authorization: "Bearer bob" } })).statusCode).toBe(404);
  });
});
