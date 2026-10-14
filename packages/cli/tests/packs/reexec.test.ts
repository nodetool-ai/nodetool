import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { missingRuntimePackageError } from "@nodetool-ai/protocol";
import { createMissingPackError } from "@nodetool-ai/node-catalog";
import { installPacks } from "../../src/packs/installer.js";
import { installMissingPacksAndReexec } from "../../src/commands/install-missing-packs.js";
import { setupPackRegistry, disposePackRegistryFixtures } from "../_helpers/pack-registry.js";

afterEach(async () => { vi.unstubAllEnvs(); await disposePackRegistryFixtures(); });

describe("install and re-execute missing packs", () => {
  it("TTY-prompts, installs from the local registry, re-executes once and forwards the child's exit", async () => {
    const fixture = await setupPackRegistry();
    const catalog = fixture.request.catalog;
    const missing = createMissingPackError("fixture", [], { supported: true, reason: null, command: "nodetool nodes add fixture" }, catalog);
    const entry = join(fixture.directory, "run-child.mjs");
    const marker = join(fixture.directory, "child.json");
    const helper = pathToFileURL(resolve(import.meta.dirname, "../../src/commands/install-missing-packs.ts")).href;
    await writeFile(entry, `import { readFileSync, writeFileSync } from "node:fs";
      import { installMissingPacksAndReexec } from ${JSON.stringify(helper)};
      const repeated = await installMissingPacksAndReexec(${JSON.stringify(missing.details)}, { command: "run", installMissing: true }, {
        snapshot: async () => { throw new Error("re-executed child must not inspect installation"); },
        install: async () => { throw new Error("re-executed child must not install"); }
      });
      if (repeated !== null) throw new Error("Re-executed child retried installation");
      const installed = JSON.parse(readFileSync(${JSON.stringify(join(fixture.root, "node_modules/@nodetool-ai/fixture-nodes/package.json"))}, "utf8"));
      writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ flag: process.env.NODETOOL_PACKS_REEXEC, argv: process.argv.slice(1), installed: installed.version }));
      process.exit(23);`);
    const argv = process.argv;
    const execArgv = process.execArgv;
    const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    const stderrTty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });
    vi.stubEnv("CI", undefined);
    vi.stubEnv("NODETOOL_AUTO_INSTALL", undefined);
    vi.stubEnv("NODETOOL_PACKS_REEXEC", undefined);
    process.argv = [process.execPath, entry, "--original-argument"];
    process.execArgv = ["--import", "tsx"];
    const prompt = vi.fn<NonNullable<Parameters<typeof installMissingPacksAndReexec>[1]["prompt"]>>(async () => true);
    const install = vi.fn<typeof installPacks>((request, authorization) => installPacks(request, authorization, fixture.operations));
    const write = vi.fn();
    try {
      const exit = await installMissingPacksAndReexec(missing, { command: "run", stateFile: fixture.request.stateFile, catalog, prompt }, {
        snapshot: async () => ({ mode: fixture.request.mode, packs: [], wrongVersions: [], invalidPackages: [] }), install, write
      });
      expect(exit).toBe(23);
      expect(prompt).toHaveBeenCalledOnce();
      expect(prompt.mock.calls[0]?.[0]).toMatchObject({ default: false, message: expect.stringContaining("@nodetool-ai/fixture-nodes@1.0.0") });
      expect(install).toHaveBeenCalledOnce();
      expect(JSON.parse(await readFile(marker, "utf8"))).toEqual({ flag: "1", argv: [entry, "--original-argument"], installed: "1.0.0" });
      expect(write).toHaveBeenCalledWith(expect.stringContaining("Restart running"));
    } finally {
      process.argv = argv;
      process.execArgv = execArgv;
      if (stdinTty) { Object.defineProperty(process.stdin, "isTTY", stdinTty); } else { Reflect.deleteProperty(process.stdin, "isTTY"); }
      if (stderrTty) { Object.defineProperty(process.stderr, "isTTY", stderrTty); } else { Reflect.deleteProperty(process.stderr, "isTTY"); }
    }
  }, 30000);

  it("authorizes an npm runtime-only failure and restarts with the original command", async () => {
    const fixture = await setupPackRegistry();
    vi.stubEnv("NODETOOL_PACKS_REEXEC", undefined);
    const install = vi.fn<typeof installPacks>(async () => ({ root: fixture.root, coreVersion: "1.0.0", packs: [], runtimeLibraries: ["imaging"] }));
    const spawn = vi.fn<typeof import("node:child_process").spawnSync>();
    spawn.mockReturnValue({ status: 17, signal: null, output: [], pid: 1, stdout: null, stderr: null });
    const exit = await installMissingPacksAndReexec(missingRuntimePackageError("sharp", "imaging"), {
      command: "run", installMissing: true, stateFile: fixture.request.stateFile, catalog: fixture.request.catalog
    }, {
      snapshot: async () => ({ mode: fixture.request.mode, packs: [], wrongVersions: [], invalidPackages: [] }),
      install, spawn, write: vi.fn()
    });
    expect(exit).toBe(17);
    expect(install).toHaveBeenCalledWith(expect.objectContaining({ packs: [], runtimeLibraries: ["imaging"] }), expect.anything());
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("leaves external runtime failures outside npm installation", async () => {
    vi.stubEnv("NODETOOL_PACKS_INSTALLER", "1");
    const snapshot = vi.fn(async () => { throw new Error("unexpected inventory"); });
    for (const runtime of ["ffmpeg", "blender", "python"] as const) {
      expect(await installMissingPacksAndReexec(missingRuntimePackageError(runtime, runtime), {
        command: "run", installMissing: true
      }, { snapshot })).toBeNull();
    }
    expect(snapshot).not.toHaveBeenCalled();
  });

  it("does no inventory or install work on a re-executed process or outside the preview gate", async () => {
    const missing = createMissingPackError("game");
    const snapshot = vi.fn(async () => { throw new Error("unexpected inventory"); });
    for (const [preview, reexec] of [["1", "1"], [undefined, undefined]]) {
      vi.stubEnv("NODETOOL_PACKS_INSTALLER", preview);
      vi.stubEnv("NODETOOL_PACKS_REEXEC", reexec);
      expect(await installMissingPacksAndReexec(missing, { command: "run", installMissing: true }, { snapshot })).toBeNull();
    }
    expect(snapshot).not.toHaveBeenCalled();
  });
});
