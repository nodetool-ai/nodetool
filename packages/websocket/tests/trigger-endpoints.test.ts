import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, TriggerRegistration } from "@nodetool-ai/models";
import {
  handleTriggersRunning,
  handleTriggerStart,
  handleTriggerStop
} from "../src/http-api.js";

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function req(method: string, userId?: string): Request {
  const headers = new Headers();
  if (userId) headers.set("x-user-id", userId);
  return new Request("http://localhost/api/jobs/triggers", { method, headers });
}

async function seed(
  overrides: Partial<{
    id: string;
    user_id: string;
    workflow_id: string;
    node_id: string;
    kind: string;
    enabled: number;
    last_error: string | null;
    last_fired_at: string | null;
  }>
): Promise<TriggerRegistration> {
  const reg = new TriggerRegistration({
    user_id: "user-1",
    workflow_id: "wf-1",
    node_id: "node-1",
    kind: "schedule",
    enabled: 1,
    ...overrides
  });
  await reg.save();
  return reg;
}

describe("trigger REST endpoints", () => {
  beforeEach(() => {
    initTestDb();
  });

  describe("GET running", () => {
    it("lists only the caller's enabled registrations", async () => {
      await seed({ node_id: "a", enabled: 1, last_error: "boom" });
      await seed({ node_id: "b", enabled: 0 });
      await seed({ node_id: "c", user_id: "user-2", enabled: 1 });

      const res = await handleTriggersRunning(req("GET", "user-1"), {});
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      const triggers = body.triggers as Array<Record<string, unknown>>;
      expect(triggers).toHaveLength(1);
      expect(triggers[0]).toMatchObject({
        workflow_id: "wf-1",
        node_id: "a",
        kind: "schedule",
        last_error: "boom"
      });
    });

    it("rejects non-GET", async () => {
      const res = await handleTriggersRunning(req("POST", "user-1"), {});
      expect(res.status).toBe(405);
    });
  });

  describe("POST start/stop", () => {
    it("start enables the workflow's registrations", async () => {
      await seed({ node_id: "a", enabled: 0 });
      await seed({ node_id: "b", enabled: 0 });

      const res = await handleTriggerStart(req("POST", "user-1"), "wf-1", {});
      expect(res.status).toBe(200);

      const rows = await TriggerRegistration.findByWorkflow("wf-1");
      expect(rows.every((r) => r.enabled === 1)).toBe(true);
    });

    it("stop disables the workflow's registrations", async () => {
      await seed({ node_id: "a", enabled: 1 });

      const res = await handleTriggerStop(req("POST", "user-1"), "wf-1", {});
      expect(res.status).toBe(200);

      const rows = await TriggerRegistration.findByWorkflow("wf-1");
      expect(rows.every((r) => r.enabled === 0)).toBe(true);
    });

    it("returns 404 when another user owns the workflow's registrations", async () => {
      await seed({ node_id: "a", user_id: "user-2", enabled: 0 });

      const res = await handleTriggerStart(req("POST", "user-1"), "wf-1", {});
      expect(res.status).toBe(404);

      const rows = await TriggerRegistration.findByWorkflow("wf-1");
      expect(rows[0].enabled).toBe(0);
    });

    it("returns 404 for a workflow with no registrations", async () => {
      const res = await handleTriggerStop(req("POST", "user-1"), "missing", {});
      expect(res.status).toBe(404);
    });

    it("rejects non-POST", async () => {
      const res = await handleTriggerStart(req("GET", "user-1"), "wf-1", {});
      expect(res.status).toBe(405);
    });
  });
});
