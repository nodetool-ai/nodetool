import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

import { initTestDb, Deployment, DeploymentSettings } from "@nodetool-ai/models";
import { generateMasterKey } from "@nodetool-ai/security";
import { TenantStore } from "../src/tenant-store.js";
import {
  migrateLegacyDeploymentYaml,
  migrateTenantsToDb
} from "../src/migrate-yaml-to-db.js";
import { DbDeploymentSettingsStore } from "../src/db-deployment-settings-store.js";

function makeTmpDir(): string {
  return path.join(os.tmpdir(), `nodetool-migrate-${crypto.randomUUID()}`);
}

const SAMPLE_YAML = `
version: "2.0"
defaults:
  log_level: "DEBUG"
deployments:
  prod:
    type: docker
    host: "10.0.0.1"
    image:
      name: "owner/app"
    container:
      name: "nodetool"
      port: 8000
  staging:
    type: runpod
    image:
      name: "owner/app"
      tag: "staging"
`;

describe("migrate-yaml-to-db", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    initTestDb();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("migrateLegacyDeploymentYaml imports rows under the given user_id", async () => {
    const yamlPath = path.join(tmpDir, "deployment.yaml");
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(yamlPath, SAMPLE_YAML);

    const result = await migrateLegacyDeploymentYaml({
      userId: "alice",
      configPath: yamlPath
    });
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);

    const rows = await Deployment.listForUser("alice");
    expect(rows.map((r) => r.name).sort()).toEqual(["prod", "staging"]);
    expect(rows.find((r) => r.name === "prod")!.type).toBe("docker");
  });

  it("migrateLegacyDeploymentYaml is idempotent", async () => {
    const yamlPath = path.join(tmpDir, "deployment.yaml");
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(yamlPath, SAMPLE_YAML);

    await migrateLegacyDeploymentYaml({ userId: "u1", configPath: yamlPath });
    const idsBefore = (await Deployment.listForUser("u1")).map((r) => r.id);

    await migrateLegacyDeploymentYaml({ userId: "u1", configPath: yamlPath });
    const idsAfter = (await Deployment.listForUser("u1")).map((r) => r.id);

    expect(idsAfter).toEqual(idsBefore);
  });

  it("migrateLegacyDeploymentYaml returns 0 when file is missing", async () => {
    const result = await migrateLegacyDeploymentYaml({
      userId: "u1",
      configPath: path.join(tmpDir, "nope.yaml")
    });
    expect(result.imported).toBe(0);
  });

  it("migrateTenantsToDb copies tenants + their deployments + credentials", async () => {
    const masterKey = generateMasterKey();
    const tenantStore = new TenantStore({
      baseDir: tmpDir,
      getMasterKey: () => masterKey
    });
    await tenantStore.createTenant({
      id: "alice",
      display_name: "Alice",
      quota: { max_deployments: 9 }
    });
    await tenantStore.setCredential("alice", "RUNPOD_API_KEY", "alice-secret");

    // Drop a deployment.yaml under the tenant dir.
    const aliceDir = path.join(tmpDir, "alice");
    await fs.writeFile(path.join(aliceDir, "deployment.yaml"), SAMPLE_YAML);

    const result = await migrateTenantsToDb({
      baseDir: tmpDir,
      getMasterKey: () => masterKey
    });
    expect(result.tenants).toBe(1);
    expect(result.deployments).toBe(2);

    // Verify Deployment rows are owned by the tenant id (now the user_id).
    const rows = await Deployment.listForUser("alice");
    expect(rows).toHaveLength(2);

    // Quota copied verbatim.
    const settings = await DeploymentSettings.findByUserId("alice");
    expect(JSON.parse(settings!.quota_json).max_deployments).toBe(9);

    // Credentials copied + still decryptable through the store.
    const dbStore = new DbDeploymentSettingsStore({
      getMasterKey: () => masterKey
    });
    const loaded = await dbStore.loadCredentials("alice");
    expect(loaded.RUNPOD_API_KEY).toBe("alice-secret");
  });

  it("migrateTenantsToDb returns 0 when no index.yaml exists", async () => {
    const masterKey = generateMasterKey();
    const result = await migrateTenantsToDb({
      baseDir: tmpDir,
      getMasterKey: () => masterKey
    });
    expect(result).toEqual({ tenants: 0, deployments: 0 });
  });
});
