/**
 * Run the repository's selected TypeScript compiler.
 *
 * TypeScript 6 is JavaScript and is launched through Node with the configured
 * heap ceiling. TypeScript 7 is native and is launched directly. Selection is
 * controlled by NODETOOL_TSC_VERSION=6|7 and defaults to 7.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_TSC_VERSION,
  DEFAULT_TSC_HEAP_MB,
  getTscCommand,
  getTypeScriptCompilerCommand,
  resolveTsc,
  resolveTypeScriptCompiler,
  typeScriptBuildEnv,
  validateTscVersion
} from "./resolve-tsc.mjs";

export {
  DEFAULT_TSC_VERSION,
  DEFAULT_TSC_HEAP_MB,
  getTscCommand,
  getTypeScriptCompilerCommand,
  resolveTsc,
  resolveTypeScriptCompiler,
  typeScriptBuildEnv,
  validateTscVersion
};

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");

export function runTsc(args, options = {}) {
  const command = getTscCommand({
    ...options,
    args,
    cwd: options.cwd ?? process.cwd(),
    rootDir: options.rootDir ?? repoRoot,
    startDir: options.startDir ?? options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    version:
      options.version ??
      (options.env ?? process.env).NODETOOL_TSC_VERSION ??
      DEFAULT_TSC_VERSION
  });

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      shell: false,
      stdio: "inherit"
    });
    let forwarding = false;
    const forwardSignal = (signal) => {
      forwarding = true;
      child.kill(signal);
    };
    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);

    child.once("error", (error) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      rejectRun(error);
    });
    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      if (signal) {
        if (forwarding) {
          process.kill(process.pid, signal);
        }
        resolveRun({ code: 128 + (signal === "SIGINT" ? 2 : 15), signal });
        return;
      }
      resolveRun({ code: code ?? 1, signal: null });
    });
  });
}
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === scriptPath) {
  try {
    const result = await runTsc(process.argv.slice(2));
    process.exitCode = result.code;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
