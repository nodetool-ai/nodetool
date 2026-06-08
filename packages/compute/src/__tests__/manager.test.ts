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
  public statuses: Record<string, WorkerStatus> = {};
  public liveList: ProviderInstance[] = [];

  async provision(spec: WorkerSpec): Promise<ProvisionResult> {
    this.provisioned.push(spec);
    return {
      providerRef: `pod-${this.provisioned.length}`,
      wsUrl: "wss://pod-1-7777.proxy.runpod.net",
      token: spec.token,
      status: "running",
    };
  }

  async status(ref: string): Promise<WorkerStatus> {
    return this.statuses[ref] ?? "running";
  }

  async stop(ref: string): Promise<void> {
    this.stopped.push(ref);
  }

  async list(): Promise<ProviderInstance[]> {
    return this.liveList;
  }
}

function makeManager(overrides: Partial<WorkerManagerDeps> = {}) {
  const models = makeFakeModels();
  const provider = new FakeProvider();
  const getSecret = vi.fn(async () => "default-api-key" as string | null);
  const deps: WorkerManagerDeps = {
    ...models.deps,
    getSecret,
    providerFactory: (_target, _apiKey) => provider,
    ...overrides,
  };
  const manager = new WorkerManager(deps);
  return { manager, models, provider, getSecret, deps };
}

const PROFILE_INPUT = {
  name: "hf-a40",
  target: "runpod" as const,
  image: "ghcr.io/nodetool-ai/worker:0.7.3",
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

  it("does not generate a token when the policy is not 'generate'", async () => {
    const { manager, provider } = makeManager();
    await manager.createProfile({ ...PROFILE_INPUT, token_policy: "fixed" });

    await manager.provision("hf-a40");

    expect(provider.provisioned[0].token).toBeUndefined();
  });

  it("throws when the profile does not exist", async () => {
    const { manager } = makeManager();
    await expect(manager.provision("missing")).rejects.toThrow(/missing/);
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
