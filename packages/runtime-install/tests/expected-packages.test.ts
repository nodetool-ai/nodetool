import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, test, vi } from "vitest";

import { fakeHost } from "./fake-host.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../src/fs.js", () => ({ fileExists: vi.fn(async () => true), isErrnoException: () => false }));

import { spawn as spawnFn } from "node:child_process";
import { checkExpectedPackageVersions } from "../src/python-packs.js";

const spawn = vi.mocked(spawnFn) as unknown as ReturnType<typeof vi.fn>;

function listing(packages: Array<{ name: string; version: string }>): void {
  spawn.mockImplementation(() => {
    const proc = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: { write: vi.fn(), end: vi.fn() },
    });
    setTimeout(() => {
      proc.stdout.emit("data", Buffer.from(JSON.stringify(packages)));
      proc.emit("exit", 0);
      proc.emit("close", 0);
    }, 10);
    return proc;
  });
}

describe("checkExpectedPackageVersions", () => {
  beforeEach(() => {
    spawn.mockReset();
  });

  test("reads the installed set with one uv call", async () => {
    listing([{ name: "nodetool-core", version: "0.8.1" }]);

    await checkExpectedPackageVersions(fakeHost());

    expect(spawn.mock.calls.length).toBe(1);
  });

  test("never pins packs to the app version", async () => {
    listing([
      { name: "nodetool-core", version: "0.8.2" },
      { name: "nodetool-huggingface", version: "0.8.1" },
      { name: "nodetool-mlx", version: "0.7.2" },
    ]);

    expect(await checkExpectedPackageVersions(fakeHost())).toEqual([]);
  });

  test("flags core below the bridge protocol floor", async () => {
    listing([
      { name: "nodetool-core", version: "0.8.1" },
      { name: "nodetool-huggingface", version: "0.5.0" },
    ]);

    expect(await checkExpectedPackageVersions(fakeHost())).toEqual([
      { packageName: "nodetool-core", currentVersion: "0.8.1", expectedVersion: ">=0.8.2" },
    ]);
  });
});
