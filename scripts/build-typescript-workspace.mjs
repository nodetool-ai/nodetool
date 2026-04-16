import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
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
  await rm(resolve(workspaceDir, "dist"), { recursive: true, force: true });
  await rm(resolve(workspaceDir, "tsconfig.tsbuildinfo"), { force: true });

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
