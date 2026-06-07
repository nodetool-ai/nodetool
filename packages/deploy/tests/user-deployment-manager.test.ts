import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  initTestDb,
  Deployment,
  DeploymentAudit,
  Secret
} from "@nodetool-ai/models";
import { setMasterKey } from "@nodetool-ai/security";
import {
  UserDeploymentManager,
  QuotaExceededError
} from "../src/user-deployment-manager.js";
import { findQuotaViolations } from "../src/deployment-quota.js";
import { DbDeploymentStore } from "../src/db-deployment-store.js";
import { DbDeploymentSettingsStore } from "../src/db-deployment-settings-store.js";
import type { Deployer, DeployerFactory } from "../src/manager.js";
import type { DeploymentContext } from "../src/deployment-context.js";
import type { SecretResolver } from "../src/provider-credentials.js";
import type { AnyDeployment } from "../src/deployment-config.js";

const TEST_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz"; // base64

// A deployer that records the per-call DeploymentContext and a snapshot of the
// AMBIENT process.env at the moment each operation runs. The new design NEVER
// mutates process.env and threads credentials through `ctx`, so:
//   - ctx.credentials carries the user's decrypted token, and
//   - process.env is identical inside the call as outside it.
interface RecordingDeployer extends Deployer {
  contexts: DeploymentContext[];
  envSnapshots: Record<string, string | undefined>[];
}

function makeRecordingFactory(): {
  factory: DeployerFactory;
  deployers: RecordingDeployer[];
} {
  const deployers: RecordingDeployer[] = [];
  const factory: DeployerFactory = (
    _name,
    _deployment,
    _stateManager,
    ctx
  ) => {
    const contexts: DeploymentContext[] = [];
    const envSnapshots: Record<string, string | undefined>[] = [];
    const snap = (op: string) => {
      contexts.push(ctx);
      envSnapshots.push({
        op,
        // Ambient host env — must be untouched by the manager.
        RUNPOD_API_KEY: process.env.RUNPOD_API_KEY,
        NODETOOL_USER_ID: process.env.NODETOOL_USER_ID
      });
    };
    const d: RecordingDeployer = {
      contexts,
      envSnapshots,
      plan: vi.fn(async () => {
        snap("plan");
        return { changes: [] };
      }),
      apply: vi.fn(async () => {
        snap("apply");
        return { status: "applied" };
      }),
      status: vi.fn(async () => {
        snap("status");
        return { status: "running" };
      }),
      logs: vi.fn(async () => {
        snap("logs");
        return "log output";
      }),
      destroy: vi.fn(async () => {
        snap("destroy");
        return { status: "destroyed" };
      })
    };
    deployers.push(d);
    return d;
  };
  return { factory, deployers };
}

const RUNPOD_DEPLOYMENT: AnyDeployment = {
  type: "runpod",
  enabled: true,
  image: {
    name: "owner/img",
    tag: "v1",
    registry: "docker.io",
    build: { platform: "linux/amd64", no_cache: false }
  },
  gpu_types: ["ADA_24"],
  gpu_count: 1,
  cpu_flavors: [],
  data_centers: [],
  allowed_cuda_versions: [],
  docker: { registry: "docker.io" },
  platform: "linux/amd64",
  compute_type: "GPU",
  workers_min: 0,
  workers_max: 2,
  idle_timeout: 5,
  flashboot: false,
  workflows: [],
  state: { status: "unknown" }
} as unknown as AnyDeployment;

/** Capture the FULL process.env as a frozen snapshot for byte-for-byte diffs. */
function snapshotEnv(): Record<string, string | undefined> {
  return { ...process.env };
}

function expectEnvUnchanged(
  before: Record<string, string | undefined>
): void {
  const after = snapshotEnv();
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const key of Object.keys(before)) {
    expect(after[key]).toBe(before[key]);
  }
}

