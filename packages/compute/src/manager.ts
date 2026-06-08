// WorkerManager — the orchestration layer over the per-target providers.
//
// It owns the profiles→instances identity model: profiles are declarative
// presets persisted in `worker_profiles`, instances are ephemeral,
// billing-sensitive handles persisted in `worker_instances`. All state lives in
// the DB (via the models accessors) — never only in memory — so the UI, CLI,
// and reaper share a single source of truth and a forgotten GPU pod is always
// recoverable from the registry.
//
// The manager resolves a per-target `WorkerProvider` (RunPod pod today, Vast in
// Group F), loading the provider's API key from the secret store with an env
// fallback. Every model accessor, the secret getter, and the provider factory
// are injectable so the lifecycle can be unit-tested with fakes.

import { randomBytes } from "node:crypto";

import {
  createWorkerInstance as realCreateWorkerInstance,
  createWorkerProfile as realCreateWorkerProfile,
  deleteWorkerProfile as realDeleteWorkerProfile,
  getSecret as realGetSecret,
  getWorkerInstance as realGetWorkerInstance,
  getWorkerProfile as realGetWorkerProfile,
  listWorkerInstances as realListWorkerInstances,
  listWorkerProfiles as realListWorkerProfiles,
  updateWorkerInstance as realUpdateWorkerInstance,
  Setting,
  type CreateWorkerInstanceInput,
  type CreateWorkerProfileInput,
  type ListWorkerInstancesOptions,
  type WorkerInstance,
  type WorkerInstancePatch,
  type WorkerProfile,
} from "@nodetool-ai/models";

import { RunpodPodProvider } from "./providers/runpod.js";
import type {
  WorkerProvider,
  WorkerSpec,
  WorkerStatus,
  WorkerTarget,
} from "./providers/types.js";

/** Local desktop user id used for secret-store reads (shared with the CLI). */
const LOCAL_USER_ID = "1";

/**
 * Settings key holding the id of the worker instance the local NodeTool
 * instance has attached to. Singleton for the desktop MVP — any NodeTool
 * instance reads it to re-point its Python bridge.
 */
const ACTIVE_WORKER_KEY = "active_worker_instance_id";

/** Secret-store key holding each target's API key. */
const API_KEY_SECRET: Record<WorkerTarget, string> = {
  runpod: "RUNPOD_API_KEY",
  vast: "VAST_API_KEY",
};

/**
 * The connection info a caller applies to the Python bridge when attaching to
 * a worker — the worker's WebSocket URL and its bearer token (if any).
 */
export interface WorkerConnection {
  wsUrl: string;
  token: string | null;
}

/**
 * A provider-live worker that the DB registry doesn't track — a "true orphan"
 * billing out-of-band. Surfaced by `reconcile()` for one-click stop-all.
 */
export interface WorkerOrphan {
  target: WorkerTarget;
  providerRef: string;
  status: WorkerStatus;
}

/**
 * Result of an orphan reconcile pass: the untracked live workers, the number of
 * tracked instances still live, and their summed estimated cost.
 */
export interface ReconcileSummary {
  orphans: WorkerOrphan[];
  liveCount: number;
  estimatedCostUsd: number;
}

/** Construct the concrete provider for a target. Vast is added in Group F. */
function defaultProviderFactory(
  target: WorkerTarget,
  apiKey: string
): WorkerProvider {
  switch (target) {
    case "runpod":
      return new RunpodPodProvider(apiKey);
    default:
      throw new Error(`Unsupported worker target: ${target}`);
  }
}

/**
 * The dependencies the manager delegates to — the models accessors, the secret
 * getter, and a provider factory. Defaults bind to the real `@nodetool-ai/models`
 * implementations; tests inject in-memory fakes.
 */
export interface WorkerManagerDeps {
  createWorkerProfile: (
    input: CreateWorkerProfileInput
  ) => Promise<WorkerProfile>;
  getWorkerProfile: (name: string) => Promise<WorkerProfile | null>;
  listWorkerProfiles: () => Promise<WorkerProfile[]>;
  deleteWorkerProfile: (name: string) => Promise<void>;
  createWorkerInstance: (
    input: CreateWorkerInstanceInput
  ) => Promise<WorkerInstance>;
  getWorkerInstance: (id: string) => Promise<WorkerInstance | null>;
  listWorkerInstances: (
    options?: ListWorkerInstancesOptions
  ) => Promise<WorkerInstance[]>;
  updateWorkerInstance: (
    id: string,
    patch: WorkerInstancePatch
  ) => Promise<WorkerInstance>;
  getSecret: (
    key: string,
    userId?: string,
    defaultValue?: string
  ) => Promise<string | null>;
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  deleteSetting: (key: string) => Promise<void>;
  providerFactory: (target: WorkerTarget, apiKey: string) => WorkerProvider;
}

