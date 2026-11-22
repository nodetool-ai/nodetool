// Provider lifecycle harness: the real WorkerManager, the real RunPod and Vast
// providers and their real HTTP transports, run against a stateful fake of
// both provider APIs (fixtures/fake-provider-api.ts) installed as the global
// `fetch`. Only the database accessors and the clock are replaced.
//
// Each case drives provision → poll → reap end to end and asserts the exact
// provider calls, so a change to a request path, a body field, the poll loop or
// the teardown order fails here. Keyless and deterministic: the fake answers
// every call, timers are faked, and a request the fake does not route fails
// the case through `api.unexpected`.

import type {
  CreateWorkerInstanceInput,
  CreateWorkerProfileInput,
  WorkerInstance,
  WorkerInstancePatch,
  WorkerProfile,
} from "@nodetool-ai/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkerManager, type WorkerManagerDeps } from "../manager.js";
import { runReaperOnce } from "../reaper.js";
import {
  createFakeProviderApi,
  type FakeProviderApi,
} from "./fixtures/fake-provider-api.js";

const START = Date.parse("2026-01-05T10:00:00.000Z");
const MINUTE = 60_000;

/** In-memory profiles, instances and settings standing in for the database. */
function makeStore() {
  const profiles = new Map<string, WorkerProfile>();
  const instances = new Map<string, WorkerInstance>();
  const settings = new Map<string, string>();
  let seq = 0;
  const deps = {
    createWorkerProfile: async (input: CreateWorkerProfileInput) => {
      const now = new Date().toISOString();
      const profile: WorkerProfile = {
        id: `profile-${++seq}`,
        name: input.name,
        target: input.target,
        image: input.image,
        spec: input.spec ?? {},
        token_policy: input.token_policy,
        idle_timeout_minutes: input.idle_timeout_minutes ?? null,
        max_lifetime_minutes: input.max_lifetime_minutes ?? null,
        created_at: now,
        updated_at: now,
      };
      profiles.set(profile.name, profile);
      return profile;
    },
    getWorkerProfile: async (name: string) => profiles.get(name) ?? null,
    listWorkerProfiles: async () => [...profiles.values()],
    deleteWorkerProfile: async (name: string) => {
      profiles.delete(name);
    },
    createWorkerInstance: async (input: CreateWorkerInstanceInput) => {
      const now = new Date().toISOString();
      const instance: WorkerInstance = {
        id: `instance-${++seq}`,
        profile_name: input.profile_name,
        target: input.target,
        provider_ref: input.provider_ref,
        ws_url: input.ws_url,
        token: input.token ?? null,
        status: "provisioning",
        attached_to: input.attached_to ?? null,
        created_at: now,
        last_activity_at: now,
        estimated_cost_usd: input.estimated_cost_usd ?? null,
      };
      instances.set(instance.id, instance);
      return instance;
    },
    getWorkerInstance: async (id: string) => instances.get(id) ?? null,
    listWorkerInstances: async () => [...instances.values()],
    updateWorkerInstance: async (id: string, patch: WorkerInstancePatch) => {
      const existing = instances.get(id);
      if (!existing) throw new Error(`Worker instance not found: ${id}`);
      const updated = { ...existing, ...patch };
      instances.set(id, updated);
      return updated;
    },
    getSetting: async (key: string) => settings.get(key) ?? null,
    setSetting: async (key: string, value: string) => {
      settings.set(key, value);
    },
    deleteSetting: async (key: string) => {
      settings.delete(key);
    },
  } satisfies Partial<WorkerManagerDeps>;
  return { profiles, instances, deps };
}

const SECRETS: Record<string, string> = {
  RUNPOD_API_KEY: "fixture-runpod-key",
  VAST_API_KEY: "fixture-vast-key",
};

function makeHarness() {
  const api = createFakeProviderApi();
  vi.stubGlobal("fetch", api.fetch);
  const store = makeStore();
  // The real provider factory runs: only storage, secrets and stock reads are
  // replaced.
  const deps: Partial<WorkerManagerDeps> = {
    ...store.deps,
    getSecret: async (key: string) => SECRETS[key] ?? null,
    fetchGpuAvailability: async () => [],
  };
  const manager = new WorkerManager(deps);
  const reap = (atMs: number) =>
    runReaperOnce({
      manager,
      getProfile: store.deps.getWorkerProfile,
      now: () => atMs,
    });
  return { api, store, manager, reap };
}

/**
 * Settle a promise whose code sleeps between polls by advancing the fake clock
 * one poll interval at a time. Fails closed after a bounded number of steps.
 */
async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  const tracked = promise.finally(() => {
    done = true;
  });
  // Surface a rejection to the caller, not as an unhandled rejection.
  tracked.catch(() => {});
  for (let step = 0; step < 200 && !done; step++) {
    await vi.advanceTimersByTimeAsync(5_000);
  }
  if (!done) throw new Error("settle: operation did not finish");
  return tracked;
}

