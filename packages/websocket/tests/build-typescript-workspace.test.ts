import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  getTypeScriptBuildCommand,
  prepareTypeScriptWorkspaceBuild,
  pruneOrphanedDistOutputs
} from "../../../scripts/build-typescript-workspace.mjs";

describe("prepareTypeScriptWorkspaceBuild", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("leaves dist and tsbuildinfo in place while invoking tsc --build", async () => {
    // The helper must NOT wipe outputs before running tsc. Wiping opens a
    // window where the package's files are missing, racing concurrent turbo
    // tasks (see scripts/build-typescript-workspace.mjs for the full
    // rationale). Orphaned outputs are pruned surgically after the build.
    const workspaceDir = await mkdtemp(join(tmpdir(), "nodetool-build-helper-"));
    tempDirs.push(workspaceDir);

    await mkdir(join(workspaceDir, "src"), { recursive: true });
    await mkdir(join(workspaceDir, "dist"), { recursive: true });
    await writeFile(join(workspaceDir, "src", "index.ts"), "export const a = 1;");
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
    expect(existsSync(join(workspaceDir, "dist", "index.js"))).toBe(true);
  });

  it("prunes dist outputs whose source file was deleted or renamed", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "nodetool-build-helper-"));
    tempDirs.push(workspaceDir);

    await mkdir(join(workspaceDir, "src", "sub"), { recursive: true });
    await mkdir(join(workspaceDir, "dist", "sub"), { recursive: true });

    // `kept` still has a matching source file; `removed` was deleted from src.
    await writeFile(join(workspaceDir, "src", "kept.ts"), "export const a = 1;");
    for (const name of ["kept", "removed"]) {
      await writeFile(join(workspaceDir, "dist", `${name}.js`), "compiled");
      await writeFile(join(workspaceDir, "dist", `${name}.d.ts`), "declared");
    }

    await writeFile(join(workspaceDir, "src", "sub", "kept.ts"), "export const b = 1;");
    for (const name of ["kept", "removed"]) {
      await writeFile(join(workspaceDir, "dist", "sub", `${name}.js`), "compiled");
    }

    await pruneOrphanedDistOutputs(workspaceDir);

    expect(existsSync(join(workspaceDir, "dist", "kept.js"))).toBe(true);
    expect(existsSync(join(workspaceDir, "dist", "kept.d.ts"))).toBe(true);
    expect(existsSync(join(workspaceDir, "dist", "removed.js"))).toBe(false);
    expect(existsSync(join(workspaceDir, "dist", "removed.d.ts"))).toBe(false);
    expect(existsSync(join(workspaceDir, "dist", "sub", "kept.js"))).toBe(true);
    expect(existsSync(join(workspaceDir, "dist", "sub", "removed.js"))).toBe(false);
  });

  it("uses the repo-local TypeScript CLI through node", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");

    expect(getTypeScriptBuildCommand(repoRoot)).toEqual({
      command: process.execPath,
      args: [resolve(repoRoot, "node_modules", "typescript", "bin", "tsc"), "--build"]
    });
  });
});
