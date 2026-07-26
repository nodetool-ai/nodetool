import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initTestDb,
  ModelObserver,
  TriggerRegistration
} from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId = "user-1"): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

async function makeRegistration(overrides: {
  user_id?: string;
  workflow_id?: string;
  node_id?: string;
  kind?: string;
  enabled?: number;
  config_json?: Record<string, unknown>;
}): Promise<TriggerRegistration> {
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: overrides.user_id ?? "user-1",
    workflow_id: overrides.workflow_id ?? "wf-1",
    node_id: overrides.node_id ?? "node-1",
    kind: overrides.kind ?? "manual",
    config_json: overrides.config_json ?? {},
    enabled: overrides.enabled ?? 0,
    cursor: null
  })) as TriggerRegistration;
}

describe("triggers.listByWorkflow", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => ModelObserver.clear());

  it("returns registrations that have never been enabled", async () => {
    // The Activate toggle has nothing to arm unless a disabled row is
    // discoverable, so this is the case jobs.triggersRunning cannot serve.
    const reg = await makeRegistration({ enabled: 0 });

    const { triggers } = await createCaller(makeCtx()).triggers.listByWorkflow({
      workflowId: "wf-1"
    });

    expect(triggers).toHaveLength(1);
    expect(triggers[0].id).toBe(reg.id);
    expect(triggers[0].enabled).toBe(false);
    expect(triggers[0].node_id).toBe("node-1");
  });

  it("surfaces the webhook token and secret so a sender can be configured", async () => {
    await makeRegistration({
      kind: "webhook",
      enabled: 1,
      config_json: {
        webhook_token: "tok-abc",
        webhook_secret: "sec-xyz",
        webhook_secret_hash: "hash-should-not-leak"
      }
    });

    const { triggers } = await createCaller(makeCtx()).triggers.listByWorkflow({
      workflowId: "wf-1"
    });

    expect(triggers[0].webhook_token).toBe("tok-abc");
    expect(triggers[0].webhook_secret).toBe("sec-xyz");
    // The digest is an implementation detail of the ingestion route.
    expect(JSON.stringify(triggers[0])).not.toContain("hash-should-not-leak");
  });

  it("leaves webhook fields null for other kinds", async () => {
    await makeRegistration({ kind: "schedule", enabled: 1 });

    const { triggers } = await createCaller(makeCtx()).triggers.listByWorkflow({
      workflowId: "wf-1"
    });

    expect(triggers[0].webhook_token).toBeNull();
    expect(triggers[0].webhook_secret).toBeNull();
  });

  it("omits registrations owned by another user", async () => {
    await makeRegistration({ user_id: "user-2" });

    const { triggers } = await createCaller(makeCtx("user-1")).triggers.listByWorkflow(
      { workflowId: "wf-1" }
    );

    expect(triggers).toEqual([]);
  });

  it("returns an empty list for a workflow with no registrations", async () => {
    const { triggers } = await createCaller(makeCtx()).triggers.listByWorkflow({
      workflowId: "wf-missing"
    });

    expect(triggers).toEqual([]);
  });
});
