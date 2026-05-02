/**
 * Multi-tenant deployment orchestrator.
 *
 * Wraps the existing `DeploymentManager` so a single Docker host can host
 * many isolated tenants, each of whom may own deployments to backends like
 * RunPod. Isolation guarantees:
 *
 *   1. Ownership — a tenant can only see and mutate deployments declared in
 *      their own `<tenants>/<tenant-id>/deployment.yaml`. Cross-tenant access
 *      is impossible because the lookup goes through the tenant id.
 *   2. Credentials — provider credentials are encrypted at rest with a
 *      per-tenant derived key (PBKDF2 with the tenant id as salt). They are
 *      decrypted, injected into `process.env` for the duration of a single
 *      deployer call, and removed in a `finally` block. Concurrent calls are
 *      serialized per-process to prevent env leakage.
 *   3. Quotas — each tenant has a quota record that caps deployment count,
 *      worker counts, GPU counts, allowed providers, and allowed GPU types.
 *      Quotas are enforced before delegating to the underlying deployer.
 *   4. Audit — every successful or failed action is appended to the tenant's
 *      JSONL audit log so a compromised tenant's history can be reviewed.
 *   5. Suspension — a suspended tenant is read-only; mutating operations
 *      throw `TenantSuspendedError`.
 */

import { StateManager } from "./state.js";
import { DeploymentManager, type DeployerFactory, type DeploymentInfo } from "./manager.js";
import {
  type DeploymentConfig,
  type AnyDeployment,
  type RunPodDeployment,
  parseDeploymentConfig
} from "./deployment-config.js";
import {
  TenantStore,
  TenantSuspendedError
} from "./tenant-store.js";
import {
  resolveTenantPaths,
  type TenantQuota,
  type TenantRecord
} from "./tenant-config.js";
import { appendAuditEntry, type AppendAuditInput } from "./tenant-audit.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.deploy.multi-tenant-manager");

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
    super(`Provider ${JSON.stringify(provider)} is not allowed for this tenant`);
    this.name = "ProviderNotAllowedError";
  }
}

// ============================================================================
// Per-process env mutex
// ============================================================================

/**
 * Concurrent deployer calls would race on `process.env` — we mutate it briefly
 * to inject tenant credentials. A single process-wide queue keeps that
 * mutation invisible to anyone else.
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
 * Check a deployment object against a tenant's quota. Returns a list of
 * violations; an empty list means the deployment is acceptable.
 */
