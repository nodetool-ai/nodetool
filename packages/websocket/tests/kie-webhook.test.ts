import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    resolveWebhook: vi.fn(),
    rejectWebhook: vi.fn()
  };
});

import { resolveWebhook, rejectWebhook } from "@nodetool-ai/runtime";
import kieWebhookRoute from "../src/routes/kie-webhook.js";

const mockResolve = resolveWebhook as unknown as ReturnType<typeof vi.fn>;
const mockReject = rejectWebhook as unknown as ReturnType<typeof vi.fn>;

let app: FastifyInstance;

const SECRET = "test-kie-webhook-secret";
const TOKEN = createHmac("sha256", SECRET)
  .update("nodetool:kie-webhook:v1")
  .digest("hex");
const URL_WITH_TOKEN = `/api/kie/webhook?token=${TOKEN}`;

beforeEach(async () => {
  vi.stubEnv("KIE_WEBHOOK_SECRET", SECRET);
  app = Fastify();
  // The production server replaces every parser with this buffer catch-all
  // (server.ts), so the route must parse JSON itself.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  await app.register(kieWebhookRoute);
  await app.ready();
  mockResolve.mockReturnValue(true);
  mockReject.mockReturnValue(true);
});

afterEach(async () => {
  await app.close();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/kie/webhook (generic)", () => {
  it("detects Suno failure statuses", async () => {
    const res = await app.inject({
      method: "POST",
      url: URL_WITH_TOKEN,
      payload: { taskId: "task-suno", data: { status: "CREATE_TASK_FAILED" } }
    });
    expect(res.statusCode).toBe(200);
    expect(mockReject).toHaveBeenCalledWith("task-suno", "CREATE_TASK_FAILED");
  });

  it("extracts taskId from body and resolves", async () => {
    const res = await app.inject({
      method: "POST",
      url: URL_WITH_TOKEN,
      payload: { taskId: "task-gen-1", state: "success" }
    });
    expect(res.statusCode).toBe(200);
    expect(mockResolve).toHaveBeenCalledWith("task-gen-1", {
      taskId: "task-gen-1",
      state: "success"
    });
  });

  it("extracts taskId from data.taskId", async () => {
    const res = await app.inject({
      method: "POST",
      url: URL_WITH_TOKEN,
      payload: { data: { taskId: "task-nested" } }
    });
    expect(res.statusCode).toBe(200);
    expect(mockResolve).toHaveBeenCalledWith("task-nested", {
      data: { taskId: "task-nested" }
    });
  });

  it("returns 400 when no taskId found", async () => {
    const res = await app.inject({
      method: "POST",
      url: URL_WITH_TOKEN,
      payload: { something: "else" }
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "No taskId in request body" });
  });

  it("handles empty body", async () => {
    const res = await app.inject({
      method: "POST",
      url: URL_WITH_TOKEN,
      payload: {}
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses a callback without the token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/webhook",
      payload: { taskId: "task-x", data: { status: "failed" } }
    });
    expect(res.statusCode).toBe(401);
    expect(mockReject).not.toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("refuses a callback with a wrong token", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/kie/webhook?token=${"0".repeat(TOKEN.length)}`,
      payload: { taskId: "task-x", state: "success" }
    });
    expect(res.statusCode).toBe(401);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("refuses every callback when no secret is configured", async () => {
    vi.stubEnv("KIE_WEBHOOK_SECRET", "");
    vi.stubEnv("SECRETS_MASTER_KEY", "");
    const res = await app.inject({
      method: "POST",
      url: URL_WITH_TOKEN,
      payload: { taskId: "task-x", state: "success" }
    });
    expect(res.statusCode).toBe(401);
    expect(mockResolve).not.toHaveBeenCalled();
  });
});
