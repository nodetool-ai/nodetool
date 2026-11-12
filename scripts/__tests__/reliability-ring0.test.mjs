import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it.each([false, true])("runs every Ring 0 journey and propagates failure=%s", (fail) => {
  const root = mkdtempSync(join(tmpdir(), "ring0-launch-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "packages/cli/dist"), { recursive: true });
    writeFileSync(join(root, "scripts/reliability-ring0.mjs"), readFileSync(new URL("../reliability-ring0.mjs", import.meta.url)));
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { nodetool: "node ./packages/cli/dist/nodetool.js" } }));
    writeFileSync(join(root, "packages/cli/dist/nodetool.js"), `
      const { appendFileSync } = require("node:fs");
      const args = process.argv.slice(2);
      appendFileSync(process.env.RING0_CALLS, JSON.stringify(args) + "\\n");
      if (process.env.RING0_FAIL === "1" && args[2] === "fan-out-fan-in-dag") process.exit(2);
    `);
    const calls = join(root, "calls.jsonl");
    const result = spawnSync(process.execPath, [join(root, "scripts/reliability-ring0.mjs")], {
      cwd: root, encoding: "utf8", env: { ...process.env, RING0_CALLS: calls, RING0_FAIL: fail ? "1" : "0" }
    });
    expect(result.status, result.stderr).toBe(fail ? 1 : 0);
    const invocations = readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse);
    expect(invocations.map(args => args[2])).toEqual([
      "linear-text-pipeline", "fan-out-fan-in-dag", "fan-in-shared-list-handle",
      "error-in-one-branch", "mid-run-cancel-node", "mid-run-cancel-streaming",
      "streaming-input-complete", "workflow-loop", "slow-consumer-drain"
    ]);
    for (const args of invocations) {
      expect(args.slice(0, 2)).toEqual(["reliability", "run"]);
      expect(args.slice(3)).toEqual(["--surface", "kernel"]);
    }
    expect(result.stdout + result.stderr).toContain(fail ? "1/9 Ring 0" : "All 9 Ring 0");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
