import { EventEmitter } from "events";

jest.mock("child_process", () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn()
}));
jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/mock/userData")
  }
}));
jest.mock("../config", () => ({
  getProcessEnv: jest.fn().mockReturnValue({ PATH: "/mock/path" }),
  resolveNpmInvocation: jest
    .fn()
    .mockReturnValue({ command: "npm", baseArgs: [] })
}));
jest.mock("../logger", () => ({ logMessage: jest.fn() }));
jest.mock("@nodetool-ai/node-sdk/sandbox-pack-discovery", () => ({
  discoverSandboxPack: jest.fn()
}));
jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn(),
  rename: jest.fn(),
  readdir: jest.fn(),
  readFile: jest.fn()
}));

const { spawn, spawnSync } = require("child_process");
const fsp = require("fs/promises");
const { discoverSandboxPack } = require("@nodetool-ai/node-sdk/sandbox-pack-discovery");

import {
  getNodePackInstallRoot,
  installNodePack,
  trustNodePack,
  uninstallNodePack,
  listInstalledNodePacks
} from "../nodePackManager";

const ROOT = "/mock/userData/optional-node";
const LEDGER = `${ROOT}/nodetool-packs.json`;
const LOCKFILE = `${ROOT}/package-lock.json`;

type FakeProc = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

/** In-memory files the fs/promises mock reads and writes. */
let files: Record<string, string>;

function makeProc(): FakeProc {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter()
  });
}

function stubNpmFound(): void {
  spawnSync.mockReturnValue({ status: 0 });
}

function stubNpmSpawn(proc: FakeProc): void {
  spawn.mockReturnValue(proc);
}

function stubSuccessfulNpmSpawns(): void {
  spawn.mockImplementation(() => {
    const proc = makeProc();
    process.nextTick(() => proc.emit("exit", 0));
    return proc;
  });
}

function packageDir(name: string): string {
  return `${ROOT}/node_modules/${name}`;
}

function stubInstalledPackage(options: {
  readonly name: string;
  readonly version: string;
  readonly nodetool: Record<string, unknown>;
  readonly sandbox?: boolean;
  readonly lockfile?: Record<string, unknown>;
}): void {
  files[`${packageDir(options.name)}/package.json`] = JSON.stringify({
    name: options.name,
    version: options.version,
    nodetool: options.nodetool
  });
  files[LOCKFILE] = JSON.stringify({
    packages: options.lockfile ?? {
      [`node_modules/${options.name}`]: {
        version: options.version,
        resolved: `https://registry.example/${options.name}`,
        integrity: "sha512-test"
      }
    }
  });
  discoverSandboxPack.mockReturnValue(
    options.sandbox === true
      ? { name: options.name, version: options.version }
      : undefined
  );
}

/** A package.json for a `node_modules` listing, without the lockfile plumbing. */
function stubListedPackage(dir: string, contents: unknown): void {
  files[`${ROOT}/node_modules/${dir}/package.json`] =
    typeof contents === "string" ? contents : JSON.stringify(contents);
}

