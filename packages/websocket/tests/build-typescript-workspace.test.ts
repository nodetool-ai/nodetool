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

  it("removes dist and tsbuildinfo before invoking tsc --build", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "nodetool-build-helper-"));
    tempDirs.push(workspaceDir);

    await mkdir(join(workspaceDir, "dist"), { recursive: true });
    await writeFile(join(workspaceDir, "dist", "index.js"), "old output");
    await writeFile(join(workspaceDir, "tsconfig.tsbuildinfo"), "stale build state");

    const runCommand = vi.fn(async () => {
      expect(existsSync(join(workspaceDir, "dist"))).toBe(false);
      expect(existsSync(join(workspaceDir, "tsconfig.tsbuildinfo"))).toBe(false);
    });

    await prepareTypeScriptWorkspaceBuild(workspaceDir, runCommand);

    expect(runCommand).toHaveBeenCalledWith(
      process.execPath,
      [resolve(import.meta.dirname, "../../../node_modules/typescript/bin/tsc"), "--build"],
      {
        cwd: workspaceDir
      }
    );
    await expect(readFile(join(workspaceDir, "tsconfig.tsbuildinfo"), "utf8")).rejects.toThrow();
  });

  it("uses the repo-local TypeScript CLI through node", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");

    expect(getTypeScriptBuildCommand(repoRoot)).toEqual({
      command: process.execPath,
      args: [resolve(repoRoot, "node_modules", "typescript", "bin", "tsc"), "--build"]
    });
  });
});
