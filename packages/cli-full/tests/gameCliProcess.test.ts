import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanupGameCliProcesses, runGameCli } from "./gameCliProcess.js";
import { withGameGoldenFontEnvironment } from "./gameGoldenFonts.js";

let directory: string;
let entry: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "game-cli-process-"));
  entry = join(directory, "child.mjs");
});
afterEach(async () => {
  await cleanupGameCliProcesses();
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

async function ready(path: string, signal: AbortSignal): Promise<void> {
  while (!existsSync(path)) {
    signal.throwIfAborted();
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    // A killed grandchild may wait for its init process to reap it on Linux.
    return process.platform !== "linux" || readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.[0] !== "Z";
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ESRCH" || error.code === "ENOENT")) { return false; }
    throw error;
  }
}

it("keeps the child clock and environment separate from the test worker", async (test) => {
  await writeFile(entry, "console.log(JSON.stringify({pid:process.pid,clock:performance.now(),cwd:process.cwd(),font:process.env.FONTCONFIG_FILE}));console.error('diagnostic');");
  const previous = process.exitCode;
  const clock = vi.spyOn(performance, "now").mockReturnValue(Number.POSITIVE_INFINITY);
  try {
    const result = await runGameCli([], { entry, signal: test.signal, cwd: directory,
      env: { ...process.env, FONTCONFIG_FILE: "fixture-fonts" } });
    const report = JSON.parse(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(report.pid).not.toBe(process.pid);
    expect(Number.isFinite(report.clock)).toBe(true);
    expect(report).toMatchObject({ cwd: directory, font: "fixture-fonts" });
    expect(result.stderr).toContain("diagnostic");
    expect(performance.now()).toBe(Number.POSITIVE_INFINITY);
    expect(process.exitCode).toBe(previous);
  } finally { clock.mockRestore(); }
});

it("retains a nonzero status even when the child prints valid JSON", async (test) => {
  await writeFile(entry, "console.log(JSON.stringify({error:'expected failure'}));process.exitCode=7;");
  const result = await runGameCli([], { entry, signal: test.signal });
  expect(result.exitCode).toBe(7);
  expect(JSON.parse(result.stdout)).toEqual({ error: "expected failure" });
});

it("does not report a signalled child as successful", async (test) => {
  await writeFile(entry, "process.kill(process.pid,'SIGTERM');");
  expect((await runGameCli([], { entry, signal: test.signal })).exitCode).not.toBe(0);
});

it("preserves malformed output for the caller's JSON assertion", async (test) => {
  await writeFile(entry, "process.stdout.write('{\"tick\":');");
  const result = await runGameCli([], { entry, signal: test.signal });
  expect(result.exitCode).toBe(0);
  expect(() => JSON.parse(result.stdout)).toThrow();
});

it("keeps a missing CLI entry as a failed startup", async (test) => {
  const result = await runGameCli([], { entry: join(directory, "missing.mjs"), signal: test.signal });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("MODULE_NOT_FOUND");
  expect(() => JSON.parse(result.stdout)).toThrow();
});

it("rejects output overflow and stops its producer", async (test) => {
  const pidFile = join(directory, "pid");
  await writeFile(entry, `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.stdout.write('x'.repeat(4096));setInterval(()=>{},1000);`);
  await expect(runGameCli([], { entry, signal: test.signal, maxOutputBytes: 128 })).rejects.toThrow("output exceeds 128 bytes");
  expect(running(Number(readFileSync(pidFile, "utf8")))).toBe(false);
});

it("rejects an already cancelled test without starting a child", async () => {
  const marker = join(directory, "started");
  await writeFile(entry, `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'started');`);
  const controller = new AbortController();
  controller.abort(new Error("test cancelled"));
  expect(() => runGameCli([], { entry, signal: controller.signal })).toThrow("test cancelled");
  expect(existsSync(marker)).toBe(false);
});

it("cancels the owned child and its resistant descendant", async (test) => {
  const marker = join(directory, "ready.json");
  const descendant = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,parent:process.ppid}));setInterval(()=>{},1000);`;
  await writeFile(entry, `import{spawn}from'node:child_process';process.on('SIGTERM',()=>{});spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore',1,2]});setInterval(()=>{},1000);`);
  const controller = new AbortController();
  const result = runGameCli([], { entry, signal: AbortSignal.any([test.signal, controller.signal]) });
  const rejected = expect(result).rejects.toThrow("test cancelled");
  await ready(marker, test.signal);
  const pids = JSON.parse(readFileSync(marker, "utf8"));
  expect(running(pids.pid)).toBe(true);
  controller.abort(new Error("test cancelled"));
  await rejected;
  await cleanupGameCliProcesses();
  expect(running(pids.pid)).toBe(false);
  expect(running(pids.parent)).toBe(false);
});

