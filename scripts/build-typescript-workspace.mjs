import { spawn } from "node:child_process";
import { readdir, rm, access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_TSC_HEAP_MB,
  getTscCommand,
  typeScriptBuildEnv
} from "./resolve-tsc.mjs";

export { DEFAULT_TSC_HEAP_MB, typeScriptBuildEnv };

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, "..");

// Outputs for a deleted/renamed src/**/*.ts(x) that `tsc --build` leaves
// behind in dist/**. Checked (with an empirical repro) against TypeScript
// 6.0.2: incremental builds never delete an output whose source input is
// gone, they only skip regenerating it. All packages here use the shared
// rootDir: "src" / outDir: "dist" layout from tsconfig.base.json, so a
// dist file's source can be located by mirroring its relative path.
const DIST_OUTPUT_SUFFIXES = [".d.ts.map", ".d.ts", ".js.map", ".js"];

// Marker written into dist/ after every successful build. `tsc --build` is
// content-based: a source file whose mtime moved (a checkout, a stash pop, a
// no-op save) is re-checked but not re-emitted, so its output stays older than
// its input forever. Any mtime check against the outputs therefore reports a
// freshly built package as stale. Callers compare against this stamp instead,
// which a build always advances. `pruneOrphanedDistOutputs` leaves it alone —
// it only removes files ending in DIST_OUTPUT_SUFFIXES.
export const BUILD_STAMP_FILENAME = ".nodetool-build-stamp";

export function buildStampPath(workspaceDir) {
  return resolve(workspaceDir, "dist", BUILD_STAMP_FILENAME);
}

export async function writeBuildStamp(workspaceDir) {
  const stampPath = buildStampPath(workspaceDir);
  await mkdir(dirname(stampPath), { recursive: true });
  await writeFile(stampPath, `${new Date().toISOString()}\n`);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function pruneOrphanedDistOutputs(workspaceDir) {
  const srcDir = resolve(workspaceDir, "src");
  const distDir = resolve(workspaceDir, "dist");

  let entries;
  try {
    entries = await readdir(distDir, { recursive: true, withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      return;
    }
    throw err;
  }

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const distFilePath = join(entry.parentPath ?? entry.path, entry.name);
    const relPath = relative(distDir, distFilePath);
    const suffix = DIST_OUTPUT_SUFFIXES.find((s) => relPath.endsWith(s));
    if (!suffix) {
      continue;
    }

    const base = relPath.slice(0, -suffix.length);
    const hasSource =
      (await pathExists(join(srcDir, `${base}.ts`))) ||
      (await pathExists(join(srcDir, `${base}.tsx`)));

    if (!hasSource) {
      await rm(distFilePath, { force: true });
    }
  }
}

/**
 * Drop a `tsconfig.tsbuildinfo` left behind by a removed `dist/`.
 *
 * `tsc --build` trusts that state: with the build info still claiming every
 * output is current, a package whose `dist/` was deleted (a hand-rolled clean,
 * a partial checkout) builds green and emits nothing, and the next import of
 * it fails with "Failed to resolve entry for package". Reproduced against
 * @nodetool-ai/document-nodes. Only the build info is removed — `dist/` is
 * never wiped here, so the parallel-task race described below stays closed.
 */
export async function dropOrphanedBuildInfo(workspaceDir) {
  if (await pathExists(resolve(workspaceDir, "dist"))) {
    return;
  }
  await rm(resolve(workspaceDir, "tsconfig.tsbuildinfo"), { force: true });
}

export async function runCommand(command, args, options = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: options.cwd ?? process.cwd(),
      shell: false,
      env: options.env ?? process.env,
    });

    let forwarding = false;
    const forwardSignal = (signal) => {
      forwarding = true;
      child.kill(signal);
    };
    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);
    child.on("error", (error) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      rejectRun(error);
    });
    child.on("exit", (code, signal) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      if (signal) {
        if (forwarding) {
          process.kill(process.pid, signal);
        }
        rejectRun(new Error(`${command} ${args.join(" ")} terminated by ${signal}`));
        return;
      }
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

export async function prepareTypeScriptWorkspaceBuild(workspaceDir, execute = runCommand) {
  // Intentionally do NOT `rm -rf dist` here. Wiping `dist/` first opens a
  // window where the package's files are missing — turbo schedules build
  // tasks in parallel with concurrent `test --filter --affected` tasks, and a
  // test that imports a leaf package (or transitively reaches a `dist/`
  // subpath via re-exports in another package's compiled output) races
  // against the rebuild and fails with `ERR_MODULE_NOT_FOUND`.
  //
  // `tsc --build` itself is incremental but does NOT delete dist outputs for
  // sources removed from the input set (verified against TypeScript 6.0.2),
  // so a deleted/renamed src file leaves a stale compiled file behind. We
  // prune those after the build instead of wiping dist/ up front, so already
  // up-to-date outputs stay available throughout and only genuinely orphaned
  // files disappear.
  await dropOrphanedBuildInfo(workspaceDir);

  const { command, args, env, cwd } = getTypeScriptBuildCommand(repoRoot, {
    force: process.env.NODETOOL_FORCE_TSC_BUILD === "1",
    cwd: workspaceDir,
  });
  await execute(command, args, {
    cwd,
    env,
  });

  await pruneOrphanedDistOutputs(workspaceDir);
  await writeBuildStamp(workspaceDir);
}

export function getTypeScriptBuildCommand(
  rootDir = repoRoot,
  { force = false, cwd = process.cwd(), version, env = process.env } = {}
) {
  const resolved = getTscCommand({
    rootDir,
    startDir: cwd,
    cwd,
    version,
    env,
    args: ["--build", ...(force ? ["--force"] : [])]
  });
  return resolved;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;

if (invokedPath === scriptPath) {
  await prepareTypeScriptWorkspaceBuild(process.cwd());
}
