import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  getTypeScriptBuildCommand,
  prepareTypeScriptWorkspaceBuild
} from "../../../scripts/build-typescript-workspace.mjs";

describe("prepareTypeScriptWorkspaceBuild", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("leaves dist and tsbuildinfo in place when invoking tsc --build", async () => {
    // Incremental build: the helper must NOT wipe outputs before running tsc.
    // Wiping opens a window where the package's files are missing, racing
    // concurrent turbo tasks (see scripts/build-typescript-workspace.mjs for
    // the full rationale). `tsc --build` updates and removes outputs itself.
    const workspaceDir = await mkdtemp(join(tmpdir(), "nodetool-build-helper-"));
    tempDirs.push(workspaceDir);

    await mkdir(join(workspaceDir, "dist"), { recursive: true });
    await writeFile(join(workspaceDir, "dist", "index.js"), "old output");
    await writeFile(join(workspaceDir, "tsconfig.tsbuildinfo"), "stale build state");

    const runCommand = vi.fn(async () => {
      expect(existsSync(join(workspaceDir, "dist"))).toBe(true);
      expect(existsSync(join(workspaceDir, "tsconfig.tsbuildinfo"))).toBe(true);
    });

    await prepareTypeScriptWorkspaceBuild(workspaceDir, runCommand);

    expect(runCommand).toHaveBeenCalledWith(
      process.execPath,
      [resolve(import.meta.dirname, "../../../node_modules/typescript/bin/tsc"), "--build"],
      {
        cwd: workspaceDir
      }
    );
    await expect(readFile(join(workspaceDir, "tsconfig.tsbuildinfo"), "utf8")).resolves.toBe(
      "stale build state"
    );
  });

  it("uses the repo-local TypeScript CLI through node", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");

    expect(getTypeScriptBuildCommand(repoRoot)).toEqual({
      command: process.execPath,
      args: [resolve(repoRoot, "node_modules", "typescript", "bin", "tsc"), "--build"]
    });
  });
});
