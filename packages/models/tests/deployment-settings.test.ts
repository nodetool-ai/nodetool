import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "../src/db.js";
import { DeploymentSettings } from "../src/deployment-settings.js";

describe("DeploymentSettings model", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("returns a defaulted unsaved row when none exists", async () => {
    const row = await DeploymentSettings.getOrDefault("u1");
    expect(row.user_id).toBe("u1");
    expect(row.quota_json).toBe("{}");
    expect(row.credentials_json).toBe("{}");
    expect(await DeploymentSettings.findByUserId("u1")).toBeNull();
  });

  it("upserts and round-trips quota + credentials JSON", async () => {
    await DeploymentSettings.upsert({
      user_id: "u1",
      quota_json: JSON.stringify({ max_deployments: 7 }),
      credentials_json: JSON.stringify({ RUNPOD_API_KEY: { ciphertext: "x" } })
    });
    const row = await DeploymentSettings.findByUserId("u1");
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.quota_json).max_deployments).toBe(7);
    expect(JSON.parse(row!.credentials_json).RUNPOD_API_KEY.ciphertext).toBe("x");
  });

  it("upsert merges (only updates provided fields)", async () => {
    await DeploymentSettings.upsert({
      user_id: "u1",
      quota_json: JSON.stringify({ max_deployments: 7 })
    });
    await DeploymentSettings.upsert({
      user_id: "u1",
      credentials_json: JSON.stringify({ K: { ciphertext: "y" } })
    });
    const row = await DeploymentSettings.findByUserId("u1");
    expect(JSON.parse(row!.quota_json).max_deployments).toBe(7);
    expect(JSON.parse(row!.credentials_json).K.ciphertext).toBe("y");
  });

  it("isolates settings between users", async () => {
    await DeploymentSettings.upsert({
      user_id: "alice",
      credentials_json: JSON.stringify({ RUNPOD_API_KEY: "alice-blob" })
    });
    await DeploymentSettings.upsert({
      user_id: "bob",
      credentials_json: JSON.stringify({ RUNPOD_API_KEY: "bob-blob" })
    });
    const alice = await DeploymentSettings.findByUserId("alice");
    const bob = await DeploymentSettings.findByUserId("bob");
    expect(JSON.parse(alice!.credentials_json).RUNPOD_API_KEY).toBe("alice-blob");
    expect(JSON.parse(bob!.credentials_json).RUNPOD_API_KEY).toBe("bob-blob");
  });

  it("remove deletes the row", async () => {
    await DeploymentSettings.upsert({ user_id: "u1" });
    expect(await DeploymentSettings.remove("u1")).toBe(true);
    expect(await DeploymentSettings.findByUserId("u1")).toBeNull();
    expect(await DeploymentSettings.remove("u1")).toBe(false);
  });
});
