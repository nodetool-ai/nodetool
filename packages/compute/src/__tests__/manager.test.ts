import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkerManager } from "../manager.js";
import type { WorkerManagerDeps } from "../manager.js";
import type {
  ProviderInstance,
  ProvisionResult,
  WorkerProvider,
  WorkerSpec,
  WorkerStatus,
} from "../providers/types.js";

// ---------------------------------------------------------------------------
// Fakes — an in-memory models layer and a recording WorkerProvider, injected
// into the manager so its lifecycle can be exercised without a real DB or a
// real RunPod/Vast account.
// ---------------------------------------------------------------------------

interface FakeProfile {
  id: string;
  name: string;
  target: string;
  image: string;
  spec: Record<string, unknown>;
  token_policy: string;
  idle_timeout_minutes: number | null;
  max_lifetime_minutes: number | null;
  created_at: string;
  updated_at: string;
}

interface FakeInstance {
  id: string;
  profile_name: string;
  target: string;
  provider_ref: string;
  ws_url: string;
  token: string | null;
  status: string;
  attached_to: string | null;
  created_at: string;
  last_activity_at: string;
  estimated_cost_usd: number | null;
}

function makeFakeModels() {
  const profiles = new Map<string, FakeProfile>();
  const instances = new Map<string, FakeInstance>();
  let seq = 0;
  const id = () => `id-${++seq}`;

  return {
    profiles,
    instances,
    deps: {
      createWorkerProfile: vi.fn(async (input: {
        name: string;
        target: string;
        image: string;
        spec?: Record<string, unknown>;
        token_policy: string;
        idle_timeout_minutes?: number | null;
        max_lifetime_minutes?: number | null;
      }) => {
        if (profiles.has(input.name)) {
          throw new Error(`Worker profile already exists: ${input.name}`);
        }
        const now = new Date().toISOString();
        const profile: FakeProfile = {
          id: id(),
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
      }),
      getWorkerProfile: vi.fn(async (name: string) => profiles.get(name) ?? null),
      listWorkerProfiles: vi.fn(async () => [...profiles.values()]),
      deleteWorkerProfile: vi.fn(async (name: string) => {
        profiles.delete(name);
      }),
      createWorkerInstance: vi.fn(async (input: {
        profile_name: string;
        target: string;
        provider_ref: string;
        ws_url: string;
        token?: string | null;
        estimated_cost_usd?: number | null;
      }) => {
        const now = new Date().toISOString();
        const instance: FakeInstance = {
          id: id(),
          profile_name: input.profile_name,
          target: input.target,
          provider_ref: input.provider_ref,
          ws_url: input.ws_url,
          token: input.token ?? null,
          status: "provisioning",
          attached_to: null,
          created_at: now,
          last_activity_at: now,
          estimated_cost_usd: input.estimated_cost_usd ?? null,
        };
        instances.set(instance.id, instance);
        return instance;
      }),
      getWorkerInstance: vi.fn(async (instanceId: string) =>
        instances.get(instanceId) ?? null
      ),
      listWorkerInstances: vi.fn(async (options?: { status?: string }) => {
        const all = [...instances.values()];
        return options?.status
          ? all.filter((i) => i.status === options.status)
          : all;
      }),
      updateWorkerInstance: vi.fn(async (
        instanceId: string,
        patch: Partial<FakeInstance>
      ) => {
        const existing = instances.get(instanceId);
        if (!existing) {
          throw new Error(`Worker instance not found: ${instanceId}`);
        }
        const updated = { ...existing, ...patch };
        instances.set(instanceId, updated);
        return updated;
      }),
    },
  };
}

class FakeProvider implements WorkerProvider {
  public readonly provisioned: WorkerSpec[] = [];
  public readonly stopped: string[] = [];
  public readonly resumed: string[] = [];
  public readonly terminated: string[] = [];
  public statuses: Record<string, WorkerStatus> = {};
  public liveList: ProviderInstance[] = [];
  /** Hourly cost the provider reports back from provision(), if any. */
  public costUsd: number | undefined;
  /** ws URL resume() reports back (defaults to a fresh one). */
  public resumeWsUrl = "wss://pod-resumed-7777.proxy.runpod.net";

  async provision(spec: WorkerSpec): Promise<ProvisionResult> {
    this.provisioned.push(spec);
    return {
      providerRef: `pod-${this.provisioned.length}`,
      wsUrl: "wss://pod-1-7777.proxy.runpod.net",
      token: spec.token,
      status: "running",
      costUsd: this.costUsd,
    };
  }

  async status(ref: string): Promise<WorkerStatus> {
    return this.statuses[ref] ?? "running";
  }

  async stop(ref: string): Promise<void> {
    this.stopped.push(ref);
  }

  async resume(ref: string): Promise<ProvisionResult> {
    this.resumed.push(ref);
    return {
      providerRef: ref,
      wsUrl: this.resumeWsUrl,
      status: "running",
      costUsd: this.costUsd,
    };
  }

  async terminate(ref: string): Promise<void> {
    this.terminated.push(ref);
  }

  async list(): Promise<ProviderInstance[]> {
    return this.liveList;
  }
}

function makeFakeSettings() {
  const store = new Map<string, string>();
  return {
    store,
    deps: {
      getSetting: vi.fn(async (key: string) => store.get(key) ?? null),
      setSetting: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      deleteSetting: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
}

function makeManager(overrides: Partial<WorkerManagerDeps> = {}) {
  const models = makeFakeModels();
  const settings = makeFakeSettings();
  const provider = new FakeProvider();
  const getSecret = vi.fn(async () => "default-api-key" as string | null);
  const deps: WorkerManagerDeps = {
    ...models.deps,
    ...settings.deps,
    getSecret,
    providerFactory: (_target, _apiKey) => provider,
    ...overrides,
  };
  const manager = new WorkerManager(deps);
  return { manager, models, settings, provider, getSecret, deps };
}

const PROFILE_INPUT = {
  name: "hf-a40",
  target: "runpod" as const,
  image: "ghcr.io/nodetool-ai/nodetool-worker:0.7.3",
  spec: { gpu: "A40", vcpu: 8, env: { FOO: "bar" } },
  token_policy: "generate" as const,
  idle_timeout_minutes: 30,
  max_lifetime_minutes: 240,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorkerManager — profile CRUD delegation", () => {
  it("createProfile delegates to the model accessor", async () => {
    const { manager, models } = makeManager();
    const profile = await manager.createProfile(PROFILE_INPUT);

    expect(models.deps.createWorkerProfile).toHaveBeenCalledWith(PROFILE_INPUT);
    expect(profile.name).toBe("hf-a40");
  });

  it("listProfiles delegates to the model accessor", async () => {
    const { manager, models } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const list = await manager.listProfiles();

    expect(models.deps.listWorkerProfiles).toHaveBeenCalled();
    expect(list.map((p) => p.name)).toEqual(["hf-a40"]);
  });

  it("deleteProfile delegates to the model accessor", async () => {
    const { manager, models } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    await manager.deleteProfile("hf-a40");

    expect(models.deps.deleteWorkerProfile).toHaveBeenCalledWith("hf-a40");
    expect(await manager.listProfiles()).toEqual([]);
  });
});

describe("WorkerManager — provision", () => {
  it("looks up the profile, generates a token, provisions, and persists a running instance", async () => {
    const { manager, models, provider } = makeManager();
    await manager.createProfile(PROFILE_INPUT);

    const instance = await manager.provision("hf-a40");

    // Provider was called with a spec derived from the profile.
    expect(provider.provisioned).toHaveLength(1);
    const spec = provider.provisioned[0];
    expect(spec.name).toBe("hf-a40");
    expect(spec.image).toBe(PROFILE_INPUT.image);
    expect(spec.target).toBe("runpod");
    expect(spec.gpu).toBe("A40");
    expect(spec.vcpu).toBe(8);
    expect(spec.env).toEqual({ FOO: "bar" });
    // token_policy "generate" → a token was generated and passed through.
    expect(spec.token).toBeTruthy();

    // An instance row was created and transitioned provisioning → running.
    expect(models.deps.createWorkerInstance).toHaveBeenCalled();
    expect(models.deps.updateWorkerInstance).toHaveBeenCalled();
    expect(instance.status).toBe("running");
    expect(instance.provider_ref).toBe("pod-1");
    expect(instance.ws_url).toBe("wss://pod-1-7777.proxy.runpod.net");
    expect(instance.token).toBe(spec.token);
  });

  it("normalizes the legacy worker image name at provision time", async () => {
    const { manager, provider } = makeManager();
    // A profile saved before the image rename carries the non-existent
    // ghcr.io/nodetool-ai/worker package, which RunPod can't pull.
    await manager.createProfile({
      ...PROFILE_INPUT,
      image: "ghcr.io/nodetool-ai/worker:latest"
    });

    await manager.provision("hf-a40");

    expect(provider.provisioned[0].image).toBe(
      "ghcr.io/nodetool-ai/nodetool-worker:latest"
    );
  });

  it("does not generate a token when the policy is not 'generate'", async () => {
    const { manager, provider } = makeManager();
    await manager.createProfile({ ...PROFILE_INPUT, token_policy: "fixed" });

    await manager.provision("hf-a40");

    expect(provider.provisioned[0].token).toBeUndefined();
  });

  it("persists the provider-reported hourly cost on the instance", async () => {
    const { manager, models, provider } = makeManager();
    provider.costUsd = 0.39;
    await manager.createProfile(PROFILE_INPUT);

    const instance = await manager.provision("hf-a40");

    // The cost the provider reported was passed through to instance creation.
    expect(models.deps.createWorkerInstance).toHaveBeenCalledWith(
      expect.objectContaining({ estimated_cost_usd: 0.39 })
    );
    expect(instance.estimated_cost_usd).toBe(0.39);
  });

  it("throws when the profile does not exist", async () => {
    const { manager } = makeManager();
    await expect(manager.provision("missing")).rejects.toThrow(/missing/);
  });

  it("terminates the just-provisioned provider resource when the DB create fails, then re-throws the DB error", async () => {
    const dbError = new Error("createWorkerInstance failed: constraint");
    const createWorkerInstance = vi.fn(async () => {
      throw dbError;
    });
    const { manager, provider } = makeManager({ createWorkerInstance });
    await manager.createProfile(PROFILE_INPUT);

    await expect(manager.provision("hf-a40")).rejects.toThrow(dbError);

    // The provider made a billable pod; with the DB write failed it would be
    // untracked, so it must be DESTROYED (not merely paused) to stop all cost.
    expect(provider.terminated).toEqual(["pod-1"]);
    expect(provider.stopped).toEqual([]);
  });

  it("terminates the just-provisioned provider resource when the status update fails, then re-throws", async () => {
    const dbError = new Error("updateWorkerInstance failed");
    const updateWorkerInstance = vi.fn(async () => {
      throw dbError;
    });
    const { manager, provider } = makeManager({ updateWorkerInstance });
    await manager.createProfile(PROFILE_INPUT);

    await expect(manager.provision("hf-a40")).rejects.toThrow(dbError);

    expect(provider.terminated).toEqual(["pod-1"]);
  });

  it("re-throws the original DB error even when the compensating terminate() also fails", async () => {
    const dbError = new Error("createWorkerInstance failed");
    const createWorkerInstance = vi.fn(async () => {
      throw dbError;
    });
    const { manager, provider } = makeManager({ createWorkerInstance });
    provider.terminate = vi.fn(async () => {
      throw new Error("terminate also failed");
    });
    await manager.createProfile(PROFILE_INPUT);

    // The original DB error is surfaced, not masked by the terminate() failure.
    await expect(manager.provision("hf-a40")).rejects.toThrow(dbError);
  });
});

describe("WorkerManager — stop / stopAll", () => {
  it("stop tears down the provider resource and marks the instance stopped", async () => {
    const { manager, models, provider } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const instance = await manager.provision("hf-a40");

    const stopped = await manager.stop(instance.id);

    expect(provider.stopped).toEqual([instance.provider_ref]);
    expect(stopped.status).toBe("stopped");
    expect(models.instances.get(instance.id)?.status).toBe("stopped");
  });

  it("stopAll stops every non-stopped instance", async () => {
    const { manager, provider } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const a = await manager.provision("hf-a40");
    const b = await manager.provision("hf-a40");
    await manager.stop(a.id);
    provider.stopped.length = 0;

    await manager.stopAll();

    // a was already stopped; only b should be torn down now.
    expect(provider.stopped).toEqual([b.provider_ref]);
  });
});

describe("WorkerManager — resume / terminate", () => {
  it("resume brings a stopped instance back to running with its fresh ws URL", async () => {
    const { manager, models, provider } = makeManager();
    provider.resumeWsUrl = "wss://pod-new-7777.proxy.runpod.net";
    await manager.createProfile(PROFILE_INPUT);
    const instance = await manager.provision("hf-a40");
    await manager.stop(instance.id);

    const resumed = await manager.resume(instance.id);

    expect(provider.resumed).toEqual([instance.provider_ref]);
    expect(resumed.status).toBe("running");
    expect(resumed.ws_url).toBe("wss://pod-new-7777.proxy.runpod.net");
    expect(models.instances.get(instance.id)?.ws_url).toBe(
      "wss://pod-new-7777.proxy.runpod.net"
    );
  });

  it("terminate destroys the provider resource and marks the instance terminated", async () => {
    const { manager, models, provider } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const instance = await manager.provision("hf-a40");

    const terminated = await manager.terminate(instance.id);

    expect(provider.terminated).toEqual([instance.provider_ref]);
    expect(provider.stopped).toEqual([]); // not a pause
    expect(terminated.status).toBe("terminated");
    expect(models.instances.get(instance.id)?.status).toBe("terminated");
  });

  it("terminate drops the active-worker pointer when it referenced the instance", async () => {
    const { manager } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const instance = await manager.provision("hf-a40");
    await manager.attach(instance.id);

    await manager.terminate(instance.id);

    expect(await manager.getActiveWorker()).toBeNull();
  });
});

describe("WorkerManager — provision spec mapping", () => {
  it("forwards the profile's spec.disk as the worker volume size", async () => {
    const { manager, provider } = makeManager();
    await manager.createProfile({ ...PROFILE_INPUT, spec: { gpu: "A40", disk: 250 } });

    await manager.provision("hf-a40");

    expect(provider.provisioned[0]?.disk).toBe(250);
  });
});

describe("WorkerManager — list / status", () => {
  it("list reads the registry", async () => {
    const { manager, models } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    await manager.provision("hf-a40");

    const list = await manager.list();

    expect(models.deps.listWorkerInstances).toHaveBeenCalled();
    expect(list).toHaveLength(1);
  });

  it("status refreshes the instance from the provider", async () => {
    const { manager, provider } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const instance = await manager.provision("hf-a40");
    provider.statuses[instance.provider_ref] = "stopped";

    const status = await manager.status(instance.id);

    expect(status).toBe("stopped");
  });

  it("status throws when the instance is unknown", async () => {
    const { manager } = makeManager();
    await expect(manager.status("nope")).rejects.toThrow(/nope/);
  });
});

describe("WorkerManager — API key resolution", () => {
  it("loads the RunPod key from the secret store per target", async () => {
    const getSecret = vi.fn(async (key: string) =>
      key === "RUNPOD_API_KEY" ? "secret-runpod-key" : null
    );
    const factory = vi.fn((_target: string, _apiKey: string) => new FakeProvider());
    const { manager } = makeManager({
      getSecret,
      providerFactory: factory,
    });
    await manager.createProfile(PROFILE_INPUT);

    await manager.provision("hf-a40");

    expect(getSecret).toHaveBeenCalledWith("RUNPOD_API_KEY", expect.anything());
    expect(factory).toHaveBeenCalledWith("runpod", "secret-runpod-key");
  });

  it("falls back to the environment when the secret store has no key", async () => {
    const getSecret = vi.fn(async () => null as string | null);
    const factory = vi.fn((_target: string, _apiKey: string) => new FakeProvider());
    const prev = process.env.RUNPOD_API_KEY;
    process.env.RUNPOD_API_KEY = "env-runpod-key";
    try {
      const { manager } = makeManager({ getSecret, providerFactory: factory });
      await manager.createProfile(PROFILE_INPUT);

      await manager.provision("hf-a40");

      expect(factory).toHaveBeenCalledWith("runpod", "env-runpod-key");
    } finally {
      if (prev === undefined) {
        delete process.env.RUNPOD_API_KEY;
      } else {
        process.env.RUNPOD_API_KEY = prev;
      }
    }
  });

  it("throws when no API key is available", async () => {
    const getSecret = vi.fn(async () => null as string | null);
    const prev = process.env.RUNPOD_API_KEY;
    delete process.env.RUNPOD_API_KEY;
    try {
      const { manager } = makeManager({ getSecret });
      await manager.createProfile(PROFILE_INPUT);
      await expect(manager.provision("hf-a40")).rejects.toThrow(
        /RUNPOD_API_KEY/
      );
    } finally {
      if (prev !== undefined) {
        process.env.RUNPOD_API_KEY = prev;
      }
    }
  });
});

describe("WorkerManager — attach / detach / getActiveWorker", () => {
  const ACTIVE_KEY = "active_worker_instance_id";

  it("attach reads the instance, persists the pointer, marks it attached, and returns the connection info", async () => {
    const { manager, models, settings } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const instance = await manager.provision("hf-a40");

    const conn = await manager.attach(instance.id);

    // The settings pointer was written to the instance id.
    expect(settings.deps.setSetting).toHaveBeenCalledWith(
      ACTIVE_KEY,
      instance.id
    );
    expect(settings.store.get(ACTIVE_KEY)).toBe(instance.id);

    // The instance was marked attached.
    expect(models.instances.get(instance.id)?.status).toBe("attached");

    // The caller receives the connection info to apply to the bridge.
    expect(conn).toEqual({ wsUrl: instance.ws_url, token: instance.token });
  });

  it("attach refreshes last_activity_at so a slow-to-provision worker is not reaped as idle on the next pass", async () => {
    const { manager, models } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const instance = await manager.provision("hf-a40");

    // Simulate a worker whose provision + attach took longer than its idle
    // window: its last_activity_at is still pinned to creation time, far in
    // the past, and no bridge frame has touched it yet.
    const stale = "2000-01-01T00:00:00.000Z";
    const row = models.instances.get(instance.id)!;
    row.last_activity_at = stale;

    const before = Date.now();
    await manager.attach(instance.id);

    const attached = models.instances.get(instance.id)!;
    expect(attached.last_activity_at).not.toBe(stale);
    expect(new Date(attached.last_activity_at).getTime()).toBeGreaterThanOrEqual(
      before
    );
  });

  it("attach throws when the instance is unknown", async () => {
    const { manager } = makeManager();
    await expect(manager.attach("nope")).rejects.toThrow(/nope/);
  });

  it("detach clears the pointer and marks the previously-attached instance running", async () => {
    const { manager, models, settings } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const instance = await manager.provision("hf-a40");
    await manager.attach(instance.id);

    await manager.detach();

    expect(settings.deps.deleteSetting).toHaveBeenCalledWith(ACTIVE_KEY);
    expect(settings.store.has(ACTIVE_KEY)).toBe(false);
    expect(models.instances.get(instance.id)?.status).toBe("running");
  });

  it("detach is a no-op when nothing is attached", async () => {
    const { manager, settings } = makeManager();

    await expect(manager.detach()).resolves.toBeUndefined();
    expect(settings.deps.deleteSetting).toHaveBeenCalledWith(ACTIVE_KEY);
  });

  it("getActiveWorker returns the attached instance", async () => {
    const { manager } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const instance = await manager.provision("hf-a40");
    await manager.attach(instance.id);

    const active = await manager.getActiveWorker();

    expect(active?.id).toBe(instance.id);
    expect(active?.status).toBe("attached");
  });

  it("getActiveWorker returns null when nothing is attached", async () => {
    const { manager } = makeManager();
    expect(await manager.getActiveWorker()).toBeNull();
  });
});

describe("WorkerManager — reconcile", () => {
  it("marks running/attached instances absent from the provider's live list as stopped", async () => {
    const { manager, models, provider } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const live = await manager.provision("hf-a40"); // running, provider_ref pod-1
    const dead = await manager.provision("hf-a40"); // running, provider_ref pod-2
    await manager.attach(dead.id); // now attached

    // Provider reports only pod-1 as live; pod-2 died out-of-band.
    provider.liveList = [{ providerRef: live.provider_ref, status: "running" }];

    await manager.reconcile();

    // The instance still live in the provider is untouched.
    expect(models.instances.get(live.id)?.status).toBe("running");
    // The instance missing from the live list is marked stopped.
    expect(models.instances.get(dead.id)?.status).toBe("stopped");
  });

  it("does not touch already-stopped rows", async () => {
    const { manager, models, provider } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const instance = await manager.provision("hf-a40");
    await manager.stop(instance.id); // status stopped, provider torn down
    provider.stopped.length = 0;

    // Provider reports nothing live.
    provider.liveList = [];

    await manager.reconcile();

    // The already-stopped row was not re-updated through teardown.
    expect(provider.stopped).toEqual([]);
    expect(models.instances.get(instance.id)?.status).toBe("stopped");
  });

  it("surfaces provider-live refs not tracked in the DB as orphans", async () => {
    const { manager, provider } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const tracked = await manager.provision("hf-a40"); // pod-1

    // Provider reports the tracked pod plus an untracked one.
    provider.liveList = [
      { providerRef: tracked.provider_ref, status: "running" },
      { providerRef: "pod-orphan", status: "running" },
    ];

    const summary = await manager.reconcile();

    expect(summary.orphans).toEqual([
      { target: "runpod", providerRef: "pod-orphan", status: "running" },
    ]);
  });

  it("returns a live-count and estimated-cost summary", async () => {
    const { manager, models, provider } = makeManager();
    await manager.createProfile(PROFILE_INPUT);
    const a = await manager.provision("hf-a40"); // pod-1
    const b = await manager.provision("hf-a40"); // pod-2
    // Give the instances an estimated cost.
    await models.deps.updateWorkerInstance(a.id, { estimated_cost_usd: 1.5 });
    await models.deps.updateWorkerInstance(b.id, { estimated_cost_usd: 2 });

    // Both pods live in the provider.
    provider.liveList = [
      { providerRef: a.provider_ref, status: "running" },
      { providerRef: b.provider_ref, status: "running" },
    ];

    const summary = await manager.reconcile();

    expect(summary.liveCount).toBe(2);
    expect(summary.estimatedCostUsd).toBeCloseTo(3.5);
  });

  it("sums the cost auto-populated at provision time", async () => {
    const { manager, provider } = makeManager();
    provider.costUsd = 0.5;
    await manager.createProfile(PROFILE_INPUT);
    const a = await manager.provision("hf-a40"); // pod-1
    const b = await manager.provision("hf-a40"); // pod-2

    provider.liveList = [
      { providerRef: a.provider_ref, status: "running" },
      { providerRef: b.provider_ref, status: "running" },
    ];

    const summary = await manager.reconcile();

    // No manual cost injection — reconcile sees the cost stored on provision.
    expect(summary.estimatedCostUsd).toBeCloseTo(1.0);
  });

  describe("apiKeyStatus", () => {
    it("reports keys available from the secret store", async () => {
      const { manager } = makeManager(); // getSecret returns a value for any key
      await expect(manager.apiKeyStatus()).resolves.toEqual({
        runpod: true,
        vast: true,
      });
    });

    it("falls back to the environment, so an env-only key is not reported missing", async () => {
      // The store has nothing; this is the exact case that false-warned in the
      // UI before — the key lives only in process.env.
      const getSecret = vi.fn(async () => null as string | null);
      const { manager } = makeManager({ getSecret });
      const prevRunpod = process.env.RUNPOD_API_KEY;
      const prevVast = process.env.VAST_API_KEY;
      process.env.RUNPOD_API_KEY = "env-key";
      delete process.env.VAST_API_KEY;
      try {
        const status = await manager.apiKeyStatus();
        expect(status.runpod).toBe(true); // resolved from env
        expect(status.vast).toBe(false); // neither store nor env
      } finally {
        if (prevRunpod === undefined) delete process.env.RUNPOD_API_KEY;
        else process.env.RUNPOD_API_KEY = prevRunpod;
        if (prevVast === undefined) delete process.env.VAST_API_KEY;
        else process.env.VAST_API_KEY = prevVast;
      }
    });
  });
});
