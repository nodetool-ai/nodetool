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
import * as npmRunner from "@nodetool-ai/pack-manager/npm-runner";

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
  registerRuntimeCommands(program);
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

    // The npm packages plus sd-cpp, the one binary package.
    expect(listed.packages.map((row) => row.id).sort()).toEqual(
      [...Object.keys(RUNTIME_NPM_PACKAGES), "sd-cpp"].sort()
    );
    const byId = new Map(listed.packages.map((row) => [row.id, row]));
    expect(byId.get("tokenizer")).toMatchObject({ installed: true, version: "1.0.21" });
    expect(byId.get("email-imap")).toMatchObject({ installed: false });
    expect(byId.get("fabric")).toMatchObject({ installed: false });
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
