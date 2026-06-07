/**
 * User-scoped deployment orchestrator (orchestration only).
 *
 * Each user owns their own set of deployments (`user_id` partitions every row
 * in `nodetool_deployments`). This module wraps the underlying
 * `DeploymentManager` so a single host can serve many users, each deploying to
 * backends like RunPod with their own credentials, quotas, and audit log.
 *
 * Isolation guarantees:
 *
 *   1. Ownership — every operation is scoped by `user_id`. Cross-user reads
 *      and writes are impossible because the SQL layer always filters by
 *      `user_id` (see `Deployment.findByName` / `listForUser`).
 *   2. Credentials — provider credentials live in the per-user `Secret` store
 *      and are decrypted PER CALL, only for the keys the deployment's provider
 *      declares (least-privilege). The decrypted values are held solely in the
 *      per-operation `DeploymentContext` (`ctx.credentials`) and reach child
 *      processes through an explicitly-built child env (`runScopedCommand`) or
 *      are passed to in-process HTTP providers as explicit arguments. They are
 *      NEVER written to `process.env`, NEVER persisted to a host auth file, and
 *      NEVER logged or recorded in audit metadata. Ephemeral credential files
 *      (docker config, gcloud config, SA key, SSH key) live in a call-scoped
 *      `scratchDir` that is removed in a `finally` on both success and failure.
 *   3. Quotas — each user has a quota record that caps deployment count,
 *      worker counts, GPU counts, allowed providers, and allowed GPU types.
 *      Quotas are enforced before delegating to the underlying deployer.
 *   4. Audit — every successful or failed action is recorded in the
 *      `nodetool_deployment_audit` table partitioned by `user_id`. Credential
 *      values are never included in audit meta.
 */

import { DeploymentAudit, Secret } from "@nodetool-ai/models";
import { StateManager } from "./state.js";
import {
  DeploymentManager,
  type DeployerFactory,
  type DeploymentInfo
} from "./manager.js";
import { type AnyDeployment } from "./deployment-config.js";
import { DbDeploymentStore } from "./db-deployment-store.js";
import { DbDeploymentSettingsStore } from "./db-deployment-settings-store.js";
import {
  assertQuotaOk,
  QuotaExceededError,
  ProviderNotAllowedError
} from "./deployment-quota.js";
import {
  resolveProviderCredentials,
  validateDeploymentCredentials,
  type SecretResolver
} from "./provider-credentials.js";
import {
  withDeploymentContext,
  type DeploymentContext
} from "./deployment-context.js";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.deploy.user-deployment-manager");

// Re-export the quota errors so existing importers of this module keep working
// after the enforcement logic moved into deployment-quota.ts.
export { QuotaExceededError, ProviderNotAllowedError };

// ============================================================================
// Default secret resolver
// ============================================================================

/**
 * DB-only secret resolver: look up a single decrypted secret value for a user
 * from the `Secret` model, returning `null` when absent.
 *
 * This deliberately does NOT call `getSecret` from @nodetool-ai/models —
 * `getSecret` falls back to `process.env[key]` and caches the host value in a
 * shared module-level map, which would re-leak host env across users on a
 * multi-user server. Reading credentials from the per-user secret store only is
 * what keeps tenants isolated.
 */
const defaultSecretResolver: SecretResolver = async (key, userId) => {
  const secret = await Secret.find(userId, key);
  return secret ? secret.getDecryptedValue() : null;
};

// ============================================================================
// UserDeploymentManager
// ============================================================================

