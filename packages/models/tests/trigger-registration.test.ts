import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { TriggerRegistration } from "../src/trigger-registration.js";

function setup() {
  initTestDb();
}

describe("TriggerRegistration model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with defaults and round-trips", async () => {
    const created = await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u1",
      workflow_id: "w1",
      node_id: "n1",
      kind: "schedule",
      config_json: { interval_seconds: 60 }
    });

    const loaded = await TriggerRegistration.get<TriggerRegistration>(
      created.id
    );
    expect(loaded).not.toBeNull();
    expect(loaded!.user_id).toBe("u1");
    expect(loaded!.workflow_id).toBe("w1");
    expect(loaded!.node_id).toBe("n1");
    expect(loaded!.kind).toBe("schedule");
    expect(loaded!.config_json).toEqual({ interval_seconds: 60 });
    expect(loaded!.enabled).toBe(1);
    expect(loaded!.cursor).toBeNull();
    expect(loaded!.last_fired_at).toBeNull();
    expect(loaded!.last_error).toBeNull();
    expect(loaded!.created_at).toBeTruthy();
    expect(loaded!.updated_at).toBeTruthy();
  });

  it("updates a registration", async () => {
    const reg = await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u1",
      workflow_id: "w1",
      node_id: "n1",
      kind: "schedule"
    });
    reg.cursor = "cur-1";
    reg.last_error = "boom";
    await reg.save();

    const loaded = await TriggerRegistration.get<TriggerRegistration>(reg.id);
    expect(loaded!.cursor).toBe("cur-1");
    expect(loaded!.last_error).toBe("boom");
  });

  it("findEnabledByKind returns only enabled rows of that kind", async () => {
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u1",
      workflow_id: "w1",
      node_id: "n1",
      kind: "schedule"
    });
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u1",
      workflow_id: "w2",
      node_id: "n1",
      kind: "schedule",
      enabled: 0
    });
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u1",
      workflow_id: "w3",
      node_id: "n1",
      kind: "webhook"
    });

    const rows = await TriggerRegistration.findEnabledByKind("schedule");
    expect(rows.map((r) => r.workflow_id)).toEqual(["w1"]);
  });

  it("findByWorkflow returns rows for that workflow", async () => {
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u1",
      workflow_id: "w1",
      node_id: "n1",
      kind: "schedule"
    });
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u1",
      workflow_id: "w1",
      node_id: "n2",
      kind: "webhook"
    });
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u1",
      workflow_id: "w2",
      node_id: "n1",
      kind: "schedule"
    });

    const rows = await TriggerRegistration.findByWorkflow("w1");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.node_id))).toEqual(new Set(["n1", "n2"]));
  });

  it("findByUser returns rows for that user", async () => {
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u1",
      workflow_id: "w1",
      node_id: "n1",
      kind: "schedule"
    });
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u2",
      workflow_id: "w2",
      node_id: "n1",
      kind: "schedule"
    });

    const rows = await TriggerRegistration.findByUser("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe("u1");
  });

  it("enforces unique (workflow_id, node_id)", async () => {
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "u1",
      workflow_id: "w1",
      node_id: "n1",
      kind: "schedule"
    });

    await expect(
      TriggerRegistration.create<TriggerRegistration>({
        user_id: "u1",
        workflow_id: "w1",
        node_id: "n1",
        kind: "webhook"
      })
    ).rejects.toThrow();
  });
});