describe("nodePackManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubNpmFound();
    files = {};
    fsp.readFile.mockImplementation((path: string) => {
      const found = files[path];
      return found === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(found);
    });
    fsp.writeFile.mockImplementation((path: string, data: string) => {
      files[path] = data;
      return Promise.resolve();
    });
    fsp.rename.mockImplementation((from: string, to: string) => {
      const value = files[from];
      if (value !== undefined) {
        files[to] = value;
        delete files[from];
      }
      return Promise.resolve();
    });
    fsp.readdir.mockResolvedValue([]);
  });

  describe("getNodePackInstallRoot", () => {
    it("returns the expected path under userData", () => {
      const root = getNodePackInstallRoot();
      expect(root).toMatch(/\/mock\/userData\/optional-node$/);
    });
  });

  describe("installNodePack", () => {
    it("rejects invalid spec characters", async () => {
      const result = await installNodePack("rm -rf /");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid npm pack spec");
    });

    it("rejects empty string spec", async () => {
      const result = await installNodePack("");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid npm pack spec");
    });

    it("activates a sandbox-only pack with scripts disabled", async () => {
      const proc = makeProc();
      stubNpmSpawn(proc);
      stubInstalledPackage({
        name: "@acme/cool-nodes",
        version: "1.0.0",
        nodetool: { sandboxModules: [{ name: ".", kind: "js", file: "sandbox/index.js" }] },
        sandbox: true
      });

      const promise = installNodePack("@acme/cool-nodes");
      process.nextTick(() => proc.emit("exit", 0));
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.installation).toMatchObject({
        mode: "sandbox-only",
        scripts: "skipped",
        active: true,
        artifact: {
          version: "1.0.0",
          resolved: "https://registry.example/@acme/cool-nodes",
          integrity: "sha512-test"
        }
      });
      expect(spawn).toHaveBeenCalledWith(
        "npm",
        expect.arrayContaining(["install", "--ignore-scripts", "@acme/cool-nodes"]),
        expect.any(Object)
      );
    });

    it("fails when npm exits non-zero", async () => {
      const proc = makeProc();
      stubNpmSpawn(proc);

      const promise = installNodePack("some-pack@1.0.0");
      process.nextTick(() => proc.emit("exit", 1));
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.message).toContain("npm exited with code 1");
    });

    it("keeps a register pack inactive until trust is approved", async () => {
      stubSuccessfulNpmSpawns();
      stubInstalledPackage({
        name: "@scope/pkg",
        version: "2.0.0",
        nodetool: { register: "register" }
      });

      const result = await installNodePack("@scope/pkg@^2.0.0");

      expect(result.success).toBe(false);
      expect(result.installation).toMatchObject({
        mode: "register",
        scripts: "skipped",
        active: false
      });
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it("reports an unknown installed manifest without enabling scripts", async () => {
      stubSuccessfulNpmSpawns();
      stubInstalledPackage({
        name: "some-pack",
        version: "1.0.0",
        nodetool: {}
      });

      const result = await installNodePack("some-pack@1.0.0");

      expect(result.success).toBe(false);
      expect(result.installation).toMatchObject({
        mode: "unknown",
        scripts: "skipped",
        active: false
      });
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it("records the pack and its dependency closure in the ledger", async () => {
      stubSuccessfulNpmSpawns();
      stubInstalledPackage({
        name: "@scope/pkg",
        version: "2.0.0",
        nodetool: { register: "register" },
        lockfile: {
          "node_modules/@scope/pkg": {
            version: "2.0.0",
            resolved: "https://registry.example/@scope/pkg",
            integrity: "sha512-pkg",
            dependencies: { helper: "^1.0.0" }
          },
          "node_modules/helper": {
            version: "1.4.0",
            resolved: "https://registry.example/helper",
            integrity: "sha512-helper"
          },
          "node_modules/unrelated": { version: "9.9.9" }
        }
      });

      await installNodePack("@scope/pkg");

      const ledger = JSON.parse(files[LEDGER] ?? "{}");
      expect(ledger.packs["@scope/pkg"].dependencies).toEqual([
        {
          name: "helper",
          version: "1.4.0",
          resolved: "https://registry.example/helper",
          integrity: "sha512-helper"
        }
      ]);
    });
  });

  describe("trustNodePack", () => {
    async function installRegisterPack(
      lockfile?: Record<string, unknown>
    ): Promise<void> {
      stubSuccessfulNpmSpawns();
      stubInstalledPackage({
        name: "@scope/pkg",
        version: "2.0.0",
        nodetool: { register: "register" },
        // The stub reads `options.lockfile ?? <default>`, so an absent key and
        // an undefined one take the same branch.
        lockfile
      });
      await installNodePack("@scope/pkg");
      jest.clearAllMocks();
      stubNpmFound();
      stubSuccessfulNpmSpawns();
      discoverSandboxPack.mockReturnValue(undefined);
    }

    it("rejects a pack NodeTool never installed", async () => {
      const result = await trustNodePack("@scope/pkg");
      expect(result.success).toBe(false);
      expect(result.message).toContain("was not installed by NodeTool");
      expect(spawn).not.toHaveBeenCalled();
    });

    it("rebuilds the pack and its dependencies after verifying identity", async () => {
      await installRegisterPack({
        "node_modules/@scope/pkg": {
          version: "2.0.0",
          resolved: "https://registry.example/@scope/pkg",
          integrity: "sha512-pkg",
          dependencies: { helper: "^1.0.0" }
        },
        "node_modules/helper": {
          version: "1.4.0",
          resolved: "https://registry.example/helper",
          integrity: "sha512-helper"
        }
      });

      const result = await trustNodePack("@scope/pkg");

      expect(result.success).toBe(true);
      expect(result.installation).toMatchObject({
        mode: "register",
        scripts: "ran",
        active: true
      });
      expect(spawn).toHaveBeenCalledWith(
        "npm",
        expect.arrayContaining(["rebuild", "@scope/pkg", "helper"]),
        expect.any(Object)
      );
      expect(spawn.mock.calls[0][1]).not.toContain("install");
    });

    it("refuses when the artifact integrity changed since install", async () => {
      await installRegisterPack();
      files[LOCKFILE] = JSON.stringify({
        packages: {
          "node_modules/@scope/pkg": {
            version: "2.0.0",
            resolved: "https://registry.example/@scope/pkg",
            integrity: "sha512-swapped"
          }
        }
      });

      const result = await trustNodePack("@scope/pkg");

      expect(result.success).toBe(false);
      expect(result.message).toContain("integrity changed");
      expect(spawn).not.toHaveBeenCalled();
    });

    it("refuses when a dependency's artifact changed since install", async () => {
      await installRegisterPack({
        "node_modules/@scope/pkg": {
          version: "2.0.0",
          resolved: "https://registry.example/@scope/pkg",
          integrity: "sha512-pkg",
          dependencies: { helper: "^1.0.0" }
        },
        "node_modules/helper": {
          version: "1.4.0",
          resolved: "https://registry.example/helper",
          integrity: "sha512-helper"
        }
      });
      files[LOCKFILE] = JSON.stringify({
        packages: {
          "node_modules/@scope/pkg": {
            version: "2.0.0",
            resolved: "https://registry.example/@scope/pkg",
            integrity: "sha512-pkg",
            dependencies: { helper: "^1.0.0" }
          },
          "node_modules/helper": {
            version: "1.5.0",
            resolved: "https://registry.example/helper",
            integrity: "sha512-other"
          }
        }
      });

      const result = await trustNodePack("@scope/pkg");

      expect(result.success).toBe(false);
      expect(result.message).toContain("helper version changed");
      expect(spawn).not.toHaveBeenCalled();
    });

    it("refuses when the pack changed mode since install", async () => {
      await installRegisterPack();
      files[`${packageDir("@scope/pkg")}/package.json`] = JSON.stringify({
        name: "@scope/pkg",
        version: "2.0.0",
        nodetool: {}
      });

      const result = await trustNodePack("@scope/pkg");

      expect(result.success).toBe(false);
      expect(result.message).toContain("changed from register to unknown");
      expect(spawn).not.toHaveBeenCalled();
    });

    it("refuses a sandbox-only pack, which runs no host code", async () => {
      stubSuccessfulNpmSpawns();
      stubInstalledPackage({
        name: "@acme/sandbox",
        version: "1.0.0",
        nodetool: { sandboxModules: [{ name: ".", kind: "js", file: "s.js" }] },
        sandbox: true
      });
      await installNodePack("@acme/sandbox");
      jest.clearAllMocks();
      stubNpmFound();

      const result = await trustNodePack("@acme/sandbox");

      expect(result.success).toBe(false);
      expect(result.message).toContain("sandbox-only");
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe("uninstallNodePack", () => {
    it("rejects invalid name characters", async () => {
      const result = await uninstallNodePack("../../etc/passwd");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid npm pack name");
    });

    it("succeeds with valid name and npm exit 0", async () => {
      const proc = makeProc();
      stubNpmSpawn(proc);

      const promise = uninstallNodePack("@acme/cool-nodes");
      process.nextTick(() => proc.emit("exit", 0));
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.message).toContain("Uninstalled @acme/cool-nodes");
    });

    it("drops the ledger row so a reinstall is classified fresh", async () => {
      stubSuccessfulNpmSpawns();
      stubInstalledPackage({
        name: "@scope/pkg",
        version: "2.0.0",
        nodetool: { register: "register" }
      });
      await installNodePack("@scope/pkg");

      await uninstallNodePack("@scope/pkg");

      const ledger = JSON.parse(files[LEDGER] ?? "{}");
      expect(ledger.packs).toEqual({});
    });

    it("rejects name with version suffix", async () => {
      const result = await uninstallNodePack("pkg@1.0.0");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid npm pack name");
    });
  });

  describe("listInstalledNodePacks", () => {
    it("returns empty array when node_modules does not exist", async () => {
      fsp.readdir.mockRejectedValueOnce(new Error("ENOENT"));
      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([]);
    });

    it("finds packages with nodetool field", async () => {
      fsp.readdir.mockResolvedValueOnce(["cool-nodes"]);
      stubListedPackage("cool-nodes", {
        name: "cool-nodes",
        version: "1.2.3",
        nodetool: { type: "node-pack" }
      });

      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([{ name: "cool-nodes", version: "1.2.3" }]);
    });

    it("reports the install mode recorded in the ledger", async () => {
      stubSuccessfulNpmSpawns();
      stubInstalledPackage({
        name: "@scope/pkg",
        version: "2.0.0",
        nodetool: { register: "register" }
      });
      await installNodePack("@scope/pkg");
      fsp.readdir
        .mockResolvedValueOnce(["@scope"])
        .mockResolvedValueOnce(["pkg"]);

      const packs = await listInstalledNodePacks();

      expect(packs).toEqual([
        {
          name: "@scope/pkg",
          version: "2.0.0",
          installation: expect.objectContaining({
            mode: "register",
            active: false,
            scripts: "skipped"
          })
        }
      ]);
    });

    it("skips packages without nodetool field", async () => {
      fsp.readdir.mockResolvedValueOnce(["regular-pkg"]);
      stubListedPackage("regular-pkg", { name: "regular-pkg", version: "0.1.0" });

      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([]);
    });

    it("scans scoped packages", async () => {
      fsp.readdir
        .mockResolvedValueOnce(["@acme"])
        .mockResolvedValueOnce(["nodes-a", "nodes-b"]);
      stubListedPackage("@acme/nodes-a", {
        name: "@acme/nodes-a",
        version: "2.0.0",
        nodetool: true
      });
      stubListedPackage("@acme/nodes-b", {
        name: "@acme/nodes-b",
        version: "3.0.0"
      });

      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([{ name: "@acme/nodes-a", version: "2.0.0" }]);
    });

    it("skips .bin and .cache directories", async () => {
      fsp.readdir.mockResolvedValueOnce([".bin", ".cache", "real-pkg"]);
      stubListedPackage("real-pkg", {
        name: "real-pkg",
        version: "1.0.0",
        nodetool: {}
      });

      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([{ name: "real-pkg", version: "1.0.0" }]);
    });

    it("skips packages with invalid JSON", async () => {
      fsp.readdir.mockResolvedValueOnce(["broken-pkg"]);
      stubListedPackage("broken-pkg", "not json");

      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([]);
    });
  });
});