export interface UserDeploymentManagerOptions {
  userId: string;
  store: DbDeploymentStore;
  settings: DbDeploymentSettingsStore;
  deployerFactories: Record<string, DeployerFactory>;
  /**
   * Override for tests; defaults to the DB-only resolver backed by the per-user
   * `Secret` store. MUST never source from `process.env` on the multi-user
   * path.
   */
  secretResolver?: SecretResolver;
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
 * ownership and quota, then delegated to the underlying `DeploymentManager`
 * with a fresh per-operation `DeploymentContext` carrying the user's decrypted
 * credentials and a call-scoped scratch dir. No process-global state is ever
 * mutated.
 */
export class UserDeploymentManager {
  readonly userId: string;
  private store: DbDeploymentStore;
  private settings: DbDeploymentSettingsStore;
  private deployerFactories: Record<string, DeployerFactory>;
  private secretResolver: SecretResolver;
  private auditFn: NonNullable<UserDeploymentManagerOptions["audit"]>;

  constructor(opts: UserDeploymentManagerOptions) {
    if (!opts.userId) {
      throw new Error("UserDeploymentManager requires a non-empty userId");
    }
    this.userId = opts.userId;
    this.store = opts.store;
    this.settings = opts.settings;
    this.deployerFactories = opts.deployerFactories;
    this.secretResolver = opts.secretResolver ?? defaultSecretResolver;
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

  /**
   * List deployments for this user. No deployer is constructed, so no provider
   * credentials are resolved — the context carries empty credentials.
   */
  async listDeployments(): Promise<DeploymentInfo[]> {
    const config = await this.store.loadConfig();
    const stateManager = this.makeStateManager();
    return withDeploymentContext(
      { userId: this.userId, credentials: {} },
      async (ctx) => {
        const mgr = new DeploymentManager(
          config,
          stateManager,
          this.deployerFactories,
          ctx
        );
        return mgr.listDeployments();
      }
    );
  }

  /**
   * Add or replace a deployment for this user. Validates quota before
   * persisting. Returns the saved deployment.
   *
   * A concurrent config write that loses the compare-and-swap surfaces as a
   * `DeploymentConflictError` from the store; it propagates to the caller.
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
    return this.runScoped("deployment.plan", name, async (mgr) =>
      mgr.plan(name)
    );
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
   * Wrap a deployer call:
   *   load config → find deployment → resolve the provider's declared secret
   *   keys (least-privilege) → fail if a required key is missing → create a
   *   call-scoped scratch dir + build the per-operation context → delegate to
   *   `DeploymentManager` (which threads `ctx` into the deployer factory) →
   *   audit → tear the scratch dir down in a `finally`.
   *
   * `process.env` is never read for credentials and never mutated. No global
   * locks: every call gets its own isolated context.
   */
  private async runScoped<T = Record<string, unknown>>(
    action: string,
    deploymentName: string,
    fn: (mgr: DeploymentManager, deployment: AnyDeployment) => Promise<T>
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

    // Least-privilege: resolve only this provider's declared keys from the
    // per-user secret store.
    const { credentials, missingRequired } = await resolveProviderCredentials(
      deployment,
      this.userId,
      this.secretResolver
    );
    const problems = [
      ...missingRequired,
      ...validateDeploymentCredentials(deployment, credentials)
    ];
    if (problems.length > 0) {
      const err = new Error(
        `Deployment ${JSON.stringify(deploymentName)} (provider ${deployment.type}) ` +
          `is missing required credentials: ${problems.join("; ")}`
      );
      await this.audit({
        action,
        deployment_name: deploymentName,
        status: "error",
        error: err.message
      });
      throw err;
    }

    // Fresh per-operation context with a scratch dir torn down in a finally on
    // both success and failure. ctor-time ctx == call-time ctx because a fresh
    // deployer is built per call inside DeploymentManager.getDeployer.
    return withDeploymentContext(
      { userId: this.userId, credentials },
      async (ctx: DeploymentContext) => {
        try {
          const stateManager = this.makeStateManager();
          const mgr = new DeploymentManager(
            config,
            stateManager,
            this.deployerFactories,
            ctx
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
        }
      }
    );
  }

  private async audit(
    input: Omit<
      Parameters<NonNullable<UserDeploymentManagerOptions["audit"]>>[0],
      "user_id"
    >
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
