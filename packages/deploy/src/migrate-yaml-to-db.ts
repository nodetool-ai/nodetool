/**
 * One-shot migration from YAML files to the database.
 *
 * Copies:
 *  - Single-tenant `deployment.yaml` → `nodetool_deployments` rows for the
 *    given owning user (default: the legacy id passed via `legacyUserId`).
 *  - Multi-tenant `<base>/index.yaml` + per-tenant `deployment.yaml` →
 *    rows in `nodetool_deployments` and `nodetool_deployment_settings`,
 *    with each tenant id used as the owning `user_id` (tenants ARE users).
 *
 * The migration is idempotent — running it twice produces the same DB state
 * because every write goes through `upsert` semantics.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";

import {
  type DeploymentConfig,
  parseDeploymentConfig,
  getDeploymentConfigPath
} from "./deployment-config.js";
import {
  TenantStore,
  type CreateTenantInput
} from "./tenant-store.js";
import {
  parseTenantIndex,
  resolveTenantPaths,
  getDefaultTenantBaseDir,
  TenantQuotaSchema
} from "./tenant-config.js";
import { DbDeploymentStore } from "./db-deployment-store.js";
import { DbDeploymentSettingsStore } from "./db-deployment-settings-store.js";
import { DeploymentSettings } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.deploy.migrate");

// ============================================================================
// Single-tenant: deployment.yaml → DB
// ============================================================================

/**
 * Copy every deployment from `<configDir>/deployment.yaml` into the DB,
 * owned by `userId`. Returns the number of deployments imported.
 */
export async function migrateLegacyDeploymentYaml(opts: {
  userId: string;
  configPath?: string;
}): Promise<{ imported: number; skipped: number; userId: string }> {
  const configPath = opts.configPath ?? getDeploymentConfigPath();
  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { imported: 0, skipped: 0, userId: opts.userId };
    }
    throw err;
  }

  const data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
  let config: DeploymentConfig;
  try {
    config = parseDeploymentConfig(data ?? {});
  } catch (err) {
    log.error(`Failed to parse ${configPath}: ${String(err)}`);
    throw err;
  }

  const store = new DbDeploymentStore({
    userId: opts.userId,
    defaults: config.defaults
  });

  let imported = 0;
  let skipped = 0;
  for (const [name, deployment] of Object.entries(config.deployments)) {
    try {
      await store.upsertDeployment(name, deployment);
      imported++;
    } catch (err) {
      log.error(`Skipping ${name}: ${String(err)}`);
      skipped++;
    }
  }

  log.info(
    `Migrated ${imported} deployment(s) from ${configPath} to user_id=${opts.userId} (skipped ${skipped})`
  );
  return { imported, skipped, userId: opts.userId };
}

// ============================================================================
// Multi-tenant: <base>/index.yaml + <base>/<id>/deployment.yaml → DB
// ============================================================================

/**
 * Walk the file-based tenant tree and copy everything into the DB. Each
 * tenant id becomes the owning `user_id` for their deployments and gets a
 * `nodetool_deployment_settings` row with the same encrypted credentials and
 * quota that lived in `index.yaml`.
 */
export async function migrateTenantsToDb(opts: {
  baseDir?: string;
  configDir?: string;
  getMasterKey: () => Promise<string> | string;
}): Promise<{ tenants: number; deployments: number }> {
  const baseDir = opts.baseDir ?? getDefaultTenantBaseDir(opts.configDir);
  const indexPath = path.join(baseDir, "index.yaml");

  let indexRaw: string;
  try {
    indexRaw = await fs.readFile(indexPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { tenants: 0, deployments: 0 };
    }
    throw err;
  }

  const indexData = yaml.load(indexRaw, { schema: yaml.JSON_SCHEMA });
  const index = parseTenantIndex(indexData ?? {});

  const settingsStore = new DbDeploymentSettingsStore({
    getMasterKey: opts.getMasterKey
  });

  let tenantCount = 0;
  let deploymentCount = 0;

  for (const [tenantId, tenant] of Object.entries(index.tenants)) {
    // Persist quota + credentials directly. Credentials were already encrypted
    // with `encrypt(masterKey, tenantId, ...)` when written to YAML, and the
    // DB layer uses the same scheme — so we can copy ciphertext verbatim.
    await settingsStore.setQuota(tenantId, tenant.quota);
    await DeploymentSettings.upsert({
      user_id: tenantId,
      credentials_json: JSON.stringify(tenant.credentials)
    });
    tenantCount++;

    const paths = resolveTenantPaths(baseDir, tenantId);
    let deploymentRaw: string;
    try {
      deploymentRaw = await fs.readFile(paths.deployment, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }

    const data = yaml.load(deploymentRaw, { schema: yaml.JSON_SCHEMA });
    const config = parseDeploymentConfig(data ?? {});
    const store = new DbDeploymentStore({ userId: tenantId, defaults: config.defaults });

    for (const [name, deployment] of Object.entries(config.deployments)) {
      try {
        await store.upsertDeployment(name, deployment);
        deploymentCount++;
      } catch (err) {
        log.error(
          `tenant=${tenantId} deployment=${name} skipped: ${String(err)}`
        );
      }
    }
  }

  log.info(
    `Migrated ${tenantCount} user(s) and ${deploymentCount} deployment(s) from ${baseDir} to DB`
  );
  return { tenants: tenantCount, deployments: deploymentCount };
}

/**
 * Convenience helper: also writes any new YAML-defined tenants to the
 * existing `TenantStore` before copying, so the file and DB stores agree.
 * Only useful during a transitional rollout where some clients still write
 * to YAML.
 */
export async function syncYamlTenantsIntoStore(
  store: TenantStore,
  inputs: CreateTenantInput[]
): Promise<number> {
  let created = 0;
  for (const input of inputs) {
    if (!(await store.tenantExists(input.id))) {
      await store.createTenant({
        ...input,
        quota: TenantQuotaSchema.parse(input.quota ?? {})
      });
      created++;
    }
  }
  return created;
}