function defaultDeps(): WorkerManagerDeps {
  return {
    createWorkerProfile: realCreateWorkerProfile,
    getWorkerProfile: realGetWorkerProfile,
    listWorkerProfiles: realListWorkerProfiles,
    deleteWorkerProfile: realDeleteWorkerProfile,
    createWorkerInstance: realCreateWorkerInstance,
    getWorkerInstance: realGetWorkerInstance,
    listWorkerInstances: realListWorkerInstances,
    updateWorkerInstance: realUpdateWorkerInstance,
    getSecret: realGetSecret,
    getSetting: async (key) => {
      const setting = await Setting.find(LOCAL_USER_ID, key);
      return setting ? setting.getValue() : null;
    },
    setSetting: async (key, value) => {
      await Setting.upsert({ userId: LOCAL_USER_ID, key, value });
    },
    deleteSetting: async (key) => {
      await Setting.deleteSetting(LOCAL_USER_ID, key);
    },
    providerFactory: defaultProviderFactory,
  };
}

export class WorkerManager {
  private readonly deps: WorkerManagerDeps;

  constructor(deps: Partial<WorkerManagerDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  // --- Profiles -----------------------------------------------------------

  createProfile(input: CreateWorkerProfileInput): Promise<WorkerProfile> {
    return this.deps.createWorkerProfile(input);
  }

  listProfiles(): Promise<WorkerProfile[]> {
    return this.deps.listWorkerProfiles();
  }

  deleteProfile(name: string): Promise<void> {
    return this.deps.deleteWorkerProfile(name);
  }

  // --- Instance lifecycle -------------------------------------------------

  /**
   * Provision a worker from a profile: resolve the provider, generate a token
   * when the profile's policy requires it, call the provider, and persist the
   * resulting instance transitioning `provisioning → running`.
   */
  async provision(profileName: string): Promise<WorkerInstance> {
    const profile = await this.deps.getWorkerProfile(profileName);
    if (!profile) {
      throw new Error(`Worker profile not found: ${profileName}`);
    }

    const target = profile.target as WorkerTarget;
    const provider = await this.resolveProvider(target);
    const token =
      profile.token_policy === "generate" ? generateToken() : undefined;
    const spec = specFromProfile(profile, target, token);

    const result = await provider.provision(spec);

    const instance = await this.deps.createWorkerInstance({
      profile_name: profile.name,
      target,
      provider_ref: result.providerRef,
      ws_url: result.wsUrl,
      token: result.token ?? null,
    });

    return this.deps.updateWorkerInstance(instance.id, {
      status: result.status,
    });
  }

  /** Tear down a worker's provider resource and mark its instance stopped. */
  async stop(instanceId: string): Promise<WorkerInstance> {
    const instance = await this.requireInstance(instanceId);
    const provider = await this.resolveProvider(
      instance.target as WorkerTarget
    );
    await provider.stop(instance.provider_ref);
    return this.deps.updateWorkerInstance(instance.id, { status: "stopped" });
  }

  /** Stop every instance that is not already stopped. */
  async stopAll(): Promise<void> {
    const instances = await this.deps.listWorkerInstances();
    for (const instance of instances) {
      if (instance.status === "stopped") {
        continue;
      }
      await this.stop(instance.id);
    }
  }

  /** Return all registered instances. */
  list(): Promise<WorkerInstance[]> {
    return this.deps.listWorkerInstances();
  }

  /** Refresh an instance's status from its provider. */
  async status(instanceId: string): Promise<WorkerStatus> {
    const instance = await this.requireInstance(instanceId);
    const provider = await this.resolveProvider(
      instance.target as WorkerTarget
    );
    return provider.status(instance.provider_ref);
  }

  /**
   * Reconcile the DB registry against what each provider reports live. Tracked
   * instances that are `running`/`attached` but absent from their provider's
   * live list died or were killed out-of-band — mark them `stopped`. Live
   * provider workers with no matching tracked instance are true orphans,
   * surfaced (with a live-count and estimated-cost summary) so the cost guard
   * can offer a one-click stop-all. Already-`stopped` rows are left untouched.
   */
  async reconcile(): Promise<ReconcileSummary> {
    const instances = await this.deps.listWorkerInstances();
    const targets = [
      ...new Set(instances.map((i) => i.target as WorkerTarget)),
    ];

    const orphans: WorkerOrphan[] = [];
    let liveCount = 0;
    let estimatedCostUsd = 0;

    for (const target of targets) {
      const provider = await this.resolveProvider(target);
      const live = await provider.list();
      const liveRefs = new Set(live.map((l) => l.providerRef));
      const tracked = instances.filter((i) => i.target === target);
      const trackedRefs = new Set(tracked.map((i) => i.provider_ref));

      // Tracked-but-dead: running/attached instances missing from the live
      // list died/were killed out-of-band. The survivors count toward the
      // live summary; already-stopped rows are skipped entirely.
      for (const instance of tracked) {
        if (instance.status !== "running" && instance.status !== "attached") {
          continue;
        }
        if (liveRefs.has(instance.provider_ref)) {
          liveCount += 1;
          estimatedCostUsd += instance.estimated_cost_usd ?? 0;
        } else {
          await this.deps.updateWorkerInstance(instance.id, {
            status: "stopped",
          });
        }
      }

      // Live-but-untracked: provider workers with no matching instance row.
      for (const entry of live) {
        if (!trackedRefs.has(entry.providerRef)) {
          orphans.push({
            target,
            providerRef: entry.providerRef,
            status: entry.status,
          });
        }
      }
    }

    return { orphans, liveCount, estimatedCostUsd };
  }

  // --- Attach pointer -----------------------------------------------------

  /**
   * Adopt an instance as the active worker: persist the singleton pointer,
   * mark the instance `attached`, and return its connection info for the
   * caller to apply to the Python bridge (`bridge.setTarget`). The manager
   * stays free of a runtime dependency — re-pointing is the caller's job.
   */
  async attach(instanceId: string): Promise<WorkerConnection> {
    const instance = await this.requireInstance(instanceId);
    await this.deps.setSetting(ACTIVE_WORKER_KEY, instance.id);
    await this.deps.updateWorkerInstance(instance.id, { status: "attached" });
    return { wsUrl: instance.ws_url, token: instance.token };
  }

  /**
   * Release the active worker: clear the pointer and revert the
   * previously-attached instance to `running`. The caller points the bridge
   * back at its env/stdio default.
   */
  async detach(): Promise<void> {
    const active = await this.getActiveWorker();
    await this.deps.deleteSetting(ACTIVE_WORKER_KEY);
    if (active && active.status === "attached") {
      await this.deps.updateWorkerInstance(active.id, { status: "running" });
    }
  }

  /** Return the currently-attached instance, or null when none is attached. */
  async getActiveWorker(): Promise<WorkerInstance | null> {
    const id = await this.deps.getSetting(ACTIVE_WORKER_KEY);
    if (!id) {
      return null;
    }
    return this.deps.getWorkerInstance(id);
  }

  // --- Internals ----------------------------------------------------------

  private async requireInstance(instanceId: string): Promise<WorkerInstance> {
    const instance = await this.deps.getWorkerInstance(instanceId);
    if (!instance) {
      throw new Error(`Worker instance not found: ${instanceId}`);
    }
    return instance;
  }

  private async resolveProvider(target: WorkerTarget): Promise<WorkerProvider> {
    const apiKey = await this.loadApiKey(target);
    return this.deps.providerFactory(target, apiKey);
  }

  /**
   * Load a target's API key from the secret store, falling back to the
   * environment when the keychain is unreachable (headless/sandboxed). Mirrors
   * the resolution the deleted `runpod-worker.ts` script used.
   */
  private async loadApiKey(target: WorkerTarget): Promise<string> {
    const key = API_KEY_SECRET[target];
    if (!key) {
      throw new Error(`No API key mapping for worker target: ${target}`);
    }

    const fromStore = await this.deps.getSecret(key, LOCAL_USER_ID);
    if (fromStore) {
      return fromStore;
    }

    const fromEnv = process.env[key];
    if (fromEnv) {
      return fromEnv;
    }

    throw new Error(
      `${key} not found in the secret store or environment. ` +
        `Store it with: nodetool secrets store ${key}`
    );
  }
}

/** Build a provision spec from a profile's declarative fields. */
function specFromProfile(
  profile: WorkerProfile,
  target: WorkerTarget,
  token: string | undefined
): WorkerSpec {
  const spec = profile.spec ?? {};
  return {
    name: profile.name,
    image: profile.image,
    target,
    gpu: typeof spec.gpu === "string" ? spec.gpu : undefined,
    vcpu: typeof spec.vcpu === "number" ? spec.vcpu : undefined,
    env: isStringRecord(spec.env) ? spec.env : undefined,
    token,
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

/** Generate a high-entropy worker bearer token. */
function generateToken(): string {
  return randomBytes(32).toString("hex");
}