function expectNoUnexpected(api: FakeProviderApi): void {
  expect(api.unexpected).toEqual([]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(START);
  delete process.env.RUNPOD_REST_BASE_URL;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("provider lifecycle harness — RunPod", () => {
  it("provisions, polls to RUNNING, idle-stops, resumes and TTL-terminates a pod", async () => {
    const { api, store, manager, reap } = makeHarness();
    await manager.createProfile({
      name: "hf-a40",
      target: "runpod",
      image: "ghcr.io/nodetool-ai/nodetool-worker:fixture",
      spec: { gpu: "NVIDIA A40", disk: 60 },
      token_policy: "generate",
      idle_timeout_minutes: 30,
      max_lifetime_minutes: 240,
    });

    const instance = await settle(manager.provision("hf-a40"));

    // Create, then three reads: PROVISIONING, STARTING, RUNNING.
    expect(api.calls()).toEqual([
      "runpod POST pods",
      "runpod GET pods/fxpod1",
      "runpod GET pods/fxpod1",
      "runpod GET pods/fxpod1",
    ]);
    const token = instance.token as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(api.requests[0].body).toEqual({
      name: "hf-a40",
      image: "ghcr.io/nodetool-ai/nodetool-worker:fixture",
      env: { HF_HOME: "/workspace/huggingface", NODETOOL_WORKER_TOKEN: token },
      gpu: { id: "NVIDIA A40", count: 1, minCudaVersion: "13.0" },
      ports: ["7777/http"],
      disk: 30,
      mounts: { persistent: { size: 60, path: "/workspace" } },
    });
    expect(instance).toMatchObject({
      status: "running",
      target: "runpod",
      provider_ref: "fxpod1",
      ws_url: "wss://fxpod1-7777.proxy.runpod.net",
      estimated_cost_usd: 0.39,
    });

    expect(await manager.status(instance.id)).toBe("running");

    // Inside both windows: the reaper leaves the pod alone.
    api.requests.length = 0;
    await reap(START + 29 * MINUTE);
    expect(api.calls()).toEqual([]);

    // Past the 30-minute idle window: pause, keep the volume.
    await reap(START + 31 * MINUTE);
    expect(api.calls()).toEqual(["runpod POST pods/fxpod1/action"]);
    expect(api.requests[0].body).toEqual({ action: "stop" });
    expect(api.pods.get("fxpod1")?.status).toBe("EXITED");
    expect(store.instances.get(instance.id)?.status).toBe("stopped");

    // Resume polls the pod back to RUNNING and adopts its endpoint.
    api.requests.length = 0;
    vi.setSystemTime(START + 60 * MINUTE);
    const resumed = await settle(manager.resume(instance.id));
    expect(api.calls()).toEqual([
      "runpod POST pods/fxpod1/action",
      "runpod GET pods/fxpod1",
      "runpod GET pods/fxpod1",
    ]);
    expect(api.requests[0].body).toEqual({ action: "start" });
    expect(resumed.status).toBe("running");

    // Past the 240-minute hard TTL: destroy the pod and its volume.
    api.requests.length = 0;
    await reap(START + 241 * MINUTE);
    expect(api.calls()).toEqual(["runpod DELETE pods/fxpod1"]);
    expect(api.pods.size).toBe(0);
    expect(store.instances.get(instance.id)?.status).toBe("terminated");

    // Nothing is left billing and nothing is untracked.
    api.requests.length = 0;
    await expect(manager.reconcile()).resolves.toEqual({
      orphans: [],
      liveCount: 0,
      estimatedCostUsd: 0,
    });
    expect(api.calls()).toEqual(["runpod GET pods"]);
    expectNoUnexpected(api);
  });

  it("deletes a pod that fails while polling and persists no instance", async () => {
    const { api, store, manager } = makeHarness();
    await manager.createProfile({
      name: "cpu",
      target: "runpod",
      image: "ghcr.io/nodetool-ai/nodetool-worker:fixture",
      spec: {},
      token_policy: "fixed",
    });

    const provisioning = manager.provision("cpu");
    // Let the create and the first read land, then fail the pod.
    await vi.advanceTimersByTimeAsync(0);
    api.failPod("fxpod1", "ERROR");
    await expect(settle(provisioning)).rejects.toThrow(
      "Pod fxpod1 reached terminal status ERROR"
    );

    expect(api.calls()).toEqual([
      "runpod POST pods",
      "runpod GET pods/fxpod1",
      "runpod GET pods/fxpod1",
      "runpod DELETE pods/fxpod1",
    ]);
    expect(api.requests[0].body).toMatchObject({
      cpu: { id: "cpu5c", vcpuCount: 4 },
    });
    expect(api.pods.size).toBe(0);
    expect(store.instances.size).toBe(0);
    expectNoUnexpected(api);
  });

  it("reconcile marks a pod killed out of band stopped and surfaces an untracked pod", async () => {
    const { api, store, manager } = makeHarness();
    await manager.createProfile({
      name: "hf-a40",
      target: "runpod",
      image: "ghcr.io/nodetool-ai/nodetool-worker:fixture",
      spec: { gpu: "NVIDIA A40" },
      token_policy: "fixed",
    });
    const instance = await settle(manager.provision("hf-a40"));

    api.killPodOutOfBand("fxpod1");
    api.addOutOfBandPod("console-pod");

    await expect(manager.reconcile()).resolves.toEqual({
      orphans: [
        { target: "runpod", providerRef: "console-pod", status: "running" },
      ],
      liveCount: 0,
      estimatedCostUsd: 0,
    });
    expect(store.instances.get(instance.id)?.status).toBe("stopped");
    expectNoUnexpected(api);
  });
});

describe("provider lifecycle harness — Vast.ai", () => {
  it("searches, launches, polls to running and TTL-terminates an instance", async () => {
    const { api, store, manager, reap } = makeHarness();
    await manager.createProfile({
      name: "vast-4090",
      target: "vast",
      image: "ghcr.io/nodetool-ai/nodetool-worker:fixture",
      spec: { gpu: "RTX 4090", disk: 80 },
      token_policy: "generate",
      max_lifetime_minutes: 120,
    });

    const instance = await settle(manager.provision("vast-4090"));

    // Search, launch, then three reads: loading, loading, running.
    expect(api.calls()).toEqual([
      "vast PUT bundles/",
      "vast PUT asks/4242/",
      "vast GET instances/9001/",
      "vast GET instances/9001/",
      "vast GET instances/9001/",
    ]);
    expect(api.requests[0].body).toEqual({
      q: {
        rentable: { eq: true },
        verified: { eq: true },
        rented: { eq: false },
        disk_space: { gte: 80 },
        gpu_name: { eq: "RTX 4090" },
      },
      order: [["dph_total", "asc"]],
    });
    const token = instance.token as string;
    expect(api.requests[1].body).toEqual({
      image: "ghcr.io/nodetool-ai/nodetool-worker:fixture",
      label: "vast-4090",
      disk: 80,
      env: {
        NODETOOL_WORKER_TOKEN: token,
        HF_HOME: "/workspace/huggingface",
        "-p 7777:7777": "1",
      },
      runtype: "args",
    });
    expect(instance).toMatchObject({
      status: "running",
      target: "vast",
      provider_ref: "9001",
      ws_url: "ws://198.51.100.23:41021",
      estimated_cost_usd: 0.42,
    });

    // No idle window on this profile, so only the TTL fires.
    api.requests.length = 0;
    await reap(START + 119 * MINUTE);
    expect(api.calls()).toEqual([]);
    await reap(START + 121 * MINUTE);
    expect(api.calls()).toEqual(["vast DELETE instances/9001/"]);
    expect(api.vastInstances.size).toBe(0);
    expect(store.instances.get(instance.id)?.status).toBe("terminated");
    expectNoUnexpected(api);
  });

  it("destroys an instance that exits while polling and persists no instance", async () => {
    const { api, store, manager } = makeHarness();
    await manager.createProfile({
      name: "vast-4090",
      target: "vast",
      image: "ghcr.io/nodetool-ai/nodetool-worker:fixture",
      spec: { gpu: "RTX 4090" },
      token_policy: "fixed",
    });

    const provisioning = manager.provision("vast-4090");
    await vi.advanceTimersByTimeAsync(0);
    api.failVastInstance(9001, "exited");
    await expect(settle(provisioning)).rejects.toThrow(
      "Vast instance 9001 reached terminal status exited"
    );

    expect(api.calls()).toEqual([
      "vast PUT bundles/",
      "vast PUT asks/4242/",
      "vast GET instances/9001/",
      "vast GET instances/9001/",
      "vast DELETE instances/9001/",
    ]);
    expect(api.vastInstances.size).toBe(0);
    expect(store.instances.size).toBe(0);
    expectNoUnexpected(api);
  });
});

describe("provider lifecycle harness — fake API", () => {
  it("rejects a request with the wrong key and records it as unexpected", async () => {
    const api = createFakeProviderApi();
    const response = await api.fetch("https://api.runpod.io/v2/pods", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(response.status).toBe(401);
    expect(api.unexpected.map((r) => r.call)).toEqual(["runpod GET pods"]);
  });

  it("records an unrouted request as unexpected", async () => {
    const api = createFakeProviderApi();
    const response = await api.fetch("https://api.runpod.io/v2/endpoints", {
      headers: { Authorization: "Bearer fixture-runpod-key" },
    });
    expect(response.status).toBe(404);
    expect(api.unexpected.map((r) => r.call)).toEqual([
      "runpod GET endpoints",
    ]);
  });
});
