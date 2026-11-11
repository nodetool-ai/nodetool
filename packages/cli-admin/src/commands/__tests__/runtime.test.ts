/**
 * `nodetool runtime` and the optional-node root it fills. The root lives in
 * the data directory, so each test points XDG_DATA_HOME / APPDATA at a
 * temporary directory and never touches the real one or the network.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUNTIME_NPM_PACKAGES } from "@nodetool-ai/protocol";

import {
  optionalNodeRoot,
  optionalNodeModulesDir,
  applyOptionalNodeModules
} from "@nodetool-ai/cli-common/optional-node-root";
import { registerRuntimeCommands } from "../runtime.js";
import { cliRuntimeRegistry, managedRuntimeIds } from "../runtime-managed.js";
import { pythonPackRepoId } from "../runtime-python-packs.js";
import * as npmRunner from "@nodetool-ai/pack-manager/npm-runner";

type PackResult = { success: boolean; message: string };
const installPythonPack = vi.fn<(host: unknown, repoId: string) => Promise<PackResult>>();
const uninstallPythonPack = vi.fn<(host: unknown, repoId: string) => Promise<PackResult>>();
const pythonPacks = {
  list: vi.fn(async () => []),
  install: installPythonPack,
  update: installPythonPack,
  remove: uninstallPythonPack
};

const ENV_KEYS = ["XDG_DATA_HOME", "APPDATA", "HOME", "USERPROFILE", "NODETOOL_OPTIONAL_NODE_MODULES", "NODETOOL_HOST", "PATH", "UV_TOOL_DIR", "UV_TOOL_BIN_DIR", "UV_PYTHON_INSTALL_DIR"];
let saved: Record<string, string | undefined>;
let dataHome: string;

beforeEach(async () => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  dataHome = await mkdtemp(join(tmpdir(), "nodetool-runtime-"));
  process.env["XDG_DATA_HOME"] = dataHome;
  process.env["APPDATA"] = dataHome;
  process.env["HOME"] = dataHome;
  process.env["USERPROFILE"] = dataHome;
  process.env["NODETOOL_HOST"] = "cli";
  delete process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.restoreAllMocks();
  await rm(dataHome, { recursive: true, force: true });
});

/** Install a fake package into the optional-node root. */
async function fakeInstall(name: string, version: string): Promise<void> {
  const dir = join(optionalNodeModulesDir(), name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify({ name, version }));
}

async function run(args: string[]): Promise<string> {
  const program = new Command().exitOverride();
  registerRuntimeCommands(program, { pythonPacks });
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  await program.parseAsync(["node", "nodetool", ...args]);
  return lines.join("\n");
}

describe("applyOptionalNodeModules", () => {
  it("sets the variable before node_modules exists so a later install can resolve", () => {
    applyOptionalNodeModules();
    expect(process.env["NODETOOL_OPTIONAL_NODE_MODULES"]).toBe(optionalNodeModulesDir());
  });

  it("points the variable at the root once something is installed", async () => {
    await fakeInstall("js-tiktoken", "1.0.21");
    applyOptionalNodeModules();
    expect(process.env["NODETOOL_OPTIONAL_NODE_MODULES"]).toBe(
      optionalNodeModulesDir()
    );
  });

  it("keeps a root the caller already chose", async () => {
    await fakeInstall("js-tiktoken", "1.0.21");
    process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = "/desktop/optional-node";
    applyOptionalNodeModules();
    expect(process.env["NODETOOL_OPTIONAL_NODE_MODULES"]).toBe(
      "/desktop/optional-node"
    );
  });
});

