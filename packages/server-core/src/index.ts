import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { pack, unpack } from "msgpackr";
import { z } from "zod";
import { TokenType, type AuthProvider } from "@nodetool-ai/auth";
import type { Repository } from "@nodetool-ai/models-core";
import type { WorkflowGraph } from "@nodetool-ai/protocol";
import { graph } from "@nodetool-ai/protocol/api-schemas/workflows.js";

export interface ExecutionRequest {
  readonly graph: WorkflowGraph;
  readonly params: Record<string, unknown>;
  readonly signal: AbortSignal;
  readonly userId: string;
  readonly jobId: string;
  readonly recordUsage?: (usage: { readonly inputTokens: number; readonly outputTokens: number }) => void;
  readonly emit: (event: Record<string, unknown>) => void;
}
export interface Executor {
  validate(graph: WorkflowGraph): readonly unknown[];
  run(request: ExecutionRequest): Promise<Record<string, unknown>>;
}
export interface ServerCoreOptions {
  readonly repository: Repository;
  readonly auth: AuthProvider;
  readonly executor: Executor;
  readonly assetDirectory: string;
  readonly capabilities?: readonly string[];
  readonly secrets?: {
    encrypt(userId: string, value: string): string;
    decrypt(userId: string, value: string): string;
  };
}
class WorkflowValidationError extends Error {
  readonly statusCode = 422;
  get code(): string {
    for (const issue of this.issues) {
      if (typeof issue === "object" && issue !== null && "code" in issue && typeof issue.code === "string" &&
          ["FEATURE_NOT_INSTALLED", "FEATURE_NOT_CONFIGURED", "FEATURE_INITIALIZATION_FAILED"].includes(issue.code)) {
        return issue.code;
      }
    }
    return "WORKFLOW_VALIDATION_FAILED";
  }
  constructor(readonly issues: readonly unknown[]) { super("Workflow validation failed"); }
}
class WorkflowNotFoundError extends Error {
  readonly statusCode = 404;
  constructor() { super("Workflow not found"); }
}
const idParams = { type: "object", required: ["id"], properties: { id: { type: "string", minLength: 1 } } };
const objectBody = { type: "object", additionalProperties: true };
const record = z.record(z.string(), z.unknown());
const workflowBody = record.refine(value => value.graph === undefined || graph.safeParse(value.graph).success, "Invalid workflow graph");
const command = z.object({ command: z.enum(["run_job", "cancel_job", "reconnect_job"]), data: record });

