import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  hashPlanKey,
  InMemoryPlanCache,
  FilePlanCache,
  InMemoryCheckpointStore,
  FileCheckpointStore,
  type Checkpoint
} from "../src/checkpoint-store.js";
import type { TaskPlan } from "../src/types.js";

function samplePlan(title = "Plan A"): TaskPlan {
  return {
    title,
    tasks: [
      {
        id: "task_1",
        title: "Task One",
        dependsOn: [],
        steps: [
          { id: "task_1_s1", instructions: "Do it", dependsOn: [], completed: false, logs: [] }
        ]
      }
    ]
  };
}

async function tmpFile(name: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-ckpt-"));
  return path.join(dir, name);
}

describe("hashPlanKey", () => {
  it("is stable for identical input", () => {
    const a = hashPlanKey({ objective: "obj", tools: ["a", "b"], model: "m" });
    const b = hashPlanKey({ objective: "obj", tools: ["a", "b"], model: "m" });
    expect(a).toBe(b);
  });

  it("is order-insensitive on tools", () => {
    const a = hashPlanKey({ objective: "obj", tools: ["a", "b", "c"] });
    const b = hashPlanKey({ objective: "obj", tools: ["c", "a", "b"] });
    expect(a).toBe(b);
  });

  it("differs when objective differs", () => {
    const a = hashPlanKey({ objective: "obj1", tools: ["a"] });
    const b = hashPlanKey({ objective: "obj2", tools: ["a"] });
    expect(a).not.toBe(b);
  });

  it("differs when the tool set differs", () => {
    const a = hashPlanKey({ objective: "obj", tools: ["a"] });
    const b = hashPlanKey({ objective: "obj", tools: ["a", "b"] });
    expect(a).not.toBe(b);
  });

  it("differs when the model differs", () => {
    const a = hashPlanKey({ objective: "obj", tools: ["a"], model: "m1" });
    const b = hashPlanKey({ objective: "obj", tools: ["a"], model: "m2" });
    expect(a).not.toBe(b);
  });

  it("treats absent model the same across calls", () => {
    const a = hashPlanKey({ objective: "obj", tools: ["a"] });
    const b = hashPlanKey({ objective: "obj", tools: ["a"] });
    expect(a).toBe(b);
  });
});

describe("InMemoryPlanCache", () => {
  it("round-trips a plan", () => {
    const cache = new InMemoryPlanCache();
    const key = hashPlanKey({ objective: "obj", tools: ["a"] });
    expect(cache.get(key)).toBeUndefined();
    const plan = samplePlan();
    cache.set(key, plan);
    expect(cache.get(key)).toEqual(plan);
  });
});

describe("FilePlanCache", () => {
  it("persists across instances", async () => {
    const file = await tmpFile("plans.json");
    const key = hashPlanKey({ objective: "obj", tools: ["a"] });
    const plan = samplePlan("Persisted");

    const writer = new FilePlanCache(file);
    await writer.load();
    writer.set(key, plan);
    // Await the fire-and-forget write instead of racing a fixed delay.
    await writer.flush();

    const reader = new FilePlanCache(file);
    await reader.load();
    expect(reader.get(key)).toEqual(plan);
  });

  it("starts empty when the file is missing", async () => {
    const file = await tmpFile("missing.json");
    const cache = new FilePlanCache(file);
    await cache.load();
    expect(cache.get("anything")).toBeUndefined();
  });

  it("degrades gracefully on a corrupt file", async () => {
    const file = await tmpFile("corrupt.json");
    await fs.writeFile(file, "{not json", "utf-8");
    const cache = new FilePlanCache(file);
    await cache.load();
    expect(cache.get("anything")).toBeUndefined();
  });
});

describe("InMemoryCheckpointStore", () => {
  it("round-trips a checkpoint", () => {
    const store = new InMemoryCheckpointStore();
    expect(store.load("run1")).toBeUndefined();
    const ckpt: Checkpoint = {
      planHash: "h",
      completedTaskIds: ["t1"],
      taskResults: { t1: { done: true } }
    };
    store.save("run1", ckpt);
    expect(store.load("run1")).toEqual(ckpt);
  });
});

describe("FileCheckpointStore", () => {
  it("persists across instances", async () => {
    const file = await tmpFile("ckpt.json");
    const ckpt: Checkpoint = {
      planHash: "h",
      completedTaskIds: ["t1", "t2"],
      taskResults: { t1: 1, t2: 2 }
    };

    const writer = new FileCheckpointStore(file);
    await writer.loadFromDisk();
    writer.save("run1", ckpt);
    await new Promise((r) => setTimeout(r, 20));

    const reader = new FileCheckpointStore(file);
    await reader.loadFromDisk();
    expect(reader.load("run1")).toEqual(ckpt);
  });

  it("starts empty when the file is missing", async () => {
    const file = await tmpFile("none.json");
    const store = new FileCheckpointStore(file);
    await store.loadFromDisk();
    expect(store.load("run1")).toBeUndefined();
  });
});
