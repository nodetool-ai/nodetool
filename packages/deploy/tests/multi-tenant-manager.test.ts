import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

import { TenantStore, TenantSuspendedError } from "../src/tenant-store.js";
import {
  MultiTenantDeploymentManager,
  TenantScopedManager,
  QuotaExceededError,
  findQuotaViolations
} from "../src/multi-tenant-manager.js";
import type { Deployer, DeployerFactory } from "../src/manager.js";
import type { AnyDeployment } from "../src/deployment-config.js";
import { generateMasterKey } from "@nodetool-ai/security";

function makeTmpDir(): string {
  return path.join(os.tmpdir(), `nodetool-mt-mgr-${crypto.randomUUID()}`);
}

// Capture how each factory was invoked so tests can assert on the env at call time.
interface RecordingDeployer extends Deployer {
  envSnapshots: Record<string, string | undefined>[];
}

function makeRecordingFactory(): {
  factory: DeployerFactory;
  deployers: RecordingDeployer[];
} {
  const deployers: RecordingDeployer[] = [];
  const factory: DeployerFactory = (_name, _deployment, _state) => {
    const envSnapshots: Record<string, string | undefined>[] = [];
    const snap = (op: string) => {
      envSnapshots.push({
        op,
        RUNPOD_API_KEY: process.env.RUNPOD_API_KEY,
        NODETOOL_TENANT_ID: process.env.NODETOOL_TENANT_ID
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
  image: { name: "tenant/img", tag: "latest", registry: "docker.io", build: { platform: "linux/amd64", no_cache: false } },
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
    allowed_providers: [] as readonly string[],
    allowed_gpu_types: [] as readonly string[]
  };

  it("returns no violations for an in-quota deployment", () => {
    const v = findQuotaViolations(RUNPOD_DEPLOYMENT, {
      ...baseQuota,
      allowed_providers: [],
      allowed_gpu_types: []
    } as never);
    expect(v).toEqual([]);
  });

  it("flags workers_max overage", () => {
    const d = { ...RUNPOD_DEPLOYMENT, workers_max: 10 } as AnyDeployment;
    const v = findQuotaViolations(d, {
      ...baseQuota,
      allowed_providers: [],
      allowed_gpu_types: []
    } as never);
    expect(v.join(";")).toMatch(/workers_max/);
  });

  it("flags gpu_count overage", () => {
    const d = { ...RUNPOD_DEPLOYMENT, gpu_count: 8 } as AnyDeployment;
    const v = findQuotaViolations(d, {
      ...baseQuota,
      allowed_providers: [],
      allowed_gpu_types: []
    } as never);
    expect(v.join(";")).toMatch(/gpu_count/);
  });

  it("flags disallowed provider", () => {
    const v = findQuotaViolations(RUNPOD_DEPLOYMENT, {
      ...baseQuota,
      allowed_providers: ["docker"],
      allowed_gpu_types: []
    } as never);
    expect(v.join(";")).toMatch(/provider runpod/);
  });

  it("flags disallowed gpu type", () => {
    const v = findQuotaViolations(RUNPOD_DEPLOYMENT, {
      ...baseQuota,
      allowed_providers: [],
      allowed_gpu_types: ["AMPERE_24"]
    } as never);
    expect(v.join(";")).toMatch(/ADA_24/);
  });
});

describe("MultiTenantDeploymentManager", () => {
  let tmpDir: string;
  let store: TenantStore;
  let masterKey: string;
  let factories: Record<string, DeployerFactory>;
  let runpodFactory: { factory: DeployerFactory; deployers: RecordingDeployer[] };
  let mtm: MultiTenantDeploymentManager;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    masterKey = generateMasterKey();
    store = new TenantStore({
      baseDir: tmpDir,
      getMasterKey: () => masterKey
    });
    runpodFactory = makeRecordingFactory();
    factories = { runpod: runpodFactory.factory };
    mtm = new MultiTenantDeploymentManager({ store, deployerFactories: factories });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.RUNPOD_API_KEY;
    delete process.env.NODETOOL_TENANT_ID;
  });

  async function makeTenantManager(id: string): Promise<TenantScopedManager> {
    await store.createTenant({ id, display_name: id });
    return mtm.getTenantManager(id);
  }

  it("creates per-tenant deployment.yaml on upsert", async () => {
    const t = await makeTenantManager("acme");
    await t.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    const stat = await fs.stat(path.join(tmpDir, "acme", "deployment.yaml"));
    expect(stat.isFile()).toBe(true);
  });

  it("isolates deployments between tenants", async () => {
    const acme = await makeTenantManager("acme");
    const globex = await makeTenantManager("globex");

    await acme.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    expect((await acme.listDeployments()).map((d) => d.name)).toEqual(["prod"]);
    expect(await globex.listDeployments()).toEqual([]);
  });

  it("enforces max_deployments quota", async () => {
    await store.createTenant({
      id: "tiny",
      display_name: "Tiny",
      quota: { max_deployments: 1 }
    });
    const t = await mtm.getTenantManager("tiny");
    await t.upsertDeployment("a", RUNPOD_DEPLOYMENT);
    await expect(t.upsertDeployment("b", RUNPOD_DEPLOYMENT)).rejects.toBeInstanceOf(
      QuotaExceededError
    );
    // Updating an existing one is fine.
    await expect(
      t.upsertDeployment("a", RUNPOD_DEPLOYMENT)
    ).resolves.toBeDefined();
  });

  it("enforces workers_max quota", async () => {
    await store.createTenant({
      id: "limited",
      display_name: "Limited",
      quota: { max_workers_per_endpoint: 1 }
    });
    const t = await mtm.getTenantManager("limited");
    const overworker = { ...RUNPOD_DEPLOYMENT, workers_max: 2 } as AnyDeployment;
    await expect(t.upsertDeployment("p", overworker)).rejects.toBeInstanceOf(
      QuotaExceededError
    );
  });

  it("enforces allowed_providers quota", async () => {
    await store.createTenant({
      id: "docker-only",
      display_name: "Docker Only",
      quota: { allowed_providers: ["docker"] }
    });
    const t = await mtm.getTenantManager("docker-only");
    await expect(
      t.upsertDeployment("p", RUNPOD_DEPLOYMENT)
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("blocks mutation on suspended tenants", async () => {
    const t = await makeTenantManager("acme");
    await t.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    await store.setStatus("acme", "suspended");

    // Re-fetch to pick up the new status.
    const suspended = await mtm.getTenantManager("acme");
    await expect(
      suspended.upsertDeployment("prod2", RUNPOD_DEPLOYMENT)
    ).rejects.toBeInstanceOf(TenantSuspendedError);
    await expect(suspended.apply("prod")).rejects.toBeInstanceOf(
      TenantSuspendedError
    );
    await expect(suspended.destroy("prod")).rejects.toBeInstanceOf(
      TenantSuspendedError
    );

    // Read-only operations are still allowed.
    await expect(suspended.listDeployments()).resolves.toBeDefined();
    await expect(suspended.status("prod")).resolves.toBeDefined();
  });

  it("injects credentials only during the deployer call", async () => {
    const t = await makeTenantManager("acme");
    await store.setCredential("acme", "RUNPOD_API_KEY", "tenant-acme-token");
    await t.upsertDeployment("prod", RUNPOD_DEPLOYMENT);

    expect(process.env.RUNPOD_API_KEY).toBeUndefined();
    expect(process.env.NODETOOL_TENANT_ID).toBeUndefined();

    await t.apply("prod");

    expect(process.env.RUNPOD_API_KEY).toBeUndefined();
    expect(process.env.NODETOOL_TENANT_ID).toBeUndefined();

    const snap = runpodFactory.deployers[0].envSnapshots[0];
    expect(snap.RUNPOD_API_KEY).toBe("tenant-acme-token");
    expect(snap.NODETOOL_TENANT_ID).toBe("acme");
  });

  it("does not leak credentials across tenants under concurrent calls", async () => {
    const acme = await makeTenantManager("acme");
    const globex = await makeTenantManager("globex");
    await store.setCredential("acme", "RUNPOD_API_KEY", "acme-key");
    await store.setCredential("globex", "RUNPOD_API_KEY", "globex-key");
    await acme.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    await globex.upsertDeployment("prod", RUNPOD_DEPLOYMENT);

    // Fire both applies "concurrently"; the env mutex should serialize them
    // and the per-call snapshot must show the correct key for each.
    const [a, g] = await Promise.all([acme.apply("prod"), globex.apply("prod")]);
    expect(a).toBeDefined();
    expect(g).toBeDefined();

    const snaps = runpodFactory.deployers.map((d) => d.envSnapshots[0]);
    const keyByTenant = new Map(snaps.map((s) => [s.NODETOOL_TENANT_ID, s.RUNPOD_API_KEY]));
    expect(keyByTenant.get("acme")).toBe("acme-key");
    expect(keyByTenant.get("globex")).toBe("globex-key");

    expect(process.env.RUNPOD_API_KEY).toBeUndefined();
    expect(process.env.NODETOOL_TENANT_ID).toBeUndefined();
  });

  it("restores prior env values after a deployer call", async () => {
    process.env.RUNPOD_API_KEY = "outer-value";
    process.env.NODETOOL_TENANT_ID = "outer-tenant";

    try {
      const t = await makeTenantManager("acme");
      await store.setCredential("acme", "RUNPOD_API_KEY", "inner-value");
      await t.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
      await t.apply("prod");

      expect(process.env.RUNPOD_API_KEY).toBe("outer-value");
      expect(process.env.NODETOOL_TENANT_ID).toBe("outer-tenant");
    } finally {
      delete process.env.RUNPOD_API_KEY;
      delete process.env.NODETOOL_TENANT_ID;
    }
  });

  it("audits successful and failed deployer calls", async () => {
    const t = await makeTenantManager("acme");
    await t.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    await t.apply("prod");

    const auditPath = path.join(tmpDir, "acme", "audit.jsonl");
    const text = await fs.readFile(auditPath, "utf-8");
    const lines = text.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.some((l) => l.action === "deployment.create")).toBe(true);
    expect(
      lines.some(
        (l) => l.action === "deployment.apply" && l.status === "ok" && l.deployment === "prod"
      )
    ).toBe(true);

    // Now force an error.
    const failingFactory: DeployerFactory = () => ({
      plan: vi.fn(),
      apply: vi.fn(async () => {
        throw new Error("simulated failure");
      }),
      status: vi.fn(),
      logs: vi.fn(),
      destroy: vi.fn()
    });
    const failingMtm = new MultiTenantDeploymentManager({
      store,
      deployerFactories: { runpod: failingFactory }
    });
    const t2 = await failingMtm.getTenantManager("acme");
    await expect(t2.apply("prod")).rejects.toThrow("simulated failure");

    const text2 = await fs.readFile(auditPath, "utf-8");
    const errLine = text2
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .find((l) => l.action === "deployment.apply" && l.status === "error");
    expect(errLine).toBeDefined();
    expect(errLine.error).toBe("simulated failure");
  });

  it("audits a missing-deployment error", async () => {
    const t = await makeTenantManager("acme");
    await expect(t.apply("ghost")).rejects.toThrow();
    const text = await fs.readFile(
      path.join(tmpDir, "acme", "audit.jsonl"),
      "utf-8"
    );
    const last = JSON.parse(text.trim().split("\n").pop()!);
    expect(last.status).toBe("error");
    expect(last.deployment).toBe("ghost");
  });

  it("rejects invalid deployment names", async () => {
    const t = await makeTenantManager("acme");
    await expect(
      t.upsertDeployment("../escape", RUNPOD_DEPLOYMENT)
    ).rejects.toThrow();
    await expect(
      t.upsertDeployment("with space", RUNPOD_DEPLOYMENT)
    ).rejects.toThrow();
  });
});
