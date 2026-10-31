import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initTestDb, ModelObserver, Prediction } from "@nodetool-ai/models";
import { generationsRouter } from "../src/trpc/routers/generations.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(generationsRouter);
function caller(userId: string | null = "owner") {
  const context: Context = {
    userId,
    registry: {} as never,
    apiOptions: {} as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  };
  return createCaller(context);
}

async function generation(data: Record<string, unknown> = {}): Promise<Prediction> {
  return Prediction.create<Prediction>({
    user_id: "owner", project_id: "project", provider: "fal_ai", model: "test/model",
    status: "completed", ...data
  });
}

describe("generation activity router", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("discovers persisted history scoped by account and project, with full IDs and a cursor", async () => {
    const newest = await generation({ created_at: "2026-01-03T00:00:00Z", cost: 0, currency: "USD" });
    const older = await generation({ created_at: "2026-01-02T00:00:00Z" });
    await generation({ user_id: "other", created_at: "2026-01-05T00:00:00Z" });
    await generation({ project_id: "other", created_at: "2026-01-04T00:00:00Z" });
    const first = await caller().list({ project_id: "project", limit: 1 });
    expect(first.generations.map((row) => row.generation_id)).toEqual([newest.id]);
    expect(first.generations[0]).toMatchObject({ cost: 0, currency: "USD" });
    expect(first.next).toBeTruthy();
    const reopened = await caller().list({ project_id: "project", limit: 1, start_key: first.next ?? "" });
    expect(reopened.generations.map((row) => row.generation_id)).toEqual([older.id]);
    expect(reopened.next).toBeNull();
    expect(reopened.generations[0]?.cost).toBeNull();
    await expect(caller().list({ start_key: "bad cursor" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await caller().get({ id: newest.id, project_id: "project" })).toMatchObject({
      generation_id: newest.id, cost: 0
    });
  });

  it("preserves recovery, cancellation intent, cost provenance, and billing units", async () => {
    await generation({
      lifecycle_owner: "durable", status: "completed", provider_status: "succeeded",
      output_status: "saving", cancel_requested_at: "2026-01-01T00:00:00Z",
      cost: 1.2, currency: "EUR", billing_unit: "seconds", quantity: 6, unit_price: 0.2,
      metadata: { price_source: "model-catalog" }
    });
    const result = await caller().list({ project_id: "project" });
    expect(result.generations[0]).toMatchObject({
      status: "recovering", cancellation_requested: true, cost: 1.2, currency: "EUR",
      billing_unit: "seconds", quantity: 6, unit_price: 0.2, price_source: "model-catalog"
    });
  });

  it("requests durable cancellation without claiming the provider stopped", async () => {
    const row = await generation({ lifecycle_owner: "durable", status: "running", provider_status: "running" });
    expect((await caller().get({ id: row.id })).can_cancel).toBe(true);
    expect(await caller().cancel({ id: row.id, project_id: "project" })).toEqual({
      id: row.id, outcome: "cancellation_requested"
    });
    const current = await Prediction.findForUser("owner", row.id);
    expect(current?.cancel_requested_at).toBeTruthy();
    expect(current?.status).toBe("running");
    expect((await caller().get({ id: row.id })).can_cancel).toBe(false);
  });

  it("does not cancel another account, project, or a settled generation", async () => {
    const other = await generation({ user_id: "other", status: "running" });
    const settled = await generation();
    await expect(caller().cancel({ id: other.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller().get({ id: other.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller().get({ id: settled.id, project_id: "other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller().cancel({ id: settled.id, project_id: "other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await caller().cancel({ id: settled.id })).outcome).toBe("not_running");
    await expect(caller(null).list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(null).cancel({ id: settled.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("resolves exactly twelve hex characters uniquely within the authorized project", async () => {
    const prefix = "aabbccddeeff";
    const mine = await generation({ id: prefix + "1".repeat(20), status: "running" });
    await generation({ id: prefix + "2".repeat(20), user_id: "other" });
    await generation({ id: prefix + "3".repeat(20), project_id: "other" });
    expect((await caller().get({ id: prefix, project_id: "project" })).generation_id).toBe(mine.id);
    await expect(caller().get({ id: prefix })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(caller().get({ id: prefix.slice(0, 11), project_id: "project" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller().get({ id: prefix + "1", project_id: "project" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await caller().cancel({ id: prefix, project_id: "project" })).toEqual({ id: mine.id, outcome: "closed" });
    await generation({ id: prefix + "4".repeat(20) });
    await expect(caller().cancel({ id: prefix, project_id: "project" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await caller().get({ id: mine.id })).generation_id).toBe(mine.id);
    await generation({ id: prefix });
    expect((await caller().get({ id: prefix, project_id: "project" })).generation_id).toBe(prefix);
    await generation({ id: "personal:owner" });
    expect((await caller().get({ id: "personal:owner" })).generation_id).toBe("personal:owner");
  });
});
