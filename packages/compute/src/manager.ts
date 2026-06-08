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
