import { spawn } from "node:child_process";
import { readdir, rm, access } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export async function runCommand(command, args, options = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: options.cwd ?? process.cwd(),
      shell: false,
    });

    child.on("error", rejectRun);
    child.on("exit", (code) => {
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
  const { command, args } = getTypeScriptBuildCommand(repoRoot);
  await execute(command, args, {
    cwd: workspaceDir
  });

  await pruneOrphanedDistOutputs(workspaceDir);
}

export function getTypeScriptBuildCommand(rootDir = repoRoot) {
  return {
    command: process.execPath,
    args: [resolve(rootDir, "node_modules", "typescript", "bin", "tsc"), "--build"]
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;

if (invokedPath === scriptPath) {
  await prepareTypeScriptWorkspaceBuild(process.cwd());
}
