import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { stat, utimes } from "node:fs/promises";
import {
  BUILD_STAMP_FILENAME,
  DEFAULT_TSC_HEAP_MB,
  getTypeScriptBuildCommand,
  prepareTypeScriptWorkspaceBuild,
  pruneOrphanedDistOutputs,
  typeScriptBuildEnv,
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
        cwd: workspaceDir,
        env: typeScriptBuildEnv(),
      }
    );
    await expect(readFile(join(workspaceDir, "tsconfig.tsbuildinfo"), "utf8")).resolves.toBe(
      "stale build state"
    );
    expect(existsSync(join(workspaceDir, "dist", "index.js"))).toBe(true);
  });

  it("drops a tsbuildinfo whose dist was removed, so tsc re-emits", async () => {
    // `rm -rf dist` without the build info leaves tsc believing every output
    // is current: the build reports success, emits nothing, and the package
    // fails to resolve at import.
    const workspaceDir = await mkdtemp(join(tmpdir(), "nodetool-build-helper-"));
    tempDirs.push(workspaceDir);

    await mkdir(join(workspaceDir, "src"), { recursive: true });
    await writeFile(join(workspaceDir, "src", "index.ts"), "export const a = 1;");
    await writeFile(join(workspaceDir, "tsconfig.tsbuildinfo"), "stale build state");

    const runCommand = vi.fn(async () => {
      expect(existsSync(join(workspaceDir, "tsconfig.tsbuildinfo"))).toBe(false);
    });

    await prepareTypeScriptWorkspaceBuild(workspaceDir, runCommand);

    expect(runCommand).toHaveBeenCalled();
  });

  it("advances the build stamp even when tsc re-emits nothing", async () => {
    // `tsc --build` decides by content, so a source whose mtime moved without
    // its bytes changing keeps its older output. Callers must compare against
    // this stamp; comparing against the outputs reports a just-built package
    // as stale forever and triggers a rebuild on every dev start.
    const workspaceDir = await mkdtemp(join(tmpdir(), "nodetool-build-helper-"));
    tempDirs.push(workspaceDir);

    await mkdir(join(workspaceDir, "src"), { recursive: true });
    await mkdir(join(workspaceDir, "dist"), { recursive: true });
    await writeFile(join(workspaceDir, "dist", "index.js"), "compiled");
    const staleTime = new Date(Date.now() - 60_000);
    await utimes(join(workspaceDir, "dist", "index.js"), staleTime, staleTime);
    await writeFile(join(workspaceDir, "src", "index.ts"), "export const a = 1;");

    // tsc re-emits nothing: the output keeps its older timestamp.
    await prepareTypeScriptWorkspaceBuild(workspaceDir, async () => {});

    const stampPath = join(workspaceDir, "dist", BUILD_STAMP_FILENAME);
    expect(existsSync(stampPath)).toBe(true);
    const [stamp, source, output] = await Promise.all([
      stat(stampPath),
      stat(join(workspaceDir, "src", "index.ts")),
      stat(join(workspaceDir, "dist", "index.js")),
    ]);
    expect(stamp.mtimeMs).toBeGreaterThanOrEqual(source.mtimeMs);
    expect(output.mtimeMs).toBeLessThan(source.mtimeMs);
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
    expect(getTypeScriptBuildCommand(repoRoot, { force: true })).toEqual({
      command: process.execPath,
      args: [
        resolve(repoRoot, "node_modules", "typescript", "bin", "tsc"),
        "--build",
        "--force"
      ]
    });
  });

  it("raises the tsc heap unless NODE_OPTIONS already sets one", () => {
    expect(typeScriptBuildEnv({ NODE_OPTIONS: undefined })).toEqual({
      NODE_OPTIONS: `--max-old-space-size=${DEFAULT_TSC_HEAP_MB}`,
    });
    expect(
      typeScriptBuildEnv({ NODE_OPTIONS: "--conditions=nodetool-dev --max-old-space-size=4096" })
    ).toEqual({
      NODE_OPTIONS: "--conditions=nodetool-dev --max-old-space-size=4096",
    });
    expect(typeScriptBuildEnv({ NODETOOL_TSC_HEAP_MB: "12288", NODE_OPTIONS: undefined })).toMatchObject({
      NODE_OPTIONS: "--max-old-space-size=12288",
    });
  });
});
