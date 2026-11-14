import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("protocol artifact test cache inputs", () => {
  it("hashes the files consumed by the SDK artifact tests", () => {
    const result = spawnSync(process.execPath, [
      "scripts/run-turbo.mjs", "run", "test",
      "--filter=@nodetool-ai/protocol", "--dry=json"
    ], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout);
    const task = plan.tasks.find((entry) => entry.taskId === "@nodetool-ai/protocol#test");
    expect(task).toBeDefined();
    for (const path of [
      "tests/sdk-protocol-artifacts.test.ts",
      "scripts/generate-sdk-protocol.ts",
      "schema/sdk-v1.manifest.json",
      "fixtures/sdk-v1/http-get-workflows.json"
    ]) {
      expect(Object.hasOwn(task.inputs, path), path).toBe(true);
    }
  }, 35_000);
});

describe("realtime compiler build cache inputs", () => {
  it("hashes the canonical schema consumed outside the package", () => {
    const result = spawnSync(process.execPath, [
      "scripts/run-turbo.mjs", "run", "build",
      "--filter=@nodetool-ai/realtime-compiler", "--dry=json"
    ], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout);
    const task = plan.tasks.find((entry) => entry.taskId === "@nodetool-ai/realtime-compiler#build");
    expect(task).toBeDefined();
    const inputs = Object.keys(task.inputs).map((path) => resolve(ROOT, "packages/realtime-compiler", path));
    expect(inputs).toContain(resolve(ROOT, "native/realtime/schema/plan-v1.schema.json"));
    expect(inputs).toContain(resolve(ROOT, "packages/realtime-compiler/scripts/prepare-schema.mjs"));
  }, 35_000);
});
