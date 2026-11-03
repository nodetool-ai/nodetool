import { win32 } from "node:path";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ fail: false, calls: [] as Array<{ args: string[]; cwd: string }> }));
vi.mock("node:fs", () => ({ existsSync: () => true }));
vi.mock("node:child_process", () => ({ spawn: (_file: string, args: string[], options: { cwd: string }) => {
  mock.calls.push({ args, cwd: options.cwd });
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
  queueMicrotask(() => {
    if (mock.fail) {
      child.emit("error", new Error("spawn ENOENT"));
      child.stdout.emit("error", new Error("read ENOTCONN stdout"));
      child.stderr.emit("error", new Error("read ENOTCONN stderr"));
    } else {
      child.stdout.emit("data", Buffer.from("11.16.0\n")); child.emit("close", 0);
    }
  });
  return child;
} }));
import { installerNpmVersion, runInstallerNpm } from "../src/npm-runner.js";

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
afterEach(() => { mock.fail = false; mock.calls.length = 0; Object.defineProperty(process, "platform", platform); });

it("rejects spawn and both pipe errors without unhandled stream exceptions", async () => {
  mock.fail = true;
  await expect(installerNpmVersion(".")).rejects.toThrow("spawn ENOENT");
});

it("Windows long roots launch a fixed bootstrap with the root and npm arguments passed as data", async () => {
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  const root = "C:\\fixture\\" + Array.from({ length: 7 }, (_, i) => `segment-${i}-${"x".repeat(35)}`).join("\\");
  await runInstallerNpm(root, ["install"]);
  expect(mock.calls).toHaveLength(2);
  for (const call of mock.calls) {
    expect(call.cwd).toBe(win32.toNamespacedPath(root));
    expect(call.args[0]).toBe("-e"); expect(call.args[1]).toContain("process.chdir(physicalRoot)");
    expect(call.args[1]).not.toContain(root); expect(call.args[2]).toBe(root);
    expect(call.args.some(arg => arg.startsWith("--prefix="))).toBe(false);
  }
  expect(mock.calls[1].args).toContain("--dry-run=false");
  expect(mock.calls[1].args).toContain("--ignore-scripts");
  expect(mock.calls[1].args).toContain("--global=false");
});

it("short Windows and long POSIX working directories retain their existing npm invocation", async () => {
  const root = "/fixture/" + "x".repeat(300);
  await installerNpmVersion(root);
  expect(mock.calls[0].cwd).toBe(root); expect(mock.calls[0].args.at(-1)).toBe("--version");
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  await installerNpmVersion("C:\\fixture");
  expect(mock.calls[1].cwd).toBe("C:\\fixture"); expect(mock.calls[1].args.at(-1)).toBe("--version");
});

it("the child bootstrap rejects zero or mismatched directory identities before loading npm", async () => {
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  const root = "C:\\long\\" + "x".repeat(270);
  await installerNpmVersion(root);
  const code = mock.calls[0].args[1];
  for (const inode of [0n, 2n]) {
    const load = vi.fn();
    const processFixture = { argv: [process.execPath, root, "fixture-cli"], cwd: () => "\\\\?\\C:\\SHORT~1", chdir: vi.fn() };
    const requireFixture = (name: string) => {
      if (name === "node:fs") { return { statSync: (path: string) => ({ dev: 1n, ino: path === root ? 1n : inode, isDirectory: () => true }) }; }
      if (name === "node:path") { return win32; }
      return load(name);
    };
    expect(() => runInNewContext(code, { process: processFixture, require: requireFixture })).toThrow(/verified short path/);
    expect(load).not.toHaveBeenCalled(); expect(processFixture.chdir).not.toHaveBeenCalled();
  }
});

it("the verified child retains logical cwd and maps lifecycle cwd to the same short physical directory", async () => {
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  const root = "C:\\long\\" + "x".repeat(270);
  await installerNpmVersion(root);
  const code = mock.calls[0].args[1];
  const physical = "C:\\SHORT~1";
  const spawn = vi.fn(); const children = { spawn }; const loaded = vi.fn();
  const mkdtemp = vi.fn(); const promiseFs = { mkdtemp };
  const processFixture = { argv: [process.execPath, root, "fixture-cli", "--version"], execPath: process.execPath,
    cwd: () => "\\\\?\\" + physical, chdir: vi.fn() };
  const requireFixture = (name: string) => {
    if (name === "node:fs") { return { statSync: (path: string) => ({ dev: 1n, ino: path.includes("wrong-cache") ? (path.startsWith(root) ? 3n : 4n) : path.endsWith("pkg") ? 2n : 1n, isDirectory: () => true }) }; }
    if (name === "node:path") { return win32; }
    if (name === "node:fs/promises") { return promiseFs; }
    if (name === "node:child_process") { return children; }
    if (name === "node:module") { return { syncBuiltinESMExports: vi.fn() }; }
    return loaded(name);
  };
  runInNewContext(code, { process: processFixture, require: requireFixture });
  expect(processFixture.chdir).toHaveBeenCalledWith(physical);
  expect(processFixture.cwd()).toBe(root); expect(processFixture.argv).toEqual([process.execPath, "fixture-cli", "--version"]);
  expect(loaded).toHaveBeenCalledWith("fixture-cli");
  const options = { cwd: root + "\\pkg", env: { INIT_CWD: root }, shell: true };
  children.spawn("cmd.exe", ["/c", "fixture"], options);
  expect(spawn).toHaveBeenCalledWith("cmd.exe", ["/c", "fixture"], { ...options, cwd: physical + "\\pkg" });
  expect(options.cwd).toBe(root + "\\pkg");
  promiseFs.mkdtemp(root + "\\npm-cache\\tmp\\fixture-", "utf8");
  expect(mkdtemp).toHaveBeenCalledWith(physical + "\\npm-cache\\tmp\\fixture-", "utf8");
  promiseFs.mkdtemp(root + "\\npm-cache\\tmp\\", "utf8");
  expect(mkdtemp).toHaveBeenLastCalledWith(physical + "\\npm-cache\\tmp\\", "utf8");
  promiseFs.mkdtemp(root + "\\npm-cache\\tmp/", "utf8");
  expect(mkdtemp).toHaveBeenLastCalledWith(physical + "\\npm-cache\\tmp/", "utf8");
  promiseFs.mkdtemp(root + "\\wrong-cache\\fixture-", "utf8");
  expect(mkdtemp).toHaveBeenLastCalledWith(root + "\\wrong-cache\\fixture-", "utf8");
  promiseFs.mkdtemp("C:\\external\\" + "x".repeat(270), "utf8");
  expect(mkdtemp).toHaveBeenLastCalledWith("C:\\external\\" + "x".repeat(270), "utf8");
  promiseFs.mkdtemp(root, "utf8");
  expect(mkdtemp).toHaveBeenLastCalledWith(root, "utf8");
});
