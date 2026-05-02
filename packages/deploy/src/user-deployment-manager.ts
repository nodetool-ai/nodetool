/**
 * User-scoped deployment orchestrator.
 *
 * Each user owns their own set of deployments (`user_id` partitions every
 * row in `nodetool_deployments`). This module wraps the existing
 * `DeploymentManager` so a single Docker host can host many users, each
 * deploying to backends like RunPod with their own credentials, quotas, and
 * audit log.
 *
 * Isolation guarantees:
 *
 *   1. Ownership — every operation is scoped by `user_id`. Cross-user reads
 *      and writes are impossible because the SQL layer always filters by
 *      `user_id` (see `Deployment.findByName` / `listForUser`).
 *   2. Credentials — provider credentials are encrypted at rest with a
 *      per-user derived key (PBKDF2 with `user_id` as salt). They are
 *      decrypted, injected into `process.env` for the duration of a single
 *      deployer call, and removed in a `finally` block. Concurrent calls are
 *      serialized per-process so credentials never leak across users.
 *   3. Quotas — each user has a quota record that caps deployment count,
 *      worker counts, GPU counts, allowed providers, and allowed GPU types.
 *      Quotas are enforced before delegating to the underlying deployer.
 *   4. Audit — every successful or failed action is recorded in the
 *      `nodetool_deployment_audit` table partitioned by `user_id`.
 */

import { DeploymentAudit } from "@nodetool-ai/models";
import { StateManager } from "./state.js";
import {
  DeploymentManager,
  type DeployerFactory,
  type DeploymentInfo
} from "./manager.js";
import {
  type AnyDeployment,
  type RunPodDeployment
} from "./deployment-config.js";
import { DbDeploymentStore } from "./db-deployment-store.js";
import { DbDeploymentSettingsStore } from "./db-deployment-settings-store.js";
import type { DeploymentQuota } from "./deployment-quota.js";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.deploy.user-deployment-manager");

// ============================================================================
// Errors
// ============================================================================

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class ProviderNotAllowedError extends Error {
  constructor(provider: string) {
    super(`Provider ${JSON.stringify(provider)} is not allowed for this user`);
    this.name = "ProviderNotAllowedError";
  }
}

// ============================================================================
// Per-process env mutex
// ============================================================================

/**
 * Concurrent deployer calls would race on `process.env` — we mutate it
 * briefly to inject per-user credentials. A single process-wide queue keeps
 * that mutation invisible to anyone else.
 */
class EnvMutex {
  private chain: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(() => fn());
    this.chain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}
const envMutex = new EnvMutex();

// ============================================================================
// Quota enforcement
// ============================================================================

/**
 * Check a deployment object against a user's quota. Returns a list of
 * violations; an empty list means the deployment is acceptable.
 */
export function findQuotaViolations(
  deployment: AnyDeployment,
  quota: DeploymentQuota
): string[] {
  const violations: string[] = [];

  if (
    quota.allowed_providers.length > 0 &&
    !quota.allowed_providers.includes(deployment.type)
  ) {
    violations.push(
      `provider ${deployment.type} not in allowed list [${quota.allowed_providers.join(", ")}]`
    );
  }

  if (deployment.type === "runpod") {
    const d = deployment as RunPodDeployment;
    if (d.workers_max > quota.max_workers_per_endpoint) {
      violations.push(
        `workers_max (${d.workers_max}) exceeds quota (${quota.max_workers_per_endpoint})`
      );
    }
    const requestedGpu = d.gpu_count ?? 0;
    if (requestedGpu > quota.max_gpu_count_per_endpoint) {
      violations.push(
        `gpu_count (${requestedGpu}) exceeds quota (${quota.max_gpu_count_per_endpoint})`
      );
    }
    if (quota.allowed_gpu_types.length > 0) {
      const disallowed = d.gpu_types.filter(
        (g) => !quota.allowed_gpu_types.includes(g)
      );
      if (disallowed.length > 0) {
        violations.push(
          `gpu_types [${disallowed.join(", ")}] not in allowed list [${quota.allowed_gpu_types.join(", ")}]`
        );
      }
    }
  }

  return violations;
}