export function findQuotaViolations(
  deployment: AnyDeployment,
  quota: TenantQuota
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

function assertQuotaOk(deployment: AnyDeployment, quota: TenantQuota): void {
  const violations = findQuotaViolations(deployment, quota);
  if (violations.length > 0) {
    throw new QuotaExceededError(violations.join("; "));
  }
}

// ============================================================================
// TenantScopedManager
// ============================================================================

export interface TenantScopedManagerOptions {
  tenant: TenantRecord;
  store: TenantStore;
  deployerFactories: Record<string, DeployerFactory>;
  /** Override for tests; defaults to the real audit-log writer. */
  audit?: (input: AppendAuditInput) => Promise<unknown>;
}

/**
 * View of the deployment system as scoped to a single tenant. All operations
 * are validated for ownership, quota, and tenant status before delegating to
 * the underlying `DeploymentManager` with the tenant's credentials in
 * `process.env`.
 */
export class TenantScopedManager {
  readonly tenant: TenantRecord;
  private store: TenantStore;
  private deployerFactories: Record<string, DeployerFactory>;
  private auditFn: (input: AppendAuditInput) => Promise<unknown>;

  constructor(opts: TenantScopedManagerOptions) {
    this.tenant = opts.tenant;
    this.store = opts.store;
    this.deployerFactories = opts.deployerFactories;
    this.auditFn = opts.audit ?? defaultAudit(opts.store, opts.tenant.id);
  }

  // -------------------------------------------------------------------------
  // Tenant deployment.yaml I/O — kept inline so the existing `loadDeploymentConfig`
  // (which targets the global config path) is not entangled with multi-tenant.
  // -------------------------------------------------------------------------

  private async deploymentConfigPath(): Promise<string> {
    return (await this.store.resolvePaths(this.tenant.id)).deployment;
  }

  private async loadConfig(): Promise<DeploymentConfig> {
    const p = await this.deploymentConfigPath();
    try {
      const raw = await fs.readFile(p, "utf-8");
      const data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
      return parseDeploymentConfig(data ?? {});
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return parseDeploymentConfig({});
      }
      throw err;
    }
  }

  private async saveConfig(config: DeploymentConfig): Promise<void> {
    const p = await this.deploymentConfigPath();
    await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
    const data = JSON.parse(
      JSON.stringify(config, (_k, v) => (v === null ? undefined : v))
    );
    const yamlStr = yaml.dump(data, {
      flowLevel: -1,
      sortKeys: false,
      noCompatMode: true
    });
    const tmp = p + ".tmp";
    await fs.writeFile(tmp, yamlStr, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tmp, p);
  }

  private assertActive(): void {
    if (this.tenant.status !== "active") {
      throw new TenantSuspendedError(this.tenant.id);
    }
  }

  // -------------------------------------------------------------------------
  // Public CRUD over the tenant's deployments
  // -------------------------------------------------------------------------

  async listDeployments(): Promise<DeploymentInfo[]> {
    const config = await this.loadConfig();
    const stateManager = await this.makeStateManager();
    const mgr = new DeploymentManager(config, stateManager, this.deployerFactories);
    return mgr.listDeployments();
  }

  /**
   * Add or replace a deployment in the tenant's config. Validates quota
   * before persisting. Returns the saved deployment.
   */
  async upsertDeployment(name: string, deployment: AnyDeployment): Promise<AnyDeployment> {
    this.assertActive();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      throw new Error(`Invalid deployment name ${JSON.stringify(name)}`);
    }
    assertQuotaOk(deployment, this.tenant.quota);

    const config = await this.loadConfig();
    const isNew = !config.deployments[name];
    if (
      isNew &&
      Object.keys(config.deployments).length >= this.tenant.quota.max_deployments
    ) {
      throw new QuotaExceededError(
        `tenant ${this.tenant.id} has reached max_deployments=${this.tenant.quota.max_deployments}`
      );
    }
    config.deployments[name] = deployment;
    await this.saveConfig(config);
    await this.audit({
      action: isNew ? "deployment.create" : "deployment.update",
      deployment: name,
      status: "ok"
    });
    return deployment;
  }

  async removeDeployment(name: string): Promise<void> {
    this.assertActive();
    const config = await this.loadConfig();
    if (!config.deployments[name]) {
      throw new Error(`Deployment ${JSON.stringify(name)} not found for tenant`);
    }
    delete config.deployments[name];
    await this.saveConfig(config);
    await this.audit({ action: "deployment.remove", deployment: name, status: "ok" });
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
    this.assertActive();
    return this.runScoped("deployment.apply", name, async (mgr, deployment) => {
      assertQuotaOk(deployment, this.tenant.quota);
      return mgr.apply(name, opts);
    });
  }

  async status(name: string): Promise<Record<string, unknown>> {
    return this.runScoped("deployment.status", name, async (mgr) => mgr.status(name));
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
    this.assertActive();
    return this.runScoped("deployment.destroy", name, async (mgr) => mgr.destroy(name));
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async makeStateManager(): Promise<StateManager> {
    return new StateManager(await this.deploymentConfigPath());
  }

  /**
   * Wrap a deployer call: load config → enforce quota → inject credentials
   * into `process.env` → delegate to `DeploymentManager` → restore env →
   * audit. Concurrency-safe across the whole process.
   */
  private async runScoped<T = Record<string, unknown>>(
    action: string,
    deploymentName: string,
    fn: (mgr: DeploymentManager, deployment: AnyDeployment) => Promise<T>
  ): Promise<T> {
    const config = await this.loadConfig();
    const deployment = config.deployments[deploymentName];
    if (!deployment) {
      const err = new Error(
        `Deployment ${JSON.stringify(deploymentName)} not found for tenant ${this.tenant.id}`
      );
      await this.audit({
        action,
        deployment: deploymentName,
        status: "error",
        error: err.message
      });
      throw err;
    }

    const credentials = await this.store.loadCredentials(this.tenant.id);

    return envMutex.run(async () => {
      const previous: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(credentials)) {
        previous[k] = process.env[k];
        process.env[k] = v;
      }
      // Tag the env so deployers/handlers that introspect env can attribute
      // calls to a tenant for logging.
      previous["NODETOOL_TENANT_ID"] = process.env["NODETOOL_TENANT_ID"];
      process.env["NODETOOL_TENANT_ID"] = this.tenant.id;

      try {
        const stateManager = await this.makeStateManager();
        const mgr = new DeploymentManager(config, stateManager, this.deployerFactories);
        const result = await fn(mgr, deployment);
        await this.audit({ action, deployment: deploymentName, status: "ok" });
        return result;
      } catch (err) {
        await this.audit({
          action,
          deployment: deploymentName,
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
    input: Omit<AppendAuditInput, "tenant_id">
  ): Promise<void> {
    try {
      await this.auditFn({ ...input, tenant_id: this.tenant.id });
    } catch (err) {
      log.warn(`audit write failed for tenant ${this.tenant.id}`, err);
    }
  }
}

function defaultAudit(
  store: TenantStore,
  tenantId: string
): (input: AppendAuditInput) => Promise<unknown> {
  return async (input) => {
    const paths = resolveTenantPaths(store.baseDir, tenantId);
    return appendAuditEntry(paths.audit, input);
  };
}

// ============================================================================
// MultiTenantDeploymentManager
// ============================================================================

export interface MultiTenantDeploymentManagerOptions {
  store: TenantStore;
  deployerFactories: Record<string, DeployerFactory>;
}

/**
 * Top-level entry point. Holds the tenant store and the deployer factory map,
 * and hands out `TenantScopedManager` instances on demand.
 */
export class MultiTenantDeploymentManager {
  readonly store: TenantStore;
  private deployerFactories: Record<string, DeployerFactory>;

  constructor(opts: MultiTenantDeploymentManagerOptions) {
    this.store = opts.store;
    this.deployerFactories = opts.deployerFactories;
  }

  async listTenants(): Promise<TenantRecord[]> {
    return this.store.listTenants();
  }

  /**
   * Get a scoped manager for a tenant. Throws `TenantNotFoundError` if the
   * tenant does not exist.
   */
  async getTenantManager(id: string): Promise<TenantScopedManager> {
    const tenant = await this.store.getTenant(id);
    return new TenantScopedManager({
      tenant,
      store: this.store,
      deployerFactories: this.deployerFactories
    });
  }
}
