import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import type { Context } from "../src/trpc/context.js";
import { createCallerFactory } from "../src/trpc/index.js";
import { realtimeSessionManager } from "../src/realtime/session-manager.js";

const createCaller = createCallerFactory(appRouter);

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
    const result = await caller.realtime.list();

    expect(result.sessions).toEqual([expected]);
  });

  it("gets a session owned by the authenticated user", async () => {
    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1"
    });

    const caller = createCaller(makeCtx());
    await expect(caller.realtime.get({ id: session.session_id })).resolves.toEqual(
      session
    );
  });

  it("rejects access to missing or foreign sessions", async () => {
    const foreign = realtimeSessionManager.createSession({
      userId: "user-2",
      workflowId: "workflow-2"
    });

    const caller = createCaller(makeCtx());
    await expect(caller.realtime.get({ id: "missing" })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
    await expect(caller.realtime.get({ id: foreign.session_id })).rejects.toMatchObject(
      {
        code: "NOT_FOUND"
      }
    );
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller(makeCtx({ userId: null }));
    await expect(caller.realtime.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
    await expect(caller.realtime.get({ id: "session-1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });
});
