import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb, DeploymentSettings } from "@nodetool-ai/models";
import { generateMasterKey, decrypt } from "@nodetool-ai/security";
import { DbDeploymentSettingsStore } from "../src/db-deployment-settings-store.js";

describe("DbDeploymentSettingsStore", () => {
  let masterKey: string;
  let store: DbDeploymentSettingsStore;

  beforeEach(() => {
    initTestDb();
    masterKey = generateMasterKey();
    store = new DbDeploymentSettingsStore({ getMasterKey: () => masterKey });
  });

  it("returns default quota for users with no row", async () => {
    const q = await store.getQuota("u1");
    expect(q.max_deployments).toBe(5);
    expect(q.allowed_providers).toEqual([]);
  });

  it("setQuota merges over existing quota", async () => {
    await store.setQuota("u1", { max_deployments: 10 });
    const q1 = await store.getQuota("u1");
    expect(q1.max_deployments).toBe(10);
    expect(q1.max_workers_per_endpoint).toBe(3); // default preserved

    await store.setQuota("u1", { max_workers_per_endpoint: 1 });
    const q2 = await store.getQuota("u1");
    expect(q2.max_deployments).toBe(10);
    expect(q2.max_workers_per_endpoint).toBe(1);
  });

  it("encrypts credentials at rest with per-user derived key", async () => {
    await store.setCredential("alice", "RUNPOD_API_KEY", "alice-secret");
    await store.setCredential("bob", "RUNPOD_API_KEY", "bob-secret");

    const aliceRow = await DeploymentSettings.findByUserId("alice");
    const aliceCreds = JSON.parse(aliceRow!.credentials_json);
    expect(aliceCreds.RUNPOD_API_KEY.ciphertext).not.toContain("alice-secret");

    // Round-trip through the store works.
    const loaded = await store.loadCredentials("alice");
    expect(loaded.RUNPOD_API_KEY).toBe("alice-secret");

    // Direct decryption with master key + user_id matches.
    expect(decrypt(masterKey, "alice", aliceCreds.RUNPOD_API_KEY.ciphertext)).toBe(
      "alice-secret"
    );

    // Cross-user decryption fails (wrong derived key).
    expect(() =>
      decrypt(masterKey, "bob", aliceCreds.RUNPOD_API_KEY.ciphertext)
    ).toThrow();
  });

  it("validates credential names", async () => {
    await expect(
      store.setCredential("u1", "lowercase", "x")
    ).rejects.toThrow(/SCREAMING_SNAKE_CASE/);
    await expect(store.setCredential("u1", "1STARTING_DIGIT", "x")).rejects.toThrow();
  });

  it("listCredentialNames returns sorted env names", async () => {
    await store.setCredential("u1", "Z_LAST", "z");
    await store.setCredential("u1", "A_FIRST", "a");
    expect(await store.listCredentialNames("u1")).toEqual(["A_FIRST", "Z_LAST"]);
  });

  it("deleteCredential leaves others intact", async () => {
    await store.setCredential("u1", "K1", "v1");
    await store.setCredential("u1", "K2", "v2");
    await store.deleteCredential("u1", "K1");
    const loaded = await store.loadCredentials("u1");
    expect(loaded.K1).toBeUndefined();
    expect(loaded.K2).toBe("v2");
  });

  it("remove removes the entire settings row", async () => {
    await store.setCredential("u1", "K", "v");
    expect(await store.remove("u1")).toBe(true);
    expect(await store.listCredentialNames("u1")).toEqual([]);
  });
});
