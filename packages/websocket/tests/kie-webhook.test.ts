import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

beforeEach(async () => {
  app = Fastify();
  await app.register(kieWebhookRoute);
  await app.ready();
  mockResolve.mockReturnValue(true);
  mockReject.mockReturnValue(true);
});

afterEach(async () => {
  await app.close();
  vi.clearAllMocks();
});

describe("POST /api/kie/webhook/:taskId", () => {
  it("resolves a pending task on success callback", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/webhook/task-abc",
      payload: { state: "success", data: { taskId: "task-abc" } }
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "accepted" });
    expect(mockResolve).toHaveBeenCalledWith("task-abc", {
      state: "success",
      data: { taskId: "task-abc" }
    });
  });

  it("rejects a pending task on failure callback", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/webhook/task-xyz",
      payload: { state: "failed" }
    });
    expect(res.statusCode).toBe(200);
    expect(mockReject).toHaveBeenCalledWith("task-xyz", "failed");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("detects Suno failure statuses", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/webhook/task-suno",
      payload: { data: { status: "CREATE_TASK_FAILED" } }
    });
    expect(res.statusCode).toBe(200);
    expect(mockReject).toHaveBeenCalledWith("task-suno", "CREATE_TASK_FAILED");
  });
});

describe("POST /api/kie/webhook (generic)", () => {
  it("extracts taskId from body and resolves", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/webhook",
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
      url: "/api/kie/webhook",
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
      url: "/api/kie/webhook",
      payload: { something: "else" }
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "No taskId in request body" });
  });

  it("handles empty body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/webhook",
      payload: {}
    });
    expect(res.statusCode).toBe(400);
  });
});