describe("nodetool runtime", () => {
  it("lists every catalog package with what the root holds", async () => {
    await fakeInstall("js-tiktoken", "1.0.21");
    // Only one half of a two-package runtime package: not installed.
    await fakeInstall("imapflow", "1.7.1");

    const listed = JSON.parse(await run(["runtime", "list", "--json"])) as {
      packages: Array<{ id: string; installed: boolean; version: string }>;
    };

    // The conda and uv tool packages, the npm packages, sd-cpp, the one
    // binary package, and Wan2GP, which its own installer sets up.
    expect(listed.packages.map((row) => row.id).sort()).toEqual(
      [...managedRuntimeIds(), ...Object.keys(RUNTIME_NPM_PACKAGES), "sd-cpp", "wan2gp"].sort()
    );
    expect(managedRuntimeIds()).toEqual(expect.arrayContaining(["python", "yt-dlp", "manimgx"]));
    const byId = new Map(listed.packages.map((row) => [row.id, row]));
    expect(byId.get("tokenizer")).toMatchObject({ installed: true, version: "1.0.21" });
    expect(byId.get("email-imap")).toMatchObject({ installed: false });
    expect(byId.get("fabric")).toMatchObject({ installed: false });
    expect(byId.get("wan2gp")).toMatchObject({ installed: false });
    expect(byId.get("python")).toMatchObject({ installed: false });
  });

  it("installs a conda package through the shared runtime registry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const registry = cliRuntimeRegistry();
    vi.spyOn(registry, "status").mockResolvedValue({ id: "python", installed: false });
    const install = vi.spyOn(registry, "runToCompletion").mockResolvedValue({ success: true, message: "done" });
    const npm = vi.spyOn(npmRunner, "runNpm");

    await run(["runtime", "add", "python"]);

    expect(install).toHaveBeenCalledWith("python", "install", expect.any(Function));
    expect(npm).not.toHaveBeenCalled();
  });

  it("installs the dependencies of a package first", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const registry = cliRuntimeRegistry();
    const get = registry.get.bind(registry);
    vi.spyOn(registry, "get").mockImplementation((id) => {
      const pkg = get(id);
      return id === "yt-dlp" && pkg ? Object.assign(Object.create(pkg) as typeof pkg, { dependsOn: ["python"] }) : pkg;
    });
    vi.spyOn(registry, "status").mockImplementation(async (id) => ({ id, installed: false }));
    const install = vi.spyOn(registry, "runToCompletion").mockResolvedValue({ success: true, message: "done" });

    await run(["runtime", "add", "yt-dlp"]);

    expect(install.mock.calls.map((call) => call[0])).toEqual(["python", "yt-dlp"]);
  });

  it("repairs an installed package only with --reinstall and fails on an install error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const registry = cliRuntimeRegistry();
    vi.spyOn(registry, "status").mockResolvedValue({ id: "yt-dlp", installed: true });
    const install = vi.spyOn(registry, "runToCompletion").mockResolvedValue({ success: false, message: "micromamba failed" });

    await run(["runtime", "add", "yt-dlp"]);
    expect(install).not.toHaveBeenCalled();

    await expect(run(["runtime", "add", "yt-dlp", "--reinstall"])).rejects.toThrow(/micromamba failed/);
    expect(install).toHaveBeenCalledWith("yt-dlp", "repair", expect.any(Function));
  });

  it("removes a conda package through the shared runtime registry", async () => {
    const registry = cliRuntimeRegistry();
    const uninstall = vi.spyOn(registry, "uninstall").mockResolvedValue(undefined);
    await run(["runtime", "remove", "yt-dlp"]);
    expect(uninstall).toHaveBeenCalledWith("yt-dlp");
  });

  it("refuses an unknown id before it runs npm", async () => {
    await expect(run(["runtime", "add", "tokenizer", "left-pad"])).rejects.toThrow(
      /Unknown runtime package: left-pad/
    );
  });

  it("installs exact registry specs under the target lock with a module manifest", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const npm = vi.spyOn(npmRunner, "runNpm").mockImplementation(async (root) => {
      const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      expect(manifest).toMatchObject({ private: true, type: "module" });
      const lock = JSON.parse(await readFile(join(root, ".nodetool-runtime.lock"), "utf8"));
      expect(lock).toMatchObject({ pid: process.pid });
      expect(lock.token).toEqual(expect.any(String));
    });
    await run(["runtime", "add", "tokenizer"]);
    expect(npm).toHaveBeenCalledWith(optionalNodeRoot(),
      ["install", ...RUNTIME_NPM_PACKAGES.tokenizer.npmPackages],
      expect.objectContaining({ mode: "local", scriptPolicy: "user" }));
    await expect(readFile(join(optionalNodeRoot(), ".nodetool-runtime.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes only the requested package names under the same target lock", async () => {
    await writeFile(join(dataHome, "package.json"), "{}");
    await mkdir(optionalNodeRoot(), { recursive: true });
    await writeFile(join(optionalNodeRoot(), "package.json"), "{}");
    const npm = vi.spyOn(npmRunner, "runNpm").mockImplementation(async (root) => {
      expect(JSON.parse(await readFile(join(root, ".nodetool-runtime.lock"), "utf8"))).toMatchObject({ pid: process.pid });
    });
    await run(["runtime", "remove", "tokenizer"]);
    expect(npm).toHaveBeenCalledWith(optionalNodeRoot(),
      ["uninstall", ...RUNTIME_NPM_PACKAGES.tokenizer.packageNames],
      expect.objectContaining({ mode: "local", scriptPolicy: "user" }));
  });

  it("prints the root it installs into", async () => {
    expect(await run(["runtime", "path"])).toBe(join(dataHome, "nodetool", "optional-node"));
  });
});

describe("nodetool runtime python-packs", () => {
  it("names a pack by its distribution name or repo id", () => {
    expect(pythonPackRepoId("nodetool-huggingface")).toBe("nodetool-ai/nodetool-huggingface");
    expect(pythonPackRepoId("nodetool-ai/nodetool-mlx")).toBe("nodetool-ai/nodetool-mlx");
  });

  it("installs each pack and fails when one install fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installPythonPack
      .mockResolvedValueOnce({ success: true, message: "Installed nodetool-huggingface" })
      .mockResolvedValueOnce({ success: false, message: "No solution found" });

    await expect(run(["runtime", "python-packs", "add", "nodetool-huggingface", "nodetool-ai/nodetool-mlx"])).rejects.toThrow(
      "Failed: nodetool-ai/nodetool-mlx"
    );
    expect(installPythonPack.mock.calls.map((call) => call[1])).toEqual([
      "nodetool-ai/nodetool-huggingface",
      "nodetool-ai/nodetool-mlx"
    ]);
  });

  it("removes a pack", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    uninstallPythonPack.mockResolvedValueOnce({ success: true, message: "Uninstalled" });
    await run(["runtime", "python-packs", "remove", "nodetool-huggingface"]);
    expect(uninstallPythonPack).toHaveBeenCalledWith(expect.anything(), "nodetool-ai/nodetool-huggingface");
  });
});

describe("RUNTIME_NPM_PACKAGES", () => {
  it("pins every spec to an exact version of a package it names", () => {
    for (const [id, spec] of Object.entries(RUNTIME_NPM_PACKAGES)) {
      const names = spec.npmPackages.map((entry) => {
        const match = /^(@?[^@]+)@(?:npm:@typescript\/typescript6@)?(\d+\.\d+\.\d+)$/.exec(entry);
        expect(match, `${id}: ${entry} is not name@x.y.z`).not.toBeNull();
        return match?.[1];
      });
      expect([...names].sort(), id).toEqual([...spec.packageNames].sort());
    }
  });
});
