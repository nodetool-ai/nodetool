import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

it("includes every canonical game workload in the actual Turbo test input hash", () => {
  const report = JSON.parse(execFileSync(process.execPath, [resolve(root, "node_modules/turbo/bin/turbo"), "run", "test", "--filter=@nodetool-ai/game-runtime", "--dry-run=json"], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024
  }));
  const task = report.tasks.find((entry) => entry.taskId === "@nodetool-ai/game-runtime#test");
  expect(task).toBeDefined();
  const fixtures = readdirSync(resolve(root, "packages/game-runtime/bench")).filter((name) => name.endsWith(".json"));
  expect(fixtures.length).toBeGreaterThan(0);
  for (const fixture of fixtures) {
    expect(Object.hasOwn(task.inputs, `bench/${fixture}`), fixture).toBe(true);
  }
});
