import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, "..");

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
  // Intentionally do NOT `rm -rf dist` here. `tsc --build` is incremental: it
  // tracks outputs in `tsconfig.tsbuildinfo` and rewrites only what changed,
  // including removing artifacts for sources that were deleted from the input
  // set. Wiping `dist/` first opens a window where the package's files are
  // missing — turbo schedules build tasks in parallel with concurrent
  // `test --filter --affected` tasks, and a test that imports a leaf package
  // (or transitively reaches a `dist/` subpath via re-exports in another
  // package's compiled output) races against the rebuild and fails with
  // `ERR_MODULE_NOT_FOUND`. Letting `tsc` update in place closes the window
  // without changing the build outputs.

  const { command, args } = getTypeScriptBuildCommand(repoRoot);
  await execute(command, args, {
    cwd: workspaceDir
  });
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