it("preserves cancellation when process-group termination reports an error", async (test) => {
  const marker = join(directory, "ready");
  await writeFile(entry, `import{writeFileSync}from'node:fs';process.on('SIGTERM',()=>{});writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000);`);
  const controller = new AbortController();
  const result = runGameCli([], { entry, signal: AbortSignal.any([test.signal, controller.signal]) });
  const reason = new Error("primary cancellation");
  const rejected = expect(result).rejects.toBe(reason);
  await ready(marker, test.signal);
  const kill = vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("denied"), { code: "EPERM" }); });
  try { controller.abort(reason); await rejected; } finally { kill.mockRestore(); }
  expect(running(Number(readFileSync(marker, "utf8")))).toBe(false);
});

it("stops an owned descendant that created its own process group", async (test) => {
  const marker = join(directory, "detached.json");
  const descendant = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,parent:process.ppid}));setInterval(()=>{},1000);`;
  await writeFile(entry, `import{spawn}from'node:child_process';process.on('SIGTERM',()=>{});spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'ignore'}).unref();setInterval(()=>{},1000);`);
  const controller = new AbortController();
  const result = runGameCli([], { entry, signal: AbortSignal.any([test.signal, controller.signal]) });
  const rejected = expect(result).rejects.toThrow("test cancelled");
  await ready(marker, test.signal);
  const pids = JSON.parse(readFileSync(marker, "utf8"));
  try {
    controller.abort(new Error("test cancelled"));
    await rejected;
    expect(running(pids.pid)).toBe(false);
    expect(running(pids.parent)).toBe(false);
  } finally {
    // This control must also clean up when run against the original group-only implementation.
    if (running(pids.pid)) { process.kill(pids.pid, "SIGKILL"); }
  }
});

it("preserves browser discovery when a CLI child inherits the golden font cache", async (test) => {
  const manifest = fileURLToPath(new URL("../package.json", import.meta.url));
  await writeFile(entry, `import{createRequire}from'node:module';const{chromium}=createRequire(${JSON.stringify(manifest)})('playwright');console.log(JSON.stringify(chromium.executablePath()));`);
  const browser = chromium.executablePath();
  await withGameGoldenFontEnvironment(join(directory, "fonts.conf"), join(directory, "font-cache"), async () => {
    const result = await runGameCli([], { entry, signal: test.signal });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toBe(browser);
  });
});

it("honors explicit and npm-configured browser paths and restores them", async () => {
  const keys = ["PLAYWRIGHT_BROWSERS_PATH", "npm_config_playwright_browsers_path", "npm_package_config_playwright_browsers_path"];
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const [key, value] of [[keys[0], "0"], [keys[0], "relative-browser-cache"], [keys[1], "0"], [keys[2], "relative-browser-cache"]]) {
      for (const name of keys) { delete process.env[name]; }
      process.env[key] = value;
      const before = process.env["PLAYWRIGHT_BROWSERS_PATH"];
      await withGameGoldenFontEnvironment(join(directory, "fonts.conf"), join(directory, "font-cache"), async () => {
        expect(process.env["PLAYWRIGHT_BROWSERS_PATH"]).toBe(value);
      });
      expect(process.env["PLAYWRIGHT_BROWSERS_PATH"]).toBe(before);
    }
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) { delete process.env[key]; } else { process.env[key] = previous[index]; }
    });
  }
});