function assertQuotaOk(deployment: AnyDeployment, quota: DeploymentQuota): void {
  const violations = findQuotaViolations(deployment, quota);
  if (violations.length > 0) {
    throw new QuotaExceededError(violations.join("; "));
  }
}

// ============================================================================
// UserDeploymentManager
// ============================================================================

export interface UserDeploymentManagerOptions {
  userId: string;
  store: DbDeploymentStore;
  settings: DbDeploymentSettingsStore;
  deployerFactories: Record<string, DeployerFactory>;
  /** Override for tests; defaults to the DB-backed audit logger. */
  audit?: (input: {
    user_id: string;
    deployment_name?: string;
    actor?: string;
    action: string;
    status: "ok" | "error";
    error?: string;
    meta?: Record<string, unknown>;
  }) => Promise<unknown>;
}

/**
 * Per-user view of the deployment system. All operations are validated for
 * ownership and quota before delegating to the underlying `DeploymentManager`
 * with the user's credentials in `process.env`.
 */
export class UserDeploymentManager {
  readonly userId: string;
  private store: DbDeploymentStore;
  private settings: DbDeploymentSettingsStore;
  private deployerFactories: Record<string, DeployerFactory>;
  private auditFn: NonNullable<UserDeploymentManagerOptions["audit"]>;

  constructor(opts: UserDeploymentManagerOptions) {
    if (!opts.userId) {
      throw new Error("UserDeploymentManager requires a non-empty userId");
    }
    this.userId = opts.userId;
    this.store = opts.store;
    this.settings = opts.settings;
    this.deployerFactories = opts.deployerFactories;
    this.auditFn =
      opts.audit ??
      ((input) =>
        DeploymentAudit.append({
          user_id: input.user_id,
          deployment_name: input.deployment_name,
          actor: input.actor,
          action: input.action,
          status: input.status,
          error: input.error,
          meta: input.meta
        }));
  }

  // -------------------------------------------------------------------------
  // Public CRUD
  // -------------------------------------------------------------------------

  async listDeployments(): Promise<DeploymentInfo[]> {
    const config = await this.store.loadConfig();
    const stateManager = this.makeStateManager();
    const mgr = new DeploymentManager(
      config,
      stateManager,
      this.deployerFactories
    );
    return mgr.listDeployments();
  }

  /**
   * Add or replace a deployment for this user. Validates quota before
   * persisting. Returns the saved deployment.
   */
  async upsertDeployment(
    name: string,
    deployment: AnyDeployment
  ): Promise<AnyDeployment> {
    const quota = await this.settings.getQuota(this.userId);
    assertQuotaOk(deployment, quota);

    const existing = await this.store.getDeployment(name);
    if (!existing) {
      const count = (await this.store.listNames()).length;
      if (count >= quota.max_deployments) {
        throw new QuotaExceededError(
          `user ${this.userId} has reached max_deployments=${quota.max_deployments}`
        );
      }
    }
    const saved = await this.store.upsertDeployment(name, deployment);
    await this.audit({
      action: existing ? "deployment.update" : "deployment.create",
      deployment_name: name,
      status: "ok"
    });
    return saved;
  }

  async removeDeployment(name: string): Promise<void> {
    const ok = await this.store.removeDeployment(name);
    if (!ok) {
      throw new Error(`Deployment ${JSON.stringify(name)} not found for user`);
    }
    await this.audit({
      action: "deployment.remove",
      deployment_name: name,
      status: "ok"
    });
  }

  // -------------------------------------------------------------------------
  // Deployer lifecycle (plan / apply / status / logs / destroy)
  // -------------------------------------------------------------------------

  async plan(name: string): Promise<Record<string, unknown>> {
    return this.runScoped("deployment.plan", name, async (mgr) => mgr.plan(name));
  }

