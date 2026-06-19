import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import type { WorkerManager, WorkerConnection } from "@nodetool-ai/compute";
import type { WorkerInstance, WorkerProfile } from "@nodetool-ai/models";

const createCaller = createCallerFactory(appRouter);

/** A fake WorkerManager whose every method is a vi.fn spy. */
function makeManager(): Record<keyof WorkerManager, ReturnType<typeof vi.fn>> {
  return {
    createProfile: vi.fn(),
    listProfiles: vi.fn(),
    deleteProfile: vi.fn(),
    provision: vi.fn(),
    stop: vi.fn(),
    stopAll: vi.fn(),
    list: vi.fn(),
    status: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    getActiveWorker: vi.fn(),
    reconcile: vi.fn(),
    apiKeyStatus: vi.fn(),
    resume: vi.fn(),
    terminate: vi.fn(),
    connectionInfo: vi.fn()
  } as unknown as Record<keyof WorkerManager, ReturnType<typeof vi.fn>>;
}

function makeProfile(over: Partial<WorkerProfile> = {}): WorkerProfile {
  return {
    id: "p1",
    name: "hf-a40",
    target: "runpod",
    image: "ghcr.io/x/worker:1",
    spec: {},
    token_policy: "generate",
    idle_timeout_minutes: 30,
    max_lifetime_minutes: null,
    created_at: "2026-06-08T00:00:00Z",
    updated_at: "2026-06-08T00:00:00Z",
    ...over
  };
}

function makeInstance(over: Partial<WorkerInstance> = {}): WorkerInstance {
  return {
    id: "i1",
    profile_name: "hf-a40",
    target: "runpod",
    provider_ref: "pod-1",
    ws_url: "wss://pod-1-7777.proxy.runpod.net",
    token: "tok-1",
    status: "running",
    attached_to: null,
    created_at: "2026-06-08T00:00:00Z",
    last_activity_at: "2026-06-08T00:00:00Z",
    estimated_cost_usd: 1.25,
    ...over
  };
}

function makeCtx(
  manager: Record<keyof WorkerManager, ReturnType<typeof vi.fn>> | undefined,
  repoint: ReturnType<typeof vi.fn>,
  probe?: ReturnType<typeof vi.fn>
): Context {
  return {
    userId: "1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    workerManager: manager as unknown as WorkerManager | undefined,
    repointPythonBridge: repoint as unknown as (
      target: WorkerConnection | null
    ) => void,
    probeWorkerHealth: probe as unknown as Context["probeWorkerHealth"]
  };
}

