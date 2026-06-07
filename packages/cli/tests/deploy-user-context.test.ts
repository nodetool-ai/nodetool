import { describe, it, expect, vi, beforeEach } from "vitest";

// Partial-mock the models package: keep every real export (the deploy package
// imports Deployment/DeploymentAudit/etc. at load time) but stub the DB open
// and the per-user secret resolver so no real SQLite/keychain is touched.
vi.mock("@nodetool-ai/models", async (importActual) => {
  const actual =
    await importActual<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    initDb: vi.fn(),
    getSecret: vi.fn(async (key: string, userId?: string) => {
      if (userId !== "tester") return null;
      if (key === "GCP_SERVICE_ACCOUNT_KEY") return '{"type":"service_account"}';
      if (key === "DOCKER_USERNAME") return "alice";
      return null;
    })
  };
});

vi.mock("@nodetool-ai/security", async (importActual) => {
  const actual =
    await importActual<typeof import("@nodetool-ai/security")>();
  return { ...actual, initMasterKey: vi.fn(async () => "test-master-key") };
});

import { buildUserContext } from "../src/commands/deploy-helpers.js";
import { getSecret } from "@nodetool-ai/models";

describe("buildUserContext (--user credential source)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves credentials from the per-user secret store, scoped by user id", async () => {
    const ctx = await buildUserContext("tester");

    expect(ctx.userId).toBe("tester");
    expect(ctx.credentials.GCP_SERVICE_ACCOUNT_KEY).toBe(
      '{"type":"service_account"}'
    );
    expect(ctx.credentials.DOCKER_USERNAME).toBe("alice");
    // Keys the user has not stored are omitted, so the deployers' config-level
    // fallbacks still apply.
    expect(ctx.credentials.RUNPOD_API_KEY).toBeUndefined();
    expect(ctx.credentials.FLY_API_TOKEN).toBeUndefined();
    expect(typeof ctx.scratchDir).toBe("string");
    expect(ctx.scratchDir.length).toBeGreaterThan(0);

    // Each lookup is scoped to the requested user id (no env reads).
    expect(getSecret).toHaveBeenCalledWith("GCP_SERVICE_ACCOUNT_KEY", "tester");
    expect(getSecret).toHaveBeenCalledWith("DOCKER_USERNAME", "tester");
  });

  it("returns no credentials for a user with nothing stored", async () => {
    const ctx = await buildUserContext("nobody");
    expect(ctx.userId).toBe("nobody");
    expect(Object.keys(ctx.credentials)).toHaveLength(0);
  });
});
