import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

import { initTestDb, Deployment } from "@nodetool-ai/models";
import { migrateLegacyDeploymentYaml } from "../src/migrate-yaml-to-db.js";

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

  it("imports rows under the given user_id", async () => {
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

  it("is idempotent", async () => {
    const yamlPath = path.join(tmpDir, "deployment.yaml");
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(yamlPath, SAMPLE_YAML);

    await migrateLegacyDeploymentYaml({ userId: "u1", configPath: yamlPath });
    const idsBefore = (await Deployment.listForUser("u1")).map((r) => r.id);

    await migrateLegacyDeploymentYaml({ userId: "u1", configPath: yamlPath });
    const idsAfter = (await Deployment.listForUser("u1")).map((r) => r.id);

    expect(idsAfter).toEqual(idsBefore);
  });

  it("returns 0 when file is missing", async () => {
    const result = await migrateLegacyDeploymentYaml({
      userId: "u1",
      configPath: path.join(tmpDir, "nope.yaml")
    });
    expect(result.imported).toBe(0);
  });

  it("partitions imports by user_id (no cross-user bleed)", async () => {
    const yamlPath = path.join(tmpDir, "deployment.yaml");
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(yamlPath, SAMPLE_YAML);

    await migrateLegacyDeploymentYaml({ userId: "alice", configPath: yamlPath });
    await migrateLegacyDeploymentYaml({ userId: "bob", configPath: yamlPath });

    expect(await Deployment.listForUser("alice")).toHaveLength(2);
    expect(await Deployment.listForUser("bob")).toHaveLength(2);
  });
});
