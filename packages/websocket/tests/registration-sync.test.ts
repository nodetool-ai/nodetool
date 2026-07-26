import { createHash } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initTestDb, ModelObserver, Workflow, TriggerRegistration } from "@nodetool-ai/models";
import type { Workflow as WorkflowModel } from "@nodetool-ai/models";
import { syncRegistrations } from "../src/triggers/registration-sync.js";

function setup() {
  initTestDb();
}

function triggerNode(
  id: string,
  type: string,
  props: Record<string, unknown> = {}
) {
  return { id, type, data: props };
}

async function makeWorkflow(nodes: Record<string, unknown>[]): Promise<WorkflowModel> {
  return (await Workflow.create<WorkflowModel>({
    user_id: "user-1",
    name: "wf",
    graph: { nodes, edges: [] }
  })) as WorkflowModel;
}

describe("syncRegistrations", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates one 'schedule' registration for an IntervalTrigger node with props snapshotted", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.IntervalTrigger", {
        interval_seconds: 30,
        emit_on_start: true
      })
    ]);

    const rows = await syncRegistrations(wf, { enabled: true });

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("schedule");
    expect(rows[0].workflow_id).toBe(wf.id);
    expect(rows[0].node_id).toBe("n1");
    expect(rows[0].enabled).toBe(1);
    expect(rows[0].config_json).toMatchObject({
      interval_seconds: 30,
      emit_on_start: true
    });

    const stored = await TriggerRegistration.findByWorkflow(wf.id);
    expect(stored).toHaveLength(1);
  });

  it("maps each trigger node type to its kind", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.WebhookTrigger", { path: "/hook" }),
      triggerNode("n2", "nodetool.triggers.IntervalTrigger", {}),
      triggerNode("n3", "nodetool.triggers.FileWatchTrigger", { path: "." }),
      triggerNode("n4", "nodetool.triggers.ManualTrigger", {}),
      // Not a registration kind — should be ignored entirely.
      triggerNode("n5", "nodetool.triggers.Wait", {})
    ]);

    const rows = await syncRegistrations(wf, { enabled: true });
    const byNode = new Map(rows.map((r) => [r.node_id, r.kind]));

    expect(rows).toHaveLength(4);
    expect(byNode.get("n1")).toBe("webhook");
    expect(byNode.get("n2")).toBe("schedule");
    expect(byNode.get("n3")).toBe("file_watch");
    expect(byNode.get("n4")).toBe("manual");
    expect(byNode.has("n5")).toBe(false);
  });

  it("removes the registration when its node is deleted from the graph", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.IntervalTrigger", { interval_seconds: 60 })
    ]);
    await syncRegistrations(wf, { enabled: true });
    expect(await TriggerRegistration.findByWorkflow(wf.id)).toHaveLength(1);

    wf.graph = { nodes: [], edges: [] };
    await wf.save();
    const rows = await syncRegistrations(wf, { enabled: true });

    expect(rows).toHaveLength(0);
    expect(await TriggerRegistration.findByWorkflow(wf.id)).toHaveLength(0);
  });

  it("updates config_json and resets cursor when node props change", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.IntervalTrigger", { interval_seconds: 60 })
    ]);
    const [initial] = await syncRegistrations(wf, { enabled: true });
    initial.cursor = "some-cursor-value";
    initial.last_fired_at = new Date().toISOString();
    await initial.save();

    wf.graph = {
      nodes: [
        triggerNode("n1", "nodetool.triggers.IntervalTrigger", {
          interval_seconds: 120
        })
      ],
      edges: []
    };
    await wf.save();

    const [updated] = await syncRegistrations(wf, { enabled: true });

    expect(updated.id).toBe(initial.id);
    expect(updated.config_json).toMatchObject({ interval_seconds: 120 });
    expect(updated.cursor).toBeNull();
  });

  it("leaves cursor untouched when the sync is a no-op re-sync", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.IntervalTrigger", { interval_seconds: 60 })
    ]);
    const [initial] = await syncRegistrations(wf, { enabled: true });
    initial.cursor = "some-cursor-value";
    await initial.save();

    const [again] = await syncRegistrations(wf, { enabled: true });

    expect(again.cursor).toBe("some-cursor-value");
  });

  it("disables all rows without deleting cursors when enabled is false", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.IntervalTrigger", { interval_seconds: 60 })
    ]);
    const [initial] = await syncRegistrations(wf, { enabled: true });
    initial.cursor = "keep-me";
    await initial.save();

    const [disabled] = await syncRegistrations(wf, { enabled: false });

    expect(disabled.enabled).toBe(0);
    expect(disabled.cursor).toBe("keep-me");

    const [reenabled] = await syncRegistrations(wf, { enabled: true });
    expect(reenabled.enabled).toBe(1);
    expect(reenabled.cursor).toBe("keep-me");
  });

  it("starts new registrations disabled when enabled is omitted", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.WebhookTrigger", {})
    ]);

    const [created] = await syncRegistrations(wf, {});

    expect(created.enabled).toBe(0);
  });

  it("preserves the activation state across a save when enabled is omitted", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.IntervalTrigger", { interval_seconds: 60 })
    ]);
    await syncRegistrations(wf, { enabled: true });

    // A plain graph save must not disarm an active trigger...
    const [afterSave] = await syncRegistrations(wf, {});
    expect(afterSave.enabled).toBe(1);

    await syncRegistrations(wf, { enabled: false });

    // ...nor re-arm a deactivated one.
    const [afterSaveWhileOff] = await syncRegistrations(wf, {});
    expect(afterSaveWhileOff.enabled).toBe(0);
  });

  it("generates a webhook URL token and a hashed secret in config_json", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.WebhookTrigger", {
        path: "/hook",
        secret: ""
      })
    ]);

    const [row] = await syncRegistrations(wf, { enabled: true });

    const config = row.config_json as Record<string, unknown>;
    expect(typeof config.webhook_token).toBe("string");
    expect((config.webhook_token as string).length).toBeGreaterThan(10);
    expect(typeof config.webhook_secret_hash).toBe("string");
    expect(config.webhook_secret_hash).not.toBe("");
    // The hash must not simply be the plaintext prop value.
    expect(config.webhook_secret_hash).not.toBe(config.secret);
  });

  it("keeps the plaintext webhook secret so a sender can authenticate", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.WebhookTrigger", { path: "/hook" })
    ]);

    const [row] = await syncRegistrations(wf, { enabled: true });

    const config = row.config_json as Record<string, unknown>;
    const secret = config.webhook_secret;
    expect(typeof secret).toBe("string");
    expect(secret).not.toBe("");
    // The ingestion route compares sha256 digests, so the retrievable secret
    // has to be the preimage of the stored hash or nothing can ever deliver.
    expect(createHash("sha256").update(secret as string).digest("hex")).toBe(
      config.webhook_secret_hash
    );
  });

  it("keeps the webhook token and secret hash stable across re-syncs with no prop change", async () => {
    const wf = await makeWorkflow([
      triggerNode("n1", "nodetool.triggers.WebhookTrigger", { path: "/hook" })
    ]);
    const [first] = await syncRegistrations(wf, { enabled: true });
    const [second] = await syncRegistrations(wf, { enabled: true });

    const firstConfig = first.config_json as Record<string, unknown>;
    const secondConfig = second.config_json as Record<string, unknown>;
    expect(secondConfig.webhook_token).toBe(firstConfig.webhook_token);
    expect(secondConfig.webhook_secret_hash).toBe(firstConfig.webhook_secret_hash);
  });
});