describe("findQuotaViolations (moved to deployment-quota)", () => {
  const baseQuota = {
    max_deployments: 5,
    max_workers_per_endpoint: 3,
    max_gpu_count_per_endpoint: 1,
    allowed_providers: [] as never,
    allowed_gpu_types: [] as never
  };

  it("returns no violations for an in-quota deployment", () => {
    expect(findQuotaViolations(RUNPOD_DEPLOYMENT, baseQuota)).toEqual([]);
  });

  it("flags workers_max overage", () => {
    const d = { ...RUNPOD_DEPLOYMENT, workers_max: 10 } as AnyDeployment;
    expect(findQuotaViolations(d, baseQuota).join(";")).toMatch(/workers_max/);
  });

  it("flags gpu_count overage", () => {
    const d = { ...RUNPOD_DEPLOYMENT, gpu_count: 8 } as AnyDeployment;
    expect(findQuotaViolations(d, baseQuota).join(";")).toMatch(/gpu_count/);
  });

  it("flags disallowed provider", () => {
    expect(
      findQuotaViolations(RUNPOD_DEPLOYMENT, {
        ...baseQuota,
        allowed_providers: ["docker"] as never
      }).join(";")
    ).toMatch(/provider runpod/);
  });

  it("flags disallowed gpu type", () => {
    expect(
      findQuotaViolations(RUNPOD_DEPLOYMENT, {
        ...baseQuota,
        allowed_gpu_types: ["AMPERE_24"] as never
      }).join(";")
    ).toMatch(/ADA_24/);
  });
});

