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

  describe("next fire", () => {
    const CREATED_AT = "2026-01-01T00:00:00.000Z";

    async function makeSchedule(opts: {
      config?: Record<string, unknown>;
      enabled?: number;
      lastFiredAt?: string | null;
      kind?: string;
    }): Promise<TriggerRegistration> {
      return (await TriggerRegistration.create<TriggerRegistration>({
        user_id: "user-1",
        workflow_id: "wf-1",
        node_id: "node-1",
        kind: opts.kind ?? "schedule",
        config_json: opts.config ?? { interval_seconds: 300 },
        enabled: opts.enabled ?? 1,
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
        last_fired_at: opts.lastFiredAt ?? null
      })) as TriggerRegistration;
    }

    async function listOne() {
      const { triggers } = await createCaller(
        makeCtx()
      ).triggers.listByWorkflow({ workflowId: "wf-1" });
      return triggers[0];
    }

    it("projects the next fire one interval past the last one", async () => {
      await makeSchedule({
        config: { interval_seconds: 300 },
        lastFiredAt: "2026-02-02T10:00:00.000Z"
      });

      const trigger = await listOne();

      expect(trigger.next_fire_at).toBe("2026-02-02T10:05:00.000Z");
      expect(trigger.interval_seconds).toBe(300);
    });

    it("schedules a never-fired registration from created_at plus the initial delay", async () => {
      await makeSchedule({
        config: { interval_seconds: 300, initial_delay_seconds: 30 }
      });

      expect((await listOne()).next_fire_at).toBe("2026-01-01T00:00:30.000Z");
    });

    it("waits a full interval when emit_on_start is off", async () => {
      await makeSchedule({
        config: { interval_seconds: 300, emit_on_start: false }
      });

      expect((await listOne()).next_fire_at).toBe("2026-01-01T00:05:00.000Z");
    });

    it("defaults the interval to 60s when config omits it", async () => {
      await makeSchedule({ config: {} });

      const trigger = await listOne();
      expect(trigger.interval_seconds).toBe(60);
      expect(trigger.next_fire_at).toBe(CREATED_AT);
    });

    it("reports no next fire for a disabled schedule", async () => {
      await makeSchedule({ enabled: 0, lastFiredAt: "2026-02-02T10:00:00.000Z" });

      const trigger = await listOne();
      expect(trigger.next_fire_at).toBeNull();
      // The interval is still a property of the trigger, armed or not.
      expect(trigger.interval_seconds).toBe(300);
    });

    it.each(["webhook", "manual", "file_watch"])(
      "reports neither field for a %s trigger",
      async (kind) => {
        await makeSchedule({ kind, config: { interval_seconds: 300 } });

        const trigger = await listOne();
        expect(trigger.next_fire_at).toBeNull();
        expect(trigger.interval_seconds).toBeNull();
      }
    );
  });
});
