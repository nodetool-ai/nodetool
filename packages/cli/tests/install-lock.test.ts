import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireInstallLock, withInstallLock } from "../src/install-lock.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "nodetool-lock-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("shared installer lock", () => {
  it.each(["", ".", ".."])("rejects invalid lock name %s", async (name) => {
    await expect(acquireInstallLock(root, name)).rejects.toThrow(/must stay inside/);
  });
  it("waits for the owner, then acquires after release", async () => {
    const release = await acquireInstallLock(root, ".lock");
    let acquired = false;
    const next = acquireInstallLock(root, ".lock", { pollMs: 5, timeoutMs: 1000 }).then((unlock) => {
      acquired = true;
      return unlock;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(acquired).toBe(false);
    await release();
    await (await next)();
  });
  it("removes a stale lock and releases after an action fails", async () => {
    const path = join(root, ".lock");
    await writeFile(path, "old owner");
    const past = new Date(Date.now() - 61_000);
    await utimes(path, past, past);
    await expect(withInstallLock(root, ".lock", async () => { throw new Error("failed install"); })).rejects.toThrow("failed install");
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("does not release a replacement owner's lock", async () => {
    const release = await acquireInstallLock(root, ".lock");
    await rm(join(root, ".lock"));
    await writeFile(join(root, ".lock"), "replacement owner");
    await release();
    expect(await readFile(join(root, ".lock"), "utf8")).toBe("replacement owner");
  });
  it("serializes concurrent stale recovery without overlapping critical sections", async () => {
    const path = join(root, ".lock");
    await writeFile(path, "stale owner");
    const past = new Date(Date.now() - 61_000);
    await utimes(path, past, past);
    let active = 0;
    let maximum = 0;
    await Promise.all(Array.from({ length: 30 }, () => withInstallLock(root, ".lock", async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
    }, { pollMs: 1, timeoutMs: 5000 })));
    expect(maximum).toBe(1);
  });

  it("refuses to steal an abandoned mutation guard", async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(root, ".lock.guard"));
    await expect(acquireInstallLock(root, ".lock", { timeoutMs: 10, pollMs: 1 })).rejects.toThrow(/If its owner stopped, remove this directory/);
    await expect(readFile(join(root, ".lock"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("times out and supports cancellation while waiting", async () => {
    const release = await acquireInstallLock(root, ".lock");
    try {
      await expect(acquireInstallLock(root, ".lock", { timeoutMs: 5, pollMs: 5 })).rejects.toThrow(/Timed out/);
      const controller = new AbortController();
      const waiting = acquireInstallLock(root, ".lock", { signal: controller.signal });
      controller.abort();
      await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      await release();
    }
  });
  it("keeps its heartbeat fresh while an installer waits", async () => {
    const release = await acquireInstallLock(root, ".lock", { heartbeatMs: 5 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      await expect(acquireInstallLock(root, ".lock", { timeoutMs: 30, staleMs: 20, pollMs: 5 })).rejects.toThrow(/Timed out/);
    } finally {
      await release();
    }
  });
});

describe("cross-process exclusion", () => {
  it("makes a second installer process wait for the first owner", async () => {
    const { spawn } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const moduleUrl = new URL("../src/install-lock.ts", import.meta.url).href;
    const tsxApi = fileURLToPath(new URL("../../../node_modules/tsx/dist/esm/api/index.mjs", import.meta.url));
    const childScript = join(root, "installer.mjs");
    await writeFile(childScript, `
      import { tsImport } from ${JSON.stringify(tsxApi)};
      const { acquireInstallLock } = await tsImport(${JSON.stringify(moduleUrl)}, import.meta.url);
      const release = await acquireInstallLock(process.argv[2], ".lock", { pollMs: 5 });
      process.stdout.write("acquired\\n");
      await release();
    `);
    const release = await acquireInstallLock(root, ".lock");
    const child = spawn(process.execPath, [childScript, root], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { errors += chunk.toString(); });
    const finished = new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", resolve);
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(output).toBe("");
      expect(child.exitCode).toBeNull();
      await release();
      expect(await finished, errors).toBe(0);
      expect(output).toBe("acquired\n");
    } finally {
      child.kill();
      await release();
      await finished;
    }
  });
});
