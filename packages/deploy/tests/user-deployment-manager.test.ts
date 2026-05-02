import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  initTestDb,
  Deployment,
  DeploymentAudit
} from "@nodetool-ai/models";
import { generateMasterKey } from "@nodetool-ai/security";
import {
  UserDeploymentManager,
  QuotaExceededError,
  findQuotaViolations
} from "../src/user-deployment-manager.js";
import { DbDeploymentStore } from "../src/db-deployment-store.js";
import { DbDeploymentSettingsStore } from "../src/db-deployment-settings-store.js";
import type { Deployer, DeployerFactory } from "../src/manager.js";
import type { AnyDeployment } from "../src/deployment-config.js";

interface RecordingDeployer extends Deployer {
  envSnapshots: Record<string, string | undefined>[];
}

function makeRecordingFactory(): {
  factory: DeployerFactory;
  deployers: RecordingDeployer[];
} {
  const deployers: RecordingDeployer[] = [];
  const factory: DeployerFactory = () => {
    const envSnapshots: Record<string, string | undefined>[] = [];
    const snap = (op: string) => {
      envSnapshots.push({
        op,
        RUNPOD_API_KEY: process.env.RUNPOD_API_KEY,
        NODETOOL_USER_ID: process.env.NODETOOL_USER_ID
      });
    };
    const d: RecordingDeployer = {
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

describe("findQuotaViolations", () => {
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
  let masterKey: string;
  let runpod: { factory: DeployerFactory; deployers: RecordingDeployer[] };
  let factories: Record<string, DeployerFactory>;

  beforeEach(() => {
    initTestDb();
    masterKey = generateMasterKey();
    runpod = makeRecordingFactory();
    factories = { runpod: runpod.factory };
  });

  afterEach(() => {
    delete process.env.RUNPOD_API_KEY;
    delete process.env.NODETOOL_USER_ID;
  });

  function makeManager(userId: string): UserDeploymentManager {
    return new UserDeploymentManager({
      userId,
      store: new DbDeploymentStore({ userId }),
      settings: new DbDeploymentSettingsStore({ getMasterKey: () => masterKey }),
      deployerFactories: factories
    });
  }

  it("rejects empty userId", () => {
    expect(
      () =>
        new UserDeploymentManager({
          userId: "",
          store: new DbDeploymentStore({ userId: "x" }),
          settings: new DbDeploymentSettingsStore({
            getMasterKey: () => masterKey
          }),
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

    // Direct DB check too.
    expect(await Deployment.listForUser("alice")).toHaveLength(1);
    expect(await Deployment.listForUser("bob")).toHaveLength(0);
  });

  it("enforces max_deployments quota", async () => {
    const tiny = makeManager("tiny");
    await tiny["settings"].setQuota("tiny", { max_deployments: 1 });

    await tiny.upsertDeployment("a", RUNPOD_DEPLOYMENT);
    await expect(tiny.upsertDeployment("b", RUNPOD_DEPLOYMENT)).rejects.toBeInstanceOf(
      QuotaExceededError
    );
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

  it("injects credentials only during the deployer call", async () => {
    const alice = makeManager("alice");
    await alice["settings"].setCredential(
      "alice",
      "RUNPOD_API_KEY",
      "alice-token"
    );
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);

    expect(process.env.RUNPOD_API_KEY).toBeUndefined();
    expect(process.env.NODETOOL_USER_ID).toBeUndefined();

    await alice.apply("prod");

    expect(process.env.RUNPOD_API_KEY).toBeUndefined();
    expect(process.env.NODETOOL_USER_ID).toBeUndefined();

    const snap = runpod.deployers[0].envSnapshots[0];
    expect(snap.RUNPOD_API_KEY).toBe("alice-token");
    expect(snap.NODETOOL_USER_ID).toBe("alice");
  });

  it("does not leak credentials across users under concurrent calls", async () => {
    const alice = makeManager("alice");
    const bob = makeManager("bob");
    await alice["settings"].setCredential("alice", "RUNPOD_API_KEY", "alice-key");
    await bob["settings"].setCredential("bob", "RUNPOD_API_KEY", "bob-key");
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    await bob.upsertDeployment("prod", RUNPOD_DEPLOYMENT);

    const [a, b] = await Promise.all([alice.apply("prod"), bob.apply("prod")]);
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    const snaps = runpod.deployers.map((d) => d.envSnapshots[0]);
    const keyByUser = new Map(
      snaps.map((s) => [s.NODETOOL_USER_ID, s.RUNPOD_API_KEY])
    );
    expect(keyByUser.get("alice")).toBe("alice-key");
    expect(keyByUser.get("bob")).toBe("bob-key");

    expect(process.env.RUNPOD_API_KEY).toBeUndefined();
    expect(process.env.NODETOOL_USER_ID).toBeUndefined();
  });

  it("restores prior env values after a deployer call", async () => {
    process.env.RUNPOD_API_KEY = "outer-value";
    process.env.NODETOOL_USER_ID = "outer-user";

    try {
      const alice = makeManager("alice");
      await alice["settings"].setCredential(
        "alice",
        "RUNPOD_API_KEY",
        "inner-value"
      );
      await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
      await alice.apply("prod");

      expect(process.env.RUNPOD_API_KEY).toBe("outer-value");
      expect(process.env.NODETOOL_USER_ID).toBe("outer-user");
    } finally {
      delete process.env.RUNPOD_API_KEY;
      delete process.env.NODETOOL_USER_ID;
    }
  });

  it("audits successful and failed deployer calls in the DB", async () => {
    const alice = makeManager("alice");
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
      settings: new DbDeploymentSettingsStore({ getMasterKey: () => masterKey }),
      deployerFactories: { runpod: failingFactory }
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
