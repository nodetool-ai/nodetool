/**
 * `npm run typecheck` dies with `JavaScript heap out of memory` when tsc
 * inherits Node's machine-derived default heap: web's program needs ~4.5 GiB
 * and the default is 2 GiB on a 16 GiB box. The runner exists only to raise
 * that ceiling, so the tests below drive it against a stub `tsc` that reports
 * the heap it was actually given — asserting the flag is present in the script
 * would pass even if the child never received it.
 */
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findTscBin } from "../run-tsc.mjs";
import { DEFAULT_TSC_HEAP_MB } from "../build-typescript-workspace.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const runner = join(repoRoot, "scripts", "run-tsc.mjs");

/** Stands in for `typescript/bin/tsc`, reporting what the runner handed it. */
const STUB_TSC = `import { getHeapStatistics } from "node:v8";
console.log(JSON.stringify({
  heapMb: Math.round(getHeapStatistics().heap_size_limit / 1048576),
  args: process.argv.slice(2)
}));
process.exit(Number(process.env.STUB_TSC_EXIT ?? 0));
`;

let workDir;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "run-tsc-"));
  const binDir = join(workDir, "node_modules", "typescript", "bin");
  await mkdir(binDir, { recursive: true });
  // `.mjs` so the stub is ESM regardless of any ambient package.json type.
  await writeFile(join(binDir, "tsc"), STUB_TSC);
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/** Runs the runner with `workDir` as cwd, so it resolves the stub tsc. */
function runRunner(env = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [runner, "--noEmit", "-p", "x.json"], {
      cwd: workDir,
      // A `--max-old-space-size` inherited from the ambient environment would
      // mask the runner's own flag, so NODE_OPTIONS starts empty.
      env: { ...process.env, NODE_OPTIONS: "", NODETOOL_TSC_HEAP_MB: "", ...env }
    });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.on("exit", (code) => resolvePromise({ code, stdout }));
  });
}

describe("findTscBin", () => {
  it("prefers the nearest node_modules over the repo root", () => {
    const exists = (p) => p === join("/repo", "mobile", "node_modules", "typescript", "bin", "tsc");
    expect(findTscBin("/repo/mobile/src", "/repo", exists)).toBe(
      join("/repo", "mobile", "node_modules", "typescript", "bin", "tsc")
    );
  });

  it("falls back to the repo root when the workspace has no own install", () => {
    const rootTsc = join("/repo", "node_modules", "typescript", "bin", "tsc");
    expect(findTscBin("/repo/mobile", "/repo", (p) => p === rootTsc)).toBe(rootTsc);
  });

  it("reports absence rather than a bogus path", () => {
    expect(findTscBin("/repo/mobile", "/repo", () => false)).toBeNull();
  });

  it("finds the real TypeScript this repo builds with", () => {
    expect(findTscBin(join(repoRoot, "web"))).toContain("typescript");
  });
});

describe("run-tsc", () => {
  it("raises the child heap to the default ceiling and forwards args", async () => {
    const { code, stdout } = await runRunner();
    const { heapMb, args } = JSON.parse(stdout);
    expect(code).toBe(0);
    expect(args).toEqual(["--noEmit", "-p", "x.json"]);
    // V8 rounds the requested size, so allow a small margin either way.
    expect(heapMb).toBeGreaterThan(DEFAULT_TSC_HEAP_MB * 0.9);
  });

  it("honours NODETOOL_TSC_HEAP_MB", async () => {
    const { stdout } = await runRunner({ NODETOOL_TSC_HEAP_MB: "3072" });
    const { heapMb } = JSON.parse(stdout);
    expect(heapMb).toBeGreaterThan(3072 * 0.9);
    expect(heapMb).toBeLessThan(DEFAULT_TSC_HEAP_MB * 0.9);
  });

  it("leaves an explicit NODE_OPTIONS heap flag alone", async () => {
    const { stdout } = await runRunner({ NODE_OPTIONS: "--max-old-space-size=3072" });
    const { heapMb } = JSON.parse(stdout);
    expect(heapMb).toBeLessThan(DEFAULT_TSC_HEAP_MB * 0.9);
  });

  it("propagates a non-zero tsc exit code so CI still fails on type errors", async () => {
    const { code } = await runRunner({ STUB_TSC_EXIT: "2" });
    expect(code).toBe(2);
  });
});