describe("UserDeploymentManager", () => {
  let runpod: { factory: DeployerFactory; deployers: RecordingDeployer[] };
  let factories: Record<string, DeployerFactory>;

  beforeEach(() => {
    initTestDb();
    setMasterKey(TEST_MASTER_KEY);
    runpod = makeRecordingFactory();
    factories = { runpod: runpod.factory };
    // The manager must NEVER write these; tests assert they stay absent.
    delete process.env.RUNPOD_API_KEY;
    delete process.env.NODETOOL_USER_ID;
  });

  afterEach(() => {
    delete process.env.RUNPOD_API_KEY;
    delete process.env.NODETOOL_USER_ID;
  });

  /**
   * Build a manager with an injected, deterministic secret resolver so tests
   * never depend on real DB encryption timing. The resolver is least-privilege:
   * it is only ever asked for the provider's declared keys.
   */
  function makeManager(
    userId: string,
    creds: Record<string, string> = {},
    capture?: { calls: Array<{ key: string; userId: string }> }
  ): UserDeploymentManager {
    const secretResolver: SecretResolver = async (key, u) => {
      capture?.calls.push({ key, userId: u });
      // Only return a value for THIS user's own creds.
      if (u !== userId) return null;
      return creds[key] ?? null;
    };
    return new UserDeploymentManager({
      userId,
      store: new DbDeploymentStore({ userId }),
      settings: new DbDeploymentSettingsStore(),
      deployerFactories: factories,
      secretResolver
    });
  }

  it("rejects empty userId", () => {
    expect(
      () =>
        new UserDeploymentManager({
          userId: "",
          store: new DbDeploymentStore({ userId: "x" }),
          settings: new DbDeploymentSettingsStore(),
          deployerFactories: factories
        })
    ).toThrow();
  });

  it("isolates deployments between users", async () => {
    const alice = makeManager("alice");
    const bob = makeManager("bob");
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);

    expect((await alice.listDeployments()).map((d) => d.name)).toEqual(["prod"]);
    expect(await bob.listDeployments()).toEqual([]);

    expect(await Deployment.listForUser("alice")).toHaveLength(1);
    expect(await Deployment.listForUser("bob")).toHaveLength(0);
  });

  it("enforces max_deployments quota", async () => {
    const tiny = makeManager("tiny", { RUNPOD_API_KEY: "t" });
    await tiny["settings"].setQuota("tiny", { max_deployments: 1 });

    await tiny.upsertDeployment("a", RUNPOD_DEPLOYMENT);
    await expect(
      tiny.upsertDeployment("b", RUNPOD_DEPLOYMENT)
    ).rejects.toBeInstanceOf(QuotaExceededError);
    // Updating an existing one is fine.
    await expect(
      tiny.upsertDeployment("a", RUNPOD_DEPLOYMENT)
    ).resolves.toBeDefined();
  });

  it("enforces workers_max quota", async () => {
    const limited = makeManager("limited");
    await limited["settings"].setQuota("limited", {
      max_workers_per_endpoint: 1
    });
    const overworker = { ...RUNPOD_DEPLOYMENT, workers_max: 2 } as AnyDeployment;
    await expect(
      limited.upsertDeployment("p", overworker)
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("enforces allowed_providers quota", async () => {
    const dockerOnly = makeManager("docker-only");
    await dockerOnly["settings"].setQuota("docker-only", {
      allowed_providers: ["docker"]
    });
    await expect(
      dockerOnly.upsertDeployment("p", RUNPOD_DEPLOYMENT)
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  // ---------------------------------------------------------------------------
  // Credential isolation — the heart of the multi-tenant refactor.
  // ---------------------------------------------------------------------------

  it("delivers credentials via ctx, never via process.env, across plan/apply/destroy", async () => {
    const alice = makeManager("alice", { RUNPOD_API_KEY: "alice-token" });
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);

    const before = snapshotEnv();

    await alice.plan("prod");
    await alice.apply("prod");
    await alice.destroy("prod");

    // process.env is byte-for-byte unchanged before vs after.
    expectEnvUnchanged(before);
    // The token never leaked to the ambient host env at any point.
    expect(process.env.RUNPOD_API_KEY).toBeUndefined();
    expect(process.env.NODETOOL_USER_ID).toBeUndefined();

    // Every recorded operation saw the token via ctx.credentials and saw the
    // ambient env WITHOUT the secret.
    const allDeployers = runpod.deployers;
    expect(allDeployers.length).toBeGreaterThanOrEqual(3);
    for (const d of allDeployers) {
      for (const ctx of d.contexts) {
        expect(ctx.userId).toBe("alice");
        expect(ctx.credentials.RUNPOD_API_KEY).toBe("alice-token");
        expect(ctx.scratchDir).toBeTruthy();
      }
      for (const env of d.envSnapshots) {
        expect(env.RUNPOD_API_KEY).toBeUndefined();
        expect(env.NODETOOL_USER_ID).toBeUndefined();
      }
    }
  });

  it("does not leak credentials across users under concurrent calls", async () => {
    const alice = makeManager("alice", { RUNPOD_API_KEY: "alice-key" });
    const bob = makeManager("bob", { RUNPOD_API_KEY: "bob-key" });
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    await bob.upsertDeployment("prod", RUNPOD_DEPLOYMENT);

    const before = snapshotEnv();
    const [a, b] = await Promise.all([alice.apply("prod"), bob.apply("prod")]);
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    // Each context carries only its own user's credential.
    const ctxByUser = new Map<string, string | undefined>();
    for (const d of runpod.deployers) {
      for (const ctx of d.contexts) {
        ctxByUser.set(ctx.userId, ctx.credentials.RUNPOD_API_KEY);
      }
    }
    expect(ctxByUser.get("alice")).toBe("alice-key");
    expect(ctxByUser.get("bob")).toBe("bob-key");

    expectEnvUnchanged(before);
    expect(process.env.RUNPOD_API_KEY).toBeUndefined();
  });

  it("leaves a pre-existing ambient env var untouched (no save/restore mutation)", async () => {
    // An ambient host value with the SAME name must be neither overwritten nor
    // deleted — the manager simply ignores process.env for credentials.
    process.env.RUNPOD_API_KEY = "outer-value";
    process.env.NODETOOL_USER_ID = "outer-user";
    try {
      const alice = makeManager("alice", { RUNPOD_API_KEY: "inner-value" });
      await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);

      const before = snapshotEnv();
      await alice.apply("prod");
      expectEnvUnchanged(before);

      // Ambient values intact; the deployer saw the USER's value via ctx.
      expect(process.env.RUNPOD_API_KEY).toBe("outer-value");
      expect(process.env.NODETOOL_USER_ID).toBe("outer-user");
      const ctx = runpod.deployers.at(-1)!.contexts[0];
      expect(ctx.credentials.RUNPOD_API_KEY).toBe("inner-value");
      // The child env snapshot taken inside the op shows the ambient value,
      // proving the manager did not swap process.env to the user's value.
      expect(runpod.deployers.at(-1)!.envSnapshots[0].RUNPOD_API_KEY).toBe(
        "outer-value"
      );
    } finally {
      delete process.env.RUNPOD_API_KEY;
      delete process.env.NODETOOL_USER_ID;
    }
  });

  it("tears down the scratch dir after the call (even on error)", async () => {
    const fs = await import("node:fs/promises");

    // Success path.
    const alice = makeManager("alice", { RUNPOD_API_KEY: "k" });
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    await alice.apply("prod");
    const okScratch = runpod.deployers.at(-1)!.contexts[0].scratchDir;
    expect(okScratch).toBeTruthy();
    await expect(fs.stat(okScratch)).rejects.toMatchObject({ code: "ENOENT" });

    // Failure path — a throwing deployer still cleans up.
    let failingScratch: string | undefined;
    const failingFactory: DeployerFactory = (_n, _d, _s, ctx) => ({
      plan: vi.fn(),
      apply: vi.fn(async () => {
        failingScratch = ctx.scratchDir;
        throw new Error("boom");
      }),
      status: vi.fn(),
      logs: vi.fn(),
      destroy: vi.fn()
    });
    const failing = new UserDeploymentManager({
      userId: "alice",
      store: new DbDeploymentStore({ userId: "alice" }),
      settings: new DbDeploymentSettingsStore(),
      deployerFactories: { runpod: failingFactory },
      secretResolver: async (k) => (k === "RUNPOD_API_KEY" ? "k" : null)
    });
    await expect(failing.apply("prod")).rejects.toThrow("boom");
    expect(failingScratch).toBeTruthy();
    await expect(fs.stat(failingScratch!)).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  // ---------------------------------------------------------------------------
  // Provider credential resolution — least privilege + clear missing errors.
  // ---------------------------------------------------------------------------

  it("resolves ONLY the provider's declared keys (least privilege)", async () => {
    const capture = { calls: [] as Array<{ key: string; userId: string }> };
    const alice = makeManager("alice", { RUNPOD_API_KEY: "k" }, capture);
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    await alice.apply("prod");

    const requested = new Set(capture.calls.map((c) => c.key));
    // RunPod declares RUNPOD_API_KEY (required) + DOCKER_USERNAME/PASSWORD
    // (optional). Nothing outside that set may be touched.
    const allowed = new Set([
      "RUNPOD_API_KEY",
      "DOCKER_USERNAME",
      "DOCKER_PASSWORD"
    ]);
    for (const key of requested) {
      expect(allowed.has(key)).toBe(true);
    }
    expect(requested.has("RUNPOD_API_KEY")).toBe(true);
    // Every lookup was scoped to alice.
    for (const c of capture.calls) {
      expect(c.userId).toBe("alice");
    }
  });

  it("throws a clear error naming a missing REQUIRED key", async () => {
    // No RUNPOD_API_KEY available for this user.
    const alice = makeManager("alice", {});
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);

    const before = snapshotEnv();
    await expect(alice.apply("prod")).rejects.toThrow(/RUNPOD_API_KEY/);
    // The failed resolution did not construct a deployer.
    expect(runpod.deployers).toHaveLength(0);
    expectEnvUnchanged(before);

    // The error was audited.
    const entries = await DeploymentAudit.listForUser("alice");
    const err = entries.find(
      (e) => e.action === "deployment.apply" && e.status === "error"
    );
    expect(err).toBeDefined();
    expect(err!.error).toMatch(/RUNPOD_API_KEY/);
    // Audit meta must never carry the credential bag.
    expect(JSON.stringify(err)).not.toContain("alice-token");
  });

  it("default resolver reads from the per-user Secret store (DB-only)", async () => {
    // No injected resolver → the manager defaults to Secret.find(userId,key).
    await Secret.upsert({
      userId: "alice",
      key: "RUNPOD_API_KEY",
      value: "from-secret-store"
    });
    const alice = new UserDeploymentManager({
      userId: "alice",
      store: new DbDeploymentStore({ userId: "alice" }),
      settings: new DbDeploymentSettingsStore(),
      deployerFactories: factories
    });
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    await alice.apply("prod");

    const ctx = runpod.deployers.at(-1)!.contexts[0];
    expect(ctx.credentials.RUNPOD_API_KEY).toBe("from-secret-store");
    // And the DB-only path did not leak into process.env.
    expect(process.env.RUNPOD_API_KEY).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Audit + lifecycle (unchanged intent).
  // ---------------------------------------------------------------------------

  it("audits successful and failed deployer calls in the DB", async () => {
    const alice = makeManager("alice", { RUNPOD_API_KEY: "k" });
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    await alice.apply("prod");

    let entries = await DeploymentAudit.listForUser("alice");
    expect(entries.some((e) => e.action === "deployment.create")).toBe(true);
    expect(
      entries.some(
        (e) =>
          e.action === "deployment.apply" &&
          e.status === "ok" &&
          e.deployment_name === "prod"
      )
    ).toBe(true);

    // Force an apply error via a failing factory.
    const failingFactory: DeployerFactory = () => ({
      plan: vi.fn(),
      apply: vi.fn(async () => {
        throw new Error("simulated failure");
      }),
      status: vi.fn(),
      logs: vi.fn(),
      destroy: vi.fn()
    });
    const failingMgr = new UserDeploymentManager({
      userId: "alice",
      store: new DbDeploymentStore({ userId: "alice" }),
      settings: new DbDeploymentSettingsStore(),
      deployerFactories: { runpod: failingFactory },
      secretResolver: async (k) => (k === "RUNPOD_API_KEY" ? "k" : null)
    });
    await expect(failingMgr.apply("prod")).rejects.toThrow("simulated failure");

    entries = await DeploymentAudit.listForUser("alice");
    const errEntry = entries.find(
      (e) => e.action === "deployment.apply" && e.status === "error"
    );
    expect(errEntry).toBeDefined();
    expect(errEntry!.error).toBe("simulated failure");
  });

  it("audits a missing-deployment error", async () => {
    const alice = makeManager("alice");
    await expect(alice.apply("ghost")).rejects.toThrow();
    const entries = await DeploymentAudit.listForUser("alice");
    const last = entries[0];
    expect(last.status).toBe("error");
    expect(last.deployment_name).toBe("ghost");
  });

  it("rejects invalid deployment names", async () => {
    const alice = makeManager("alice");
    await expect(
      alice.upsertDeployment("../escape", RUNPOD_DEPLOYMENT)
    ).rejects.toThrow();
    await expect(
      alice.upsertDeployment("with space", RUNPOD_DEPLOYMENT)
    ).rejects.toThrow();
  });

  it("removeDeployment requires the deployment to exist", async () => {
    const alice = makeManager("alice");
    await expect(alice.removeDeployment("ghost")).rejects.toThrow(/not found/);
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    await alice.removeDeployment("prod");
    expect(await alice.listDeployments()).toEqual([]);
  });
});
