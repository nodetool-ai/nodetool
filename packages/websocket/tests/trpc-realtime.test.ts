import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../src/trpc/context.js";
import { createCallerFactory } from "../src/trpc/index.js";
import { realtimeSessionManager } from "../src/realtime/session-manager.js";
import { realtimeRouter } from "../src/trpc/routers/realtime.js";

vi.mock("@nodetool/protocol/api-schemas/realtime.js", () => {
  const realtimeSessionRecord = z.object({
    session_id: z.string(),
    workflow_id: z.string().nullable(),
    job_id: z.string().nullable(),
    status: z.enum(["starting", "running", "stopped", "error"]),
    transport: z.enum(["websocket", "webrtc"]),
    parameters: z.record(z.string(), z.unknown()),
    media_tracks: z.array(z.record(z.string(), z.unknown())),
    signaling: z.object({
      status: z.enum(["idle", "negotiating", "connected", "failed"]),
      last_signal_type: z
        .enum(["offer", "answer", "ice_candidate"])
        .nullable()
        .optional(),
      last_signal_at: z.string().nullable().optional(),
      error: z.string().nullable().optional()
    }),
    created_at: z.string(),
    updated_at: z.string()
  });

  return {
    getInput: z.object({ id: z.string().min(1) }),
    listOutput: z.object({ sessions: z.array(realtimeSessionRecord) }),
    realtimeSessionRecord
  };
});

vi.mock("../src/trpc/error-formatter.js", () => ({
  errorFormatter: ({ shape }: { shape: unknown }) => shape,
  throwApiError: (code: string, message: string) => {
    throw new TRPCError({ code: code as "NOT_FOUND", message });
  }
}));

const createCaller = createCallerFactory(realtimeRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

describe("realtime router", () => {
  beforeEach(() => {
    realtimeSessionManager.reset();
  });

  it("lists sessions for the authenticated user", async () => {
    const expected = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      parameters: { brightness: 100 },
      transport: "webrtc"
    });

    realtimeSessionManager.createSession({
      userId: "user-2",
      workflowId: "workflow-2"
    });

    const caller = createCaller(makeCtx());
    const result = await caller.list();

    expect(result.sessions).toEqual([expected]);
  });

  it("gets a session owned by the authenticated user", async () => {
    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1"
    });

    const caller = createCaller(makeCtx());
    await expect(caller.get({ id: session.session_id })).resolves.toEqual(session);
  });

  it("rejects access to missing or foreign sessions", async () => {
    const foreign = realtimeSessionManager.createSession({
      userId: "user-2",
      workflowId: "workflow-2"
    });

    const caller = createCaller(makeCtx());
    await expect(caller.get({ id: "missing" })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
    await expect(caller.get({ id: foreign.session_id })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller(makeCtx({ userId: null }));
    await expect(caller.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
    await expect(caller.get({ id: "session-1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });
});