/** Create an authenticated execution host. The caller owns repository lifecycle. */
export async function createServerCore(options: ServerCoreOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.url"] }, routerOptions: { ignoreTrailingSlash: true }, bodyLimit: 16 * 1024 * 1024 });
  const users = new WeakMap<FastifyRequest, string>();
  type Listener = (event: Record<string, unknown>) => void;
  interface JobSession {
    readonly userId: string;
    readonly workflowId: string;
    readonly listeners: Set<Listener>;
    readonly replay: Array<{ event: Record<string, unknown>; bytes: number }>;
    sequence: number;
    replayBytes: number;
    finished: boolean;
  }
  const sessions = new Map<string, JobSession>();
  const claimedJobIds = new Set<string>();
  const running = new Map<string, { userId: string; controller: AbortController; completion: Promise<void> }>();
  await mkdir(options.assetDirectory, { recursive: true });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: 16 * 1024 * 1024, files: 1, fields: 2, parts: 3, fieldSize: 1024 * 1024 } });
  await app.register(websocket, { options: { maxPayload: 16 * 1024 * 1024 } });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") return;
    const headers = new Headers(Object.entries(request.headers).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
    const url = new URL(request.url, "http://localhost");
    const token = url.pathname === "/ws" && request.headers.upgrade?.toLowerCase() === "websocket"
      ? options.auth.extractTokenFromWs(headers, url.searchParams)
      : options.auth.extractTokenFromHeaders(headers);
    if (!token) return reply.code(401).send({ error: "Authentication required" });
    const result = await options.auth.verifyToken(token);
    if (!result.ok || !result.userId || result.applicationId || result.tokenType === TokenType.APP_SESSION) return reply.code(401).send({ error: "Authentication failed" });
    users.set(request, result.userId);
  });
  function user(request: FastifyRequest): string {
    const result = users.get(request);
    if (!result) throw new Error("Authenticated user missing");
    return result;
  }
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof WorkflowValidationError) return reply.code(422).send({ error: error.message, code: error.code, validation_issues: error.issues });
    if (error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof z.ZodError) return reply.code(400).send({ error: "Invalid request", issues: error.issues });
    if (error instanceof Error && "code" in error && error.code === "AMBIGUOUS_RESOURCE_ID") return reply.code(409).send({ error: error.message, code: error.code });
    app.log.error(error);
    return reply.code(500).send({ error: "Request failed" });
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/capabilities", async () => ({ capabilities: options.capabilities ?? [] }));
  app.get("/api/workflows", { schema: { querystring: { type: "object", properties: { limit: { type: "string" }, cursor: { type: "string" }, run_mode: { type: "string" }, project_id: { type: "string" } } } } }, async request => {
    const query = new URL(request.url, "http://localhost").searchParams;
    const requestedLimit = Number.parseInt(query.get("limit") ?? "", 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const runMode = query.get("run_mode")?.trim();
    const projectId = query.get("project_id")?.trim();
    const cursorId = query.get("cursor")?.trim();
    const allRows = await options.repository.list("workflows", user(request));
    const cursor = cursorId ? await options.repository.get("workflows", user(request), cursorId) : null;
    const rows = allRows.filter(row => {
      if (projectId && row.project_id !== projectId) return false;
      if (runMode ? row.run_mode !== runMode : row.run_mode != null && !["workflow", "layer", "clip"].includes(String(row.run_mode))) return false;
      if (cursor && (row.updated_at > cursor.updated_at || row.updated_at === cursor.updated_at && row.id >= cursor.id)) return false;
      return true;
    }).sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id));
    const page = rows.slice(0, limit);
    return { workflows: page, next: rows.length > limit ? page[page.length - 1]?.id ?? null : null };
  });
  app.post("/api/workflows", { schema: { body: objectBody } }, async request => {
    const body = workflowBody.parse(request.body);
    return options.repository.put("workflows", user(request), { ...body, graph: body.graph ?? { nodes: [], edges: [] }, run_mode: body.run_mode ?? "workflow" });
  });
  app.get<{ Params: { id: string } }>("/api/workflows/:id", { schema: { params: idParams } }, async (request, reply) => {
    const value = await options.repository.get("workflows", user(request), request.params.id);
    return value ?? reply.code(404).send({ error: "Workflow not found" });
  });
  app.put<{ Params: { id: string } }>("/api/workflows/:id", { schema: { params: idParams, body: objectBody } }, async (request, reply) => {
    const existing = await options.repository.get("workflows", user(request), request.params.id);
    if (!existing) return reply.code(404).send({ error: "Workflow not found" });
    return options.repository.put("workflows", user(request), { ...existing, ...workflowBody.parse(request.body), id: existing.id });
  });
  app.delete<{ Params: { id: string } }>("/api/workflows/:id", { schema: { params: idParams } }, async (request, reply) => {
    if (!await options.repository.delete("workflows", user(request), request.params.id)) return reply.code(404).send({ error: "Workflow not found" });
    return reply.code(204).send();
  });
  app.post("/api/assets", { schema: { querystring: { type: "object", properties: { name: { type: "string" } } } } }, async (request, reply) => {
    let bytes: Buffer | undefined;
    let filename = "asset";
    let contentType = "application/octet-stream";
    let metadata: Record<string, unknown> = {};
    if (request.isMultipart()) {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (part.fieldname !== "file") {
            part.file.resume();
            return reply.code(400).send({ error: "Expected multipart field 'file'" });
          }
          bytes = await part.toBuffer();
          filename = part.filename;
          contentType = part.mimetype;
        } else if (part.fieldname === "json" || part.fieldname === "asset") {
          if (part.valueTruncated) return reply.code(413).send({ error: "Asset metadata is too large" });
          if (typeof part.value !== "string") return reply.code(400).send({ error: "Invalid asset metadata JSON" });
          try { metadata = record.parse(JSON.parse(part.value)); }
          catch { return reply.code(400).send({ error: "Invalid asset metadata JSON" }); }
        }
      }
    } else if (Buffer.isBuffer(request.body)) bytes = request.body;
    if (!bytes) return reply.code(415).send({ error: "Upload a multipart file or application/octet-stream" });
    const id = randomBytes(16).toString("hex");
    await writeFile(join(options.assetDirectory, id), bytes, { flag: "wx", mode: 0o600 });
    try {
      return await options.repository.put("assets", user(request), { ...metadata, id, name: typeof metadata.name === "string" ? metadata.name : filename, content_type: contentType, size: bytes.byteLength });
    } catch (error) {
      await unlink(join(options.assetDirectory, id));
      throw error;
    }
  });
  app.get<{ Params: { id: string } }>("/api/assets/:id", { schema: { params: idParams } }, async (request, reply) => {
    const asset = await options.repository.get("assets", user(request), request.params.id);
    return asset ?? reply.code(404).send({ error: "Asset not found" });
  });
  app.get<{ Params: { id: string } }>("/api/storage/:id", { schema: { params: idParams } }, async (request, reply) => {
    const asset = await options.repository.get("assets", user(request), request.params.id);
    if (!asset) return reply.code(404).send({ error: "Asset not found" });
    if (!/^[a-f0-9]{32}$/.test(asset.id)) throw new Error("Invalid stored asset identifier");
    return reply.type("application/octet-stream").send(await readFile(join(options.assetDirectory, asset.id)));
  });
  app.delete<{ Params: { id: string } }>("/api/assets/:id", { schema: { params: idParams } }, async (request, reply) => {
    const asset = await options.repository.get("assets", user(request), request.params.id);
    if (!asset) return reply.code(404).send({ error: "Asset not found" });
    if (!/^[a-f0-9]{32}$/.test(asset.id)) throw new Error("Invalid stored asset identifier");
    await unlink(join(options.assetDirectory, asset.id));
    await options.repository.delete("assets", user(request), asset.id);
    return reply.code(204).send();
  });
  app.get("/api/jobs", async request => options.repository.list("jobs", user(request)));
  app.get<{ Params: { id: string } }>("/api/jobs/:id", { schema: { params: idParams } }, async (request, reply) => (await options.repository.get("jobs", user(request), request.params.id)) ?? reply.code(404).send({ error: "Job not found" }));
  app.get("/api/secrets", async request => (await options.repository.list("secrets", user(request))).map(({ encrypted_value: _encrypted, ...metadata }) => metadata));
  app.post("/api/secrets", { schema: { body: objectBody } }, async (request, reply) => {
    if (!options.secrets) return reply.code(503).send({ error: "Secrets encryption is not configured" });
    const body = z.object({ key: z.string().min(1), value: z.string(), description: z.string().optional() }).parse(request.body);
    const existing = (await options.repository.list("secrets", user(request))).find(secret => secret.key === body.key);
    const saved = await options.repository.put("secrets", user(request), { ...existing, key: body.key, description: body.description ?? "", encrypted_value: options.secrets.encrypt(user(request), body.value) });
    const { encrypted_value: _encrypted, ...metadata } = saved;
    return metadata;
  });
  async function start(userId: string, data: Record<string, unknown>, emit: (event: Record<string, unknown>) => void): Promise<string> {
    const input = z.object({ workflow_id: z.string(), job_id: z.string().min(1).max(256).nullish(), params: record.nullish(), graph: graph.optional() }).parse(data);
    const stored = await options.repository.get("workflows", userId, input.workflow_id);
    if (!stored) throw new WorkflowNotFoundError();
    // The shared recursive metadata schema validates runtime values but exposes unknown in its inferred type.
    const workflowGraph = graph.parse(input.graph ?? stored.graph) as unknown as WorkflowGraph;
    const diagnostics = options.executor.validate(workflowGraph);
    if (diagnostics.length) throw new WorkflowValidationError(diagnostics);
    const requestedJobId = input.job_id ?? randomBytes(16).toString("hex");
    if (claimedJobIds.has(requestedJobId) || sessions.has(requestedJobId)) throw Object.assign(new Error("Job ID already exists"), { statusCode: 409 });
    claimedJobIds.add(requestedJobId);
    let job;
    try {
      if (await options.repository.get("jobs", userId, requestedJobId)) throw Object.assign(new Error("Job ID already exists"), { statusCode: 409 });
      job = await options.repository.put("jobs", userId, { id: requestedJobId, workflow_id: stored.id, status: "running" });
    } catch (error) {
      claimedJobIds.delete(requestedJobId);
      throw error;
    }
    const session: JobSession = { userId, workflowId: stored.id, listeners: new Set([emit]), replay: [], sequence: 0, replayBytes: 0, finished: false };
    sessions.set(job.id, session);
    const publish: Listener = event => {
      const frame = { ...event, job_id: job.id, workflow_id: stored.id, job_seq: ++session.sequence };
      const bytes = pack(frame).byteLength;
      session.replay.push({ event: frame, bytes });
      session.replayBytes += bytes;
      while (session.replay.length > 128 || session.replayBytes > 1024 * 1024) {
        const removed = session.replay.shift();
        if (removed) session.replayBytes -= removed.bytes;
      }
      for (const listener of session.listeners) listener(frame);
    };
    const controller = new AbortController();
    const usage = { input_tokens: 0, output_tokens: 0 };
    const recordUsage = (reported: { readonly inputTokens: number; readonly outputTokens: number }): void => {
      usage.input_tokens += reported.inputTokens;
      usage.output_tokens += reported.outputTokens;
    };
    const completion = Promise.resolve().then(async () => {
      try {
        publish({ type: "job_update", job_id: job.id, status: "running" });
        const result = await options.executor.run({ graph: workflowGraph, params: input.params ?? {}, signal: controller.signal, userId, jobId: job.id, emit: publish, recordUsage });
        const status = controller.signal.aborted ? "cancelled" : "completed";
        await options.repository.put("jobs", userId, { ...job, status, metadata_json: { result, usage }, finished_at: new Date().toISOString() });
        publish({ type: "job_update", job_id: job.id, status, result });
      } catch (error) {
        const status = controller.signal.aborted ? "cancelled" : "failed";
        await options.repository.put("jobs", userId, { ...job, status, metadata_json: { usage }, error_message: error instanceof Error ? error.message : "Execution failed", finished_at: new Date().toISOString() });
        publish({ type: "job_update", job_id: job.id, status, error: error instanceof Error ? error.message : "Execution failed" });
      } finally {
        running.delete(job.id);
        claimedJobIds.delete(requestedJobId);
        session.finished = true;
        const completed = [...sessions.entries()].filter(([, entry]) => entry.finished);
        for (const [id] of completed.slice(0, Math.max(0, completed.length - 32))) sessions.delete(id);
      }
    }).catch(() => {
      app.log.error({ job_id: job.id }, "Finalizing job failed");
      try {
        publish({ type: "job_update", job_id: job.id, status: "failed", error: "Saving job status failed" });
      } catch {
        app.log.error({ job_id: job.id }, "Sending job failure event failed");
      }
    });
    const finalized = completion.finally(() => session.listeners.clear());
    running.set(job.id, { userId, controller, completion: finalized });
    return job.id;
  }
  app.post<{ Params: { id: string } }>("/api/workflows/:id/run", { schema: { params: idParams, body: objectBody } }, async (request, reply) => reply.code(202).send({ job_id: await start(user(request), { ...record.parse(request.body), workflow_id: request.params.id }, () => {}) }));
  app.post<{ Params: { id: string } }>("/api/jobs/:id/cancel", { schema: { params: idParams } }, async (request, reply) => {
    const job = await options.repository.get("jobs", user(request), request.params.id);
    if (!job) return reply.code(404).send({ error: "Job not found" });
    running.get(job.id)?.controller.abort();
    return { job_id: job.id };
  });
  app.get("/ws", { websocket: true }, (socket, request) => {
    const emit: Listener = event => {
      if (socket.readyState !== 1) return;
      const bytes = pack(event);
      if (bytes.byteLength + socket.bufferedAmount > 1024 * 1024) {
        socket.close(1013, "Client is not consuming updates");
        return;
      }
      socket.send(bytes);
    };
    socket.on("close", () => { for (const session of sessions.values()) session.listeners.delete(emit); });
    socket.on("message", bytes => {
      const correlation: Record<string, unknown> = {};
      let incomingCommand: string | undefined;
      void (async () => {
        const message = command.parse(unpack(Array.isArray(bytes) ? Buffer.concat(bytes) : bytes instanceof ArrayBuffer ? Buffer.from(bytes) : bytes));
        incomingCommand = message.command;
        if (typeof message.data.job_id === "string") { correlation.job_id = message.data.job_id; }
        if (typeof message.data.workflow_id === "string") { correlation.workflow_id = message.data.workflow_id; }
        if (message.command === "run_job") await start(user(request), message.data, emit);
        else if (message.command === "reconnect_job") {
          const input = z.object({ job_id: z.string(), last_seq: z.number().int().nonnegative().optional() }).parse(message.data);
          const job = await options.repository.get("jobs", user(request), input.job_id);
          if (!job) { emit({ type: "job_update", job_id: input.job_id, status: "failed", error: "Job not found" }); return; }
          const session = sessions.get(job.id);
          if (session && session.userId === user(request)) {
            const lastSequence = input.last_seq ?? 0;
            const replay = session.replay.filter(frame => Number(frame.event.job_seq) > lastSequence);
            emit({ type: "job_resumed", job_id: job.id, workflow_id: session.workflowId, status: session.finished ? "finished" : "running", last_seq: session.sequence, replay_count: replay.length, replay_incomplete: lastSequence < (Number(session.replay[0]?.event.job_seq ?? session.sequence + 1) - 1) });
            for (const frame of replay) emit(frame.event);
            if (!session.finished) session.listeners.add(emit);
          } else if (!["completed", "failed", "cancelled"].includes(String(job.status))) {
            emit({ type: "job_resumed", job_id: job.id, workflow_id: job.workflow_id, status: "unknown", last_seq: 0, replay_count: 0, replay_incomplete: true });
          } else {
            const metadata = record.safeParse(job.metadata_json);
            const snapshot: Record<string, unknown> = { type: "job_update", job_id: job.id, workflow_id: job.workflow_id, status: job.status, error: job.error_message };
            if (metadata.success) { snapshot.result = metadata.data.result; }
            emit(snapshot);
          }
        } else {
          const input = z.object({ job_id: z.string() }).parse(message.data);
          const job = await options.repository.get("jobs", user(request), input.job_id);
          if (job) running.get(job.id)?.controller.abort();
        }
      })().catch(error => {
        if (error instanceof WorkflowValidationError) emit({ ...correlation, type: "job_update", status: "failed", error: error.message, code: error.code, validation_issues: error.issues });
        else if (incomingCommand === "run_job") {
          const message = error instanceof WorkflowNotFoundError ? "Workflow not found" : error instanceof Error && "statusCode" in error && error.statusCode === 409 ? "Job ID already exists" : "Starting job failed";
          emit({ ...correlation, type: "job_update", status: "failed", error: message });
        } else emit({ type: "error", message: "Invalid command" });
      });
    });
  });
  app.addHook("onClose", async () => {
    for (const job of running.values()) job.controller.abort();
    await Promise.allSettled([...running.values()].map(job => job.completion));
  });
  return app;
}
