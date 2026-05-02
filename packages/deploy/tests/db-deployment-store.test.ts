import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "@nodetool-ai/models";
import { DbDeploymentStore } from "../src/db-deployment-store.js";
import type { AnyDeployment } from "../src/deployment-config.js";

const RUNPOD_DEPLOYMENT: AnyDeployment = {
  type: "runpod",
  enabled: true,
  image: {
    name: "owner/image",
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

describe("DbDeploymentStore", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("rejects construction without a userId", () => {
    expect(() => new DbDeploymentStore({ userId: "" })).toThrow();
  });

  it("loadConfig returns empty deployments for new users", async () => {
    const store = new DbDeploymentStore({ userId: "u1" });
    const cfg = await store.loadConfig();
    expect(cfg.deployments).toEqual({});
    expect(cfg.version).toBe("2.0");
  });

  it("upsert + get round-trip preserves typed config", async () => {
    const store = new DbDeploymentStore({ userId: "u1" });
    await store.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    const got = await store.getDeployment("prod");
    expect(got).not.toBeNull();
    expect(got!.type).toBe("runpod");
    if (got!.type === "runpod") {
      expect(got!.workers_max).toBe(2);
      expect(got!.gpu_types).toEqual(["ADA_24"]);
    }
  });

  it("isolates deployments between users", async () => {
    const alice = new DbDeploymentStore({ userId: "alice" });
    const bob = new DbDeploymentStore({ userId: "bob" });
    await alice.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    expect(await alice.listNames()).toEqual(["prod"]);
    expect(await bob.listNames()).toEqual([]);
    expect(await bob.getDeployment("prod")).toBeNull();
  });

  it("validates name to prevent path traversal", async () => {
    const store = new DbDeploymentStore({ userId: "u1" });
    await expect(
      store.upsertDeployment("../escape", RUNPOD_DEPLOYMENT)
    ).rejects.toThrow();
    await expect(
      store.upsertDeployment("with space", RUNPOD_DEPLOYMENT)
    ).rejects.toThrow();
  });

  it("readState/writeState round-trip with timestamp", async () => {
    const store = new DbDeploymentStore({ userId: "u1" });
    await store.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    expect((await store.readState("prod"))?.status).toBe("unknown");

    await store.writeState("prod", { status: "running" });
    const state = await store.readState("prod");
    expect(state?.status).toBe("running");
    expect(typeof state?.last_deployed).toBe("string");
  });

  it("writeState rejects unknown deployment", async () => {
    const store = new DbDeploymentStore({ userId: "u1" });
    await expect(store.writeState("ghost", { status: "x" })).rejects.toThrow();
  });

  it("getAllStates returns one entry per deployment", async () => {
    const store = new DbDeploymentStore({ userId: "u1" });
    await store.upsertDeployment("a", RUNPOD_DEPLOYMENT);
    await store.upsertDeployment("b", RUNPOD_DEPLOYMENT);
    const all = await store.getAllStates();
    expect(Object.keys(all).sort()).toEqual(["a", "b"]);
  });

  it("removeDeployment + removeAllForUser", async () => {
    const store = new DbDeploymentStore({ userId: "u1" });
    await store.upsertDeployment("a", RUNPOD_DEPLOYMENT);
    await store.upsertDeployment("b", RUNPOD_DEPLOYMENT);
    expect(await store.removeDeployment("a")).toBe(true);
    expect(await store.listNames()).toEqual(["b"]);
    expect(await store.removeAllForUser()).toBe(1);
    expect(await store.listNames()).toEqual([]);
  });

  it("getLastDeployed returns Date or null", async () => {
    const store = new DbDeploymentStore({ userId: "u1" });
    await store.upsertDeployment("prod", RUNPOD_DEPLOYMENT);
    expect(await store.getLastDeployed("prod")).toBeNull();
    await store.writeState("prod", { status: "running" });
    const last = await store.getLastDeployed("prod");
    expect(last).toBeInstanceOf(Date);
  });
});
