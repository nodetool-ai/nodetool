import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function run(...args: string[]) {
  const directory = mkdtempSync(join(tmpdir(), "nodetool-installed-harness-"));
  try {
    return spawnSync(process.execPath, [
      "--import", import.meta.resolve("tsx"),
      resolve(import.meta.dirname, "../src/nodetool.ts"), "harness", ...args
    ], { cwd: directory, encoding: "utf8", timeout: 30_000 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("installed harness guidance", () => {
  it("explains the checkout requirement instead of throwing a Git stack", () => {
    const result = run("gate", "--dry-run", "--json");
    expect(result.status, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain("requires a NodeTool Git checkout");
    expect(result.stderr).not.toContain("at ");
    expect(result.stderr).not.toContain("fatal:");
  });

  it("distinguishes installed commands from repository checks", () => {
    const result = run("list", "--json");
    expect(result.status, result.stderr).toBe(0);
    const harnesses = JSON.parse(result.stdout);
    expect(harnesses.length).toBeGreaterThan(0);
    expect(harnesses.find((harness: { command: string }) => harness.command.startsWith("nodetool jsscript test"))).toMatchObject({ requiresCheckout: false });
    expect(harnesses.find((harness: { command: string }) => harness.command.startsWith("npm run test"))).toMatchObject({ requiresCheckout: true });
  });
});
