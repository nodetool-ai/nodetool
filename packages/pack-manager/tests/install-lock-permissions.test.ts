import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withInstallLock } from "../src/install-lock.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, mkdir: vi.fn(actual.mkdir) };
});

const platform = process.platform;
let root: string;
beforeEach(async () => {
  vi.mocked(mkdir).mockReset();
  root = await mkdtemp(join(tmpdir(), "install-lock-permission-"));
});
afterEach(async () => {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  await rm(root, { recursive: true, force: true });
});

it("retries transient Windows guard failures before entering the critical section", async () => {
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  let attempts = 0;
  vi.mocked(mkdir).mockImplementation((...args) => {
    if (String(args[0]).endsWith(".guard") && ++attempts <= 2) {
      return Promise.reject(Object.assign(new Error("guard closing"), { code: "EPERM" }));
    }
    return actual.mkdir(...args);
  });
  const action = vi.fn(async () => "installed");
  await expect(withInstallLock(root, ".lock", action, { pollMs: 1 })).resolves.toBe("installed");
  expect(attempts).toBeGreaterThanOrEqual(3);
  expect(action).toHaveBeenCalledTimes(1);
});

it.each([
  ["win32", "EPERM", 11],
  ["win32", "EACCES", 1],
  ["linux", "EPERM", 1]
] as const)("bounds %s %s failures without entering the critical section", async (os, code, expectedAttempts) => {
  Object.defineProperty(process, "platform", { value: os, configurable: true });
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  const failure = Object.assign(new Error("permission denied"), { code });
  let attempts = 0;
  vi.mocked(mkdir).mockImplementation((...args) => {
    if (String(args[0]).endsWith(".guard")) {
      attempts++;
      return Promise.reject(failure);
    }
    return actual.mkdir(...args);
  });
  const action = vi.fn();
  await expect(withInstallLock(root, ".lock", action, { pollMs: 1 })).rejects.toBe(failure);
  expect(attempts).toBe(expectedAttempts);
  expect(action).not.toHaveBeenCalled();
});