  async apply(
    name: string,
    opts: { dryRun?: boolean } = {}
  ): Promise<Record<string, unknown>> {
    return this.runScoped("deployment.apply", name, async (mgr, deployment) => {
      const quota = await this.settings.getQuota(this.userId);
      assertQuotaOk(deployment, quota);
      return mgr.apply(name, opts);
    });
  }

  async status(name: string): Promise<Record<string, unknown>> {
    return this.runScoped("deployment.status", name, async (mgr) =>
      mgr.status(name)
    );
  }

  async logs(
    name: string,
    opts: { service?: string; follow?: boolean; tail?: number } = {}
  ): Promise<string> {
    return this.runScoped<string>("deployment.logs", name, async (mgr) =>
      mgr.logs(name, opts)
    );
  }

  async destroy(name: string): Promise<Record<string, unknown>> {
    return this.runScoped("deployment.destroy", name, async (mgr) =>
      mgr.destroy(name)
    );
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private makeStateManager(): StateManager {
    // The DB store does not use file-based state — but DeploymentManager's
    // contract still expects a StateManager. We adapt by wrapping the DB
    // store in a thin compatibility shim.
    return makeDbStateManager(this.store) as unknown as StateManager;
  }

  /**
   * Wrap a deployer call: load config → enforce quota → inject credentials
   * into `process.env` → delegate to `DeploymentManager` → restore env →
   * audit. Concurrency-safe across the whole process.
   */
  private async runScoped<T = Record<string, unknown>>(
    action: string,
    deploymentName: string,
    fn: (
      mgr: DeploymentManager,
      deployment: AnyDeployment
    ) => Promise<T>
  ): Promise<T> {
    const config = await this.store.loadConfig();
    const deployment = config.deployments[deploymentName];
    if (!deployment) {
      const err = new Error(
        `Deployment ${JSON.stringify(deploymentName)} not found for user ${this.userId}`
      );
      await this.audit({
        action,
        deployment_name: deploymentName,
        status: "error",
        error: err.message
      });
      throw err;
    }

    const credentials = await this.settings.loadCredentials(this.userId);

    return envMutex.run(async () => {
      const previous: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(credentials)) {
        previous[k] = process.env[k];
        process.env[k] = v;
      }
      previous["NODETOOL_USER_ID"] = process.env["NODETOOL_USER_ID"];
      process.env["NODETOOL_USER_ID"] = this.userId;

      try {
        const stateManager = this.makeStateManager();
        const mgr = new DeploymentManager(
          config,
          stateManager,
          this.deployerFactories
        );
        const result = await fn(mgr, deployment);
        await this.audit({
          action,
          deployment_name: deploymentName,
          status: "ok"
        });
        return result;
      } catch (err) {
        await this.audit({
          action,
          deployment_name: deploymentName,
          status: "error",
          error: err instanceof Error ? err.message : String(err)
        });
        throw err;
      } finally {
        for (const [k, v] of Object.entries(previous)) {
          if (v === undefined) {
            delete process.env[k];
          } else {
            process.env[k] = v;
          }
        }
      }
    });
  }

  private async audit(
    input: Omit<Parameters<NonNullable<UserDeploymentManagerOptions["audit"]>>[0], "user_id">
  ): Promise<void> {
    try {
      await this.auditFn({ ...input, user_id: this.userId });
    } catch (err) {
      log.warn(`audit write failed for user ${this.userId}`, err);
    }
  }
}

// ============================================================================
// DB-backed StateManager shim
// ============================================================================

/**
 * `DeploymentManager` calls `stateManager.readState(name)` and
 * `stateManager.getAllStates()` from `manager.listDeployments`. The DB store
 * exposes the same shape, so we adapt directly without touching the existing
 * `StateManager` class.
 */
function makeDbStateManager(store: DbDeploymentStore) {
  return {
    readState: (name: string) => store.readState(name),
    writeState: (name: string, updates: Record<string, unknown>) =>
      store.writeState(name, updates),
    updateDeploymentStatus: (name: string, status: string) =>
      store.updateDeploymentStatus(name, status),
    getAllStates: () => store.getAllStates()
  };
}