describe("worker router", () => {
  let manager: ReturnType<typeof makeManager>;
  let repoint: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = makeManager();
    repoint = vi.fn();
  });

  // ── profiles ─────────────────────────────────────────────────────
  describe("profiles", () => {
    it("list delegates to manager.listProfiles", async () => {
      const p = makeProfile();
      manager.listProfiles.mockResolvedValue([p]);
      const caller = createCaller(makeCtx(manager, repoint));
      const result = await caller.worker.profiles.list();
      expect(manager.listProfiles).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: "hf-a40", target: "runpod" });
    });

    it("create delegates to manager.createProfile with the input", async () => {
      const p = makeProfile();
      manager.createProfile.mockResolvedValue(p);
      const caller = createCaller(makeCtx(manager, repoint));
      const result = await caller.worker.profiles.create({
        name: "hf-a40",
        target: "runpod",
        image: "ghcr.io/x/worker:1",
        token_policy: "generate",
        idle_timeout_minutes: 30
      });
      expect(manager.createProfile).toHaveBeenCalledWith({
        name: "hf-a40",
        target: "runpod",
        image: "ghcr.io/x/worker:1",
        spec: undefined,
        token_policy: "generate",
        idle_timeout_minutes: 30,
        max_lifetime_minutes: undefined
      });
      expect(result).toMatchObject({ name: "hf-a40" });
    });

    it("delete delegates to manager.deleteProfile", async () => {
      manager.deleteProfile.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx(manager, repoint));
      const result = await caller.worker.profiles.delete({ name: "hf-a40" });
      expect(manager.deleteProfile).toHaveBeenCalledWith("hf-a40");
      expect(result).toEqual({ ok: true });
    });
  });

  // ── instances ────────────────────────────────────────────────────
  describe("instances", () => {
    it("list delegates to manager.list", async () => {
      manager.list.mockResolvedValue([makeInstance()]);
      const caller = createCaller(makeCtx(manager, repoint));
      const result = await caller.worker.instances.list();
      expect(manager.list).toHaveBeenCalled();
      expect(result[0]).toMatchObject({ id: "i1", status: "running" });
    });
  });

  // ── provision / stop / status / reconcile ────────────────────────
  it("provision delegates to manager.provision(profileName)", async () => {
    manager.provision.mockResolvedValue(makeInstance());
    const caller = createCaller(makeCtx(manager, repoint));
    const result = await caller.worker.provision({ profileName: "hf-a40" });
    expect(manager.provision).toHaveBeenCalledWith("hf-a40");
    expect(result).toMatchObject({ id: "i1" });
  });

  it("stop delegates to manager.stop(id)", async () => {
    manager.stop.mockResolvedValue(makeInstance({ status: "stopped" }));
    const caller = createCaller(makeCtx(manager, repoint));
    const result = await caller.worker.stop({ id: "i1" });
    expect(manager.stop).toHaveBeenCalledWith("i1");
    expect(result).toMatchObject({ status: "stopped" });
  });

  it("stopAll delegates to manager.stopAll", async () => {
    manager.stopAll.mockResolvedValue(undefined);
    const caller = createCaller(makeCtx(manager, repoint));
    const result = await caller.worker.stopAll();
    expect(manager.stopAll).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("status delegates to manager.status(id)", async () => {
    manager.status.mockResolvedValue("running");
    const caller = createCaller(makeCtx(manager, repoint));
    const result = await caller.worker.status({ id: "i1" });
    expect(manager.status).toHaveBeenCalledWith("i1");
    expect(result).toEqual({ status: "running" });
  });

  it("reconcile delegates to manager.reconcile and returns its summary", async () => {
    manager.reconcile.mockResolvedValue({
      orphans: [{ target: "runpod", providerRef: "pod-x", status: "running" }],
      liveCount: 2,
      estimatedCostUsd: 3.5
    });
    const caller = createCaller(makeCtx(manager, repoint));
    const result = await caller.worker.reconcile();
    expect(manager.reconcile).toHaveBeenCalled();
    expect(result).toMatchObject({ liveCount: 2, estimatedCostUsd: 3.5 });
    expect(result.orphans).toHaveLength(1);
  });

  // ── attach / detach (bridge wiring) ──────────────────────────────
  describe("attach", () => {
    it("calls manager.attach then re-points the bridge with the connection", async () => {
      const conn: WorkerConnection = {
        wsUrl: "wss://pod-1-7777.proxy.runpod.net",
        token: "tok-1"
      };
      manager.attach.mockResolvedValue(conn);
      const caller = createCaller(makeCtx(manager, repoint));
      const result = await caller.worker.attach({ id: "i1" });
      expect(manager.attach).toHaveBeenCalledWith("i1");
      expect(repoint).toHaveBeenCalledWith(conn);
      expect(result).toMatchObject({
        wsUrl: "wss://pod-1-7777.proxy.runpod.net",
        token: "tok-1"
      });
    });
  });

  describe("detach", () => {
    it("calls manager.detach then re-points the bridge back at the default", async () => {
      manager.detach.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx(manager, repoint));
      const result = await caller.worker.detach();
      expect(manager.detach).toHaveBeenCalled();
      expect(repoint).toHaveBeenCalledWith(null);
      expect(result).toEqual({ ok: true });
    });
  });

  it("rejects unauthenticated callers", async () => {
    const ctx = makeCtx(manager, repoint);
    ctx.userId = null;
    const caller = createCaller(ctx);
    await expect(caller.worker.instances.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });

  // ── lifecycle / status procedures ────────────────────────────────
  describe("apiKeyStatus / resume / terminate / health", () => {
    it("apiKeyStatus delegates to manager.apiKeyStatus", async () => {
      const status = { runpod: true, vast: false };
      manager.apiKeyStatus.mockResolvedValue(status);
      const caller = createCaller(makeCtx(manager, repoint));
      await expect(caller.worker.apiKeyStatus()).resolves.toEqual(status);
      expect(manager.apiKeyStatus).toHaveBeenCalled();
    });

    it("resume delegates to manager.resume with the id", async () => {
      const inst = makeInstance({ status: "running" });
      manager.resume.mockResolvedValue(inst);
      const caller = createCaller(makeCtx(manager, repoint));
      const result = await caller.worker.resume({ id: "i1" });
      expect(manager.resume).toHaveBeenCalledWith("i1");
      expect(result).toMatchObject({ id: "i1", status: "running" });
    });

    it("terminate delegates to manager.terminate with the id", async () => {
      manager.terminate.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx(manager, repoint));
      await caller.worker.terminate({ id: "i1" });
      expect(manager.terminate).toHaveBeenCalledWith("i1");
    });

    it("health probes the worker's connection via probeWorkerHealth", async () => {
      const connection = { wsUrl: "wss://x", token: "t" };
      manager.connectionInfo.mockResolvedValue(connection);
      const probe = vi.fn().mockResolvedValue({ healthy: true });
      const caller = createCaller(makeCtx(manager, repoint, probe));
      const result = await caller.worker.health({ id: "i1" });
      expect(manager.connectionInfo).toHaveBeenCalledWith("i1");
      expect(probe).toHaveBeenCalledWith(connection);
      expect(result).toEqual({ healthy: true });
    });

    it("health fails INTERNAL_SERVER_ERROR when no probe is wired", async () => {
      manager.connectionInfo.mockResolvedValue({ wsUrl: "wss://x", token: "t" });
      const caller = createCaller(makeCtx(manager, repoint));
      await expect(caller.worker.health({ id: "i1" })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR"
      });
    });
  });

  // ── server-wiring guards ─────────────────────────────────────────
  describe("configuration guards", () => {
    it("fails INTERNAL_SERVER_ERROR when the worker manager is not wired", async () => {
      const caller = createCaller(makeCtx(undefined, repoint));
      await expect(caller.worker.instances.list()).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR"
      });
    });

    it.each([
      ["zero", 0],
      ["negative", -5]
    ])("rejects a %s idle_timeout_minutes at the schema", async (_label, value) => {
      manager.createProfile.mockResolvedValue(makeProfile());
      const caller = createCaller(makeCtx(manager, repoint));
      await expect(
        caller.worker.profiles.create({
          name: "x",
          target: "runpod",
          image: "img:1",
          token_policy: "generate",
          idle_timeout_minutes: value
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(manager.createProfile).not.toHaveBeenCalled();
    });
  });
});
