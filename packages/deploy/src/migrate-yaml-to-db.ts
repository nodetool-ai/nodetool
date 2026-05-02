/**
 * One-shot migration from the legacy YAML deployment config to the database.
 *
 * Copies every deployment from `deployment.yaml` into `nodetool_deployments`
 * owned by the given `userId`. The migration is idempotent — running it
 * twice produces the same DB state because every write goes through `upsert`
 * semantics.
 */

import * as fs from "fs/promises";
import * as yaml from "js-yaml";

import {
  type DeploymentConfig,
  parseDeploymentConfig,
  getDeploymentConfigPath
} from "./deployment-config.js";
import { DbDeploymentStore } from "./db-deployment-store.js";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.deploy.migrate");

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
