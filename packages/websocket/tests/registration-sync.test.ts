import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Workflow, TriggerRegistration } from "@nodetool-ai/models";
import { syncRegistrations } from "../src/triggers/registration-sync.js";

interface GraphNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

function makeWorkflow(nodes: GraphNode[]): Workflow {
  return new Workflow({
    id: "wf-1",
    user_id: "user-1",
    name: "Trigger WF",
    graph: { nodes, edges: [] }
  });
}

const intervalNode = (
  data: Record<string, unknown> = { interval_seconds: 60, max_events: 0 }
): GraphNode => ({
  id: "trigger-1",
  type: "nodetool.triggers.IntervalTrigger",
  data
});

const webhookNode = (
  data: Record<string, unknown> = {
    port: 8080,
    path: "/webhook",
    secret: "s3cr3t"
  }
): GraphNode => ({
  id: "hook-1",
  type: "nodetool.triggers.WebhookTrigger",
  data
});

describe("syncRegistrations", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("creates one schedule row with the node props snapshotted", async () => {
    await syncRegistrations(makeWorkflow([intervalNode()]));

    const rows = await TriggerRegistration.findByWorkflow("wf-1");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.kind).toBe("schedule");
    expect(row.node_id).toBe("trigger-1");
    expect(row.user_id).toBe("user-1");
    expect(row.config_json).toMatchObject({ interval_seconds: 60, max_events: 0 });
  });

  it("ignores the Wait node (a delay, not a trigger)", async () => {
    await syncRegistrations(
      makeWorkflow([
        { id: "w", type: "nodetool.triggers.Wait", data: { timeout_seconds: 5 } }
      ])
    );
    expect(await TriggerRegistration.findByWorkflow("wf-1")).toHaveLength(0);
  });

  it("removes the row when the node is deleted from the graph", async () => {
    await syncRegistrations(makeWorkflow([intervalNode()]));
    expect(await TriggerRegistration.findByWorkflow("wf-1")).toHaveLength(1);

    await syncRegistrations(makeWorkflow([]));
    expect(await TriggerRegistration.findByWorkflow("wf-1")).toHaveLength(0);
  });

  it("updates config_json and resets cursor when props change", async () => {
    await syncRegistrations(makeWorkflow([intervalNode()]));
    const [reg] = await TriggerRegistration.findByWorkflow("wf-1");
    reg.cursor = "cursor-value";
    await reg.save();

    await syncRegistrations(
      makeWorkflow([intervalNode({ interval_seconds: 120, max_events: 0 })])
    );

    const [updated] = await TriggerRegistration.findByWorkflow("wf-1");
    expect(updated.config_json).toMatchObject({ interval_seconds: 120 });
    expect(updated.cursor).toBeNull();
  });

  it("does not reset the cursor when props are unchanged", async () => {
    await syncRegistrations(makeWorkflow([intervalNode()]));
    const [reg] = await TriggerRegistration.findByWorkflow("wf-1");
    reg.cursor = "keep-me";
    await reg.save();

    await syncRegistrations(makeWorkflow([intervalNode()]));
    const [again] = await TriggerRegistration.findByWorkflow("wf-1");
    expect(again.cursor).toBe("keep-me");
  });

  it("disables all rows without deleting them or their cursors", async () => {
    await syncRegistrations(makeWorkflow([intervalNode()]));
    const [reg] = await TriggerRegistration.findByWorkflow("wf-1");
    reg.cursor = "cursor-value";
    await reg.save();

    await syncRegistrations(makeWorkflow([intervalNode()]), { enabled: false });

    const [disabled] = await TriggerRegistration.findByWorkflow("wf-1");
    expect(disabled.enabled).toBe(0);
    expect(disabled.cursor).toBe("cursor-value");
  });

  it("gives webhook rows a token and a hashed secret, never the plaintext", async () => {
    await syncRegistrations(makeWorkflow([webhookNode()]));
    const [reg] = await TriggerRegistration.findByWorkflow("wf-1");
    const config = reg.config_json as Record<string, unknown>;

    expect(reg.kind).toBe("webhook");
    expect(typeof config.token).toBe("string");
    expect((config.token as string).length).toBeGreaterThan(0);
    expect(typeof config.secret_hash).toBe("string");
    // SHA-256 hex digest is 64 chars, and the plaintext is never stored.
    expect((config.secret_hash as string)).toHaveLength(64);
    expect(config.secret).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain("s3cr3t");
  });

  it("keeps the webhook token stable across re-syncs, even when config changes", async () => {
    await syncRegistrations(makeWorkflow([webhookNode()]));
    const [first] = await TriggerRegistration.findByWorkflow("wf-1");
    const token = (first.config_json as Record<string, unknown>).token;

    // Re-sync with an otherwise-unchanged graph: token stays.
    await syncRegistrations(makeWorkflow([webhookNode()]));
    const [second] = await TriggerRegistration.findByWorkflow("wf-1");
    expect((second.config_json as Record<string, unknown>).token).toBe(token);

    // Re-sync with a config change: token still identifies the endpoint.
    await syncRegistrations(
      makeWorkflow([webhookNode({ port: 9090, path: "/hook", secret: "s3cr3t" })])
    );
    const [third] = await TriggerRegistration.findByWorkflow("wf-1");
    expect((third.config_json as Record<string, unknown>).token).toBe(token);
  });
});
