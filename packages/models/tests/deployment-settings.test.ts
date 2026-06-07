import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "../src/db.js";
import { DeploymentSettings } from "../src/deployment-settings.js";

// DeploymentSettings is QUOTA-ONLY after the multi-tenant refactor. The
// `credentials_json` column was dropped; deployment credentials are now
// ordinary per-user `Secret` rows keyed by env name. These tests assert the
// quota surface only and that the dropped column is truly gone.
describe("DeploymentSettings model", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("returns a defaulted unsaved row when none exists", async () => {
    const row = await DeploymentSettings.getOrDefault("u1");
    expect(row.user_id).toBe("u1");
    expect(row.quota_json).toBe("{}");
    // No row is persisted by getOrDefault.
    expect(await DeploymentSettings.findByUserId("u1")).toBeNull();
  });

  it("no longer exposes a credentials_json column", async () => {
    await DeploymentSettings.upsert({
      user_id: "u1",
      quota_json: JSON.stringify({ max_deployments: 3 })
    });
    const row = await DeploymentSettings.findByUserId("u1");
    expect(row).not.toBeNull();
    // The column is dropped from the model and the DB; the property must not
    // round-trip a value.
    expect(
      (row as unknown as Record<string, unknown>).credentials_json
    ).toBeUndefined();
  });

  it("upserts and round-trips quota JSON", async () => {
    await DeploymentSettings.upsert({
      user_id: "u1",
      quota_json: JSON.stringify({ max_deployments: 7 })
    });
    const row = await DeploymentSettings.findByUserId("u1");
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.quota_json).max_deployments).toBe(7);
  });

  it("upsert merges (only updates provided fields)", async () => {
    await DeploymentSettings.upsert({
      user_id: "u1",
      quota_json: JSON.stringify({ max_deployments: 7 })
    });
    // A second upsert with no quota_json leaves the existing quota untouched.
    await DeploymentSettings.upsert({ user_id: "u1" });
    const row = await DeploymentSettings.findByUserId("u1");
    expect(JSON.parse(row!.quota_json).max_deployments).toBe(7);
  });

  it("isolates settings between users", async () => {
    await DeploymentSettings.upsert({
      user_id: "alice",
      quota_json: JSON.stringify({ max_deployments: 1 })
    });
    await DeploymentSettings.upsert({
      user_id: "bob",
      quota_json: JSON.stringify({ max_deployments: 9 })
    });
    const alice = await DeploymentSettings.findByUserId("alice");
    const bob = await DeploymentSettings.findByUserId("bob");
    expect(JSON.parse(alice!.quota_json).max_deployments).toBe(1);
    expect(JSON.parse(bob!.quota_json).max_deployments).toBe(9);
  });

  it("remove deletes the row", async () => {
    await DeploymentSettings.upsert({ user_id: "u1" });
    expect(await DeploymentSettings.remove("u1")).toBe(true);
    expect(await DeploymentSettings.findByUserId("u1")).toBeNull();
    expect(await DeploymentSettings.remove("u1")).toBe(false);
  });
});
