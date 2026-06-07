import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "@nodetool-ai/models";
import { DbDeploymentSettingsStore } from "../src/db-deployment-settings-store.js";

// DbDeploymentSettingsStore is QUOTA-ONLY after the multi-tenant refactor.
// Credential methods (setCredential / deleteCredential / loadCredentials /
// listCredentialNames / readCredentials / writeCredentials) were removed —
// deployment credentials are now ordinary per-user `Secret` rows. Encryption-
// at-rest coverage was migrated to the Secret model test
// (packages/models/tests/secret.test.ts).
describe("DbDeploymentSettingsStore (quota-only)", () => {
  let store: DbDeploymentSettingsStore;

  beforeEach(() => {
    initTestDb();
    store = new DbDeploymentSettingsStore();
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

  it("isolates quota between users", async () => {
    await store.setQuota("alice", { max_deployments: 1 });
    await store.setQuota("bob", { max_deployments: 9 });
    expect((await store.getQuota("alice")).max_deployments).toBe(1);
    expect((await store.getQuota("bob")).max_deployments).toBe(9);
  });

  it("remove deletes the settings row", async () => {
    await store.setQuota("u1", { max_deployments: 2 });
    expect(await store.remove("u1")).toBe(true);
    // Back to defaults after removal.
    expect((await store.getQuota("u1")).max_deployments).toBe(5);
  });

  it("exposes no credential methods", () => {
    const s = store as unknown as Record<string, unknown>;
    for (const m of [
      "setCredential",
      "deleteCredential",
      "loadCredentials",
      "listCredentialNames",
      "readCredentials",
      "writeCredentials"
    ]) {
      expect(s[m]).toBeUndefined();
    }
  });
});
