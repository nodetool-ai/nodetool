import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { getRawDb, initTestDb } from "../src/db.js";
import { setMasterKey } from "@nodetool-ai/security";
import {
  createWorkerInstance,
  getWorkerInstance,
  listWorkerInstances,
  updateWorkerInstance,
  touchWorkerInstance,
  deleteWorkerInstance
} from "../src/worker-instances.js";

const TEST_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz"; // base64

/**
 * Task B3 — instance registry accessors over the worker_instances table.
 */
describe("worker instance registry accessors", () => {
  beforeEach(() => {
    initTestDb();
    setMasterKey(TEST_MASTER_KEY);
  });
  afterEach(() => ModelObserver.clear());

  function makeInput(overrides: Record<string, unknown> = {}) {
    return {
      profile_name: "hf-a40",
      target: "runpod",
      provider_ref: "pod-123",
      ws_url: "wss://pod-123-7777.proxy.runpod.net",
      token: "tok-abc",
      ...overrides
    };
  }

  it("createWorkerInstance persists with status provisioning", async () => {
    const instance = await createWorkerInstance(makeInput());

    expect(instance.id).toBeTruthy();
    expect(instance.profile_name).toBe("hf-a40");
    expect(instance.target).toBe("runpod");
    expect(instance.provider_ref).toBe("pod-123");
    expect(instance.ws_url).toBe("wss://pod-123-7777.proxy.runpod.net");
    expect(instance.token).toBe("tok-abc");
    expect(instance.status).toBe("provisioning");
    expect(instance.attached_to).toBeNull();
    expect(instance.estimated_cost_usd).toBeNull();
    expect(instance.created_at).toBeTruthy();
    expect(instance.last_activity_at).toBeTruthy();
  });

  it("getWorkerInstance returns a stored instance", async () => {
    const created = await createWorkerInstance(makeInput());

    const found = await getWorkerInstance(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.provider_ref).toBe("pod-123");
  });

  it("getWorkerInstance returns null when missing", async () => {
    expect(await getWorkerInstance("nope")).toBeNull();
  });

  it("listWorkerInstances returns all instances", async () => {
    await createWorkerInstance(makeInput({ provider_ref: "pod-a" }));
    await createWorkerInstance(makeInput({ provider_ref: "pod-b" }));

    const all = await listWorkerInstances();
    expect(all.map((i) => i.provider_ref).sort()).toEqual(["pod-a", "pod-b"]);
  });

  it("listWorkerInstances filters by status and excludes stopped rows", async () => {
    const running = await createWorkerInstance(makeInput({ provider_ref: "pod-run" }));
    await updateWorkerInstance(running.id, { status: "running" });

    const stopped = await createWorkerInstance(makeInput({ provider_ref: "pod-stop" }));
    await updateWorkerInstance(stopped.id, { status: "stopped" });

    const onlyRunning = await listWorkerInstances({ status: "running" });
    expect(onlyRunning.map((i) => i.provider_ref)).toEqual(["pod-run"]);
    expect(onlyRunning.map((i) => i.status)).toEqual(["running"]);
  });

  it("updateWorkerInstance sets status, ws_url, token, cost, and activity", async () => {
    const created = await createWorkerInstance(makeInput());

    const updated = await updateWorkerInstance(created.id, {
      status: "attached",
      ws_url: "wss://new-url",
      token: "tok-new",
      attached_to: "desktop-1",
      last_activity_at: "2026-01-01T00:00:00.000Z",
      estimated_cost_usd: 1.5
    });

    expect(updated.status).toBe("attached");
    expect(updated.ws_url).toBe("wss://new-url");
    expect(updated.token).toBe("tok-new");
    expect(updated.attached_to).toBe("desktop-1");
    expect(updated.last_activity_at).toBe("2026-01-01T00:00:00.000Z");
    expect(updated.estimated_cost_usd).toBe(1.5);
  });

  it("updateWorkerInstance throws when the instance is missing", async () => {
    await expect(
      updateWorkerInstance("missing", { status: "running" })
    ).rejects.toThrow(/missing/);
  });

  it("touchWorkerInstance updates only last_activity_at", async () => {
    const created = await createWorkerInstance(makeInput());
    await new Promise((resolve) => setTimeout(resolve, 5));

    const touched = await touchWorkerInstance(created.id);

    expect(touched.status).toBe(created.status);
    expect(touched.provider_ref).toBe(created.provider_ref);
    expect(
      new Date(touched.last_activity_at).getTime()
    ).toBeGreaterThan(new Date(created.last_activity_at).getTime());
  });

  it("touchWorkerInstance throws when the instance is missing", async () => {
    await expect(touchWorkerInstance("missing")).rejects.toThrow(/missing/);
  });

  it("deleteWorkerInstance removes the instance", async () => {
    const created = await createWorkerInstance(makeInput());
    await deleteWorkerInstance(created.id);
    expect(await getWorkerInstance(created.id)).toBeNull();
  });

  it("never persists the bearer token in plaintext", async () => {
    const created = await createWorkerInstance(
      makeInput({ token: "super-secret-token" })
    );

    const row = getRawDb()
      .prepare("SELECT encrypted_token FROM worker_instances WHERE id = ?")
      .get(created.id) as { encrypted_token: string | null };

    expect(row.encrypted_token).toBeTruthy();
    expect(row.encrypted_token).not.toBe("super-secret-token");
    expect(row.encrypted_token).not.toContain("super-secret-token");
  });

  it("getWorkerInstance round-trips the decrypted token", async () => {
    const created = await createWorkerInstance(
      makeInput({ token: "super-secret-token" })
    );

    const found = await getWorkerInstance(created.id);
    expect(found!.token).toBe("super-secret-token");
  });

  it("updateWorkerInstance re-encrypts a rotated token", async () => {
    const created = await createWorkerInstance(makeInput({ token: "tok-old" }));

    await updateWorkerInstance(created.id, { token: "tok-rotated" });

    const row = getRawDb()
      .prepare("SELECT encrypted_token FROM worker_instances WHERE id = ?")
      .get(created.id) as { encrypted_token: string | null };
    expect(row.encrypted_token).not.toContain("tok-rotated");

    const found = await getWorkerInstance(created.id);
    expect(found!.token).toBe("tok-rotated");
  });

  it("listWorkerInstances does not leak tokens in bulk", async () => {
    await createWorkerInstance(makeInput({ token: "leak-me" }));

    const all = await listWorkerInstances();
    expect(all).toHaveLength(1);
    expect(all[0]!.token).toBeNull();
  });

  it("stores a null token without encryption", async () => {
    const created = await createWorkerInstance(makeInput({ token: null }));

    const row = getRawDb()
      .prepare("SELECT encrypted_token FROM worker_instances WHERE id = ?")
      .get(created.id) as { encrypted_token: string | null };
    expect(row.encrypted_token).toBeNull();

    const found = await getWorkerInstance(created.id);
    expect(found!.token).toBeNull();
  });
});
