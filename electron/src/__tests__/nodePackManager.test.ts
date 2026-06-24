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
jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn(),
  readFile: jest.fn()
}));

const { spawn, spawnSync } = require("child_process");
const fsp = require("fs/promises");

import {
  getNodePackInstallRoot,
  installNodePack,
  uninstallNodePack,
  listInstalledNodePacks
} from "../nodePackManager";

type FakeProc = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

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

describe("nodePackManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubNpmFound();
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

    it("succeeds with a valid spec and npm exit 0", async () => {
      const proc = makeProc();
      stubNpmSpawn(proc);

      const promise = installNodePack("@acme/cool-nodes");
      process.nextTick(() => proc.emit("exit", 0));
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.message).toContain("Installed @acme/cool-nodes");
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

    it("accepts scoped packages with version", async () => {
      const proc = makeProc();
      stubNpmSpawn(proc);

      const promise = installNodePack("@scope/pkg@^2.0.0");
      process.nextTick(() => proc.emit("exit", 0));
      const result = await promise;

      expect(result.success).toBe(true);
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
      fsp.readFile.mockResolvedValueOnce(
        JSON.stringify({
          name: "cool-nodes",
          version: "1.2.3",
          nodetool: { type: "node-pack" }
        })
      );

      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([{ name: "cool-nodes", version: "1.2.3" }]);
    });

    it("skips packages without nodetool field", async () => {
      fsp.readdir.mockResolvedValueOnce(["regular-pkg"]);
      fsp.readFile.mockResolvedValueOnce(
        JSON.stringify({ name: "regular-pkg", version: "0.1.0" })
      );

      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([]);
    });

    it("scans scoped packages", async () => {
      fsp.readdir.mockResolvedValueOnce(["@acme"]);
      fsp.readdir.mockResolvedValueOnce(["nodes-a", "nodes-b"]);
      fsp.readFile
        .mockResolvedValueOnce(
          JSON.stringify({
            name: "@acme/nodes-a",
            version: "2.0.0",
            nodetool: true
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({ name: "@acme/nodes-b", version: "3.0.0" })
        );

      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([{ name: "@acme/nodes-a", version: "2.0.0" }]);
    });

    it("skips .bin and .cache directories", async () => {
      fsp.readdir.mockResolvedValueOnce([".bin", ".cache", "real-pkg"]);
      fsp.readFile.mockResolvedValueOnce(
        JSON.stringify({
          name: "real-pkg",
          version: "1.0.0",
          nodetool: {}
        })
      );

      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([{ name: "real-pkg", version: "1.0.0" }]);
    });

    it("skips packages with invalid JSON", async () => {
      fsp.readdir.mockResolvedValueOnce(["broken-pkg"]);
      fsp.readFile.mockResolvedValueOnce("not json");

      const packs = await listInstalledNodePacks();
      expect(packs).toEqual([]);
    });
  });
});
