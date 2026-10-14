import { EventEmitter } from "node:events";
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
  await runInstallerNpm(root, ["install", "example@1"], { mode: "global", dryRun: true });
  expect(mock.calls).toHaveLength(2);
  for (const call of mock.calls) {
    expect(call.cwd.length).toBeLessThan(260);
    expect(root.startsWith(call.cwd + "\\")).toBe(true);
    expect(call.args[0]).toBe("-e"); expect(call.args[1]).toContain("process.chdir(root)");
    expect(call.args[1]).not.toContain(root); expect(call.args[2]).toBe(root);
    expect(call.args.some(arg => arg.startsWith("--prefix="))).toBe(false);
  }
  expect(mock.calls[1].args).toContain("--dry-run=true");
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
