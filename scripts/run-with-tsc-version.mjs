#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateTscVersion } from "./resolve-tsc.mjs";

export function commandForPlatform(command, platform = process.platform) {
  return platform === "win32" && command === "npm" ? "npm.cmd" : command;
}

export function runWithTscVersion(
  version,
  command,
  args,
  { cwd = process.cwd(), env = process.env } = {}
) {
  const selectedVersion = validateTscVersion(version);
  if (!command) {
    throw new Error("run-with-tsc-version: expected a command after compiler version");
  }

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(commandForPlatform(command), args, {
      cwd,
      env: { ...env, NODETOOL_TSC_VERSION: selectedVersion },
      shell: false,
      stdio: "inherit"
    });
    const forwardSignal = (signal) => child.kill(signal);
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
      resolveRun({ code: code ?? (signal ? 128 : 1), signal });
    });
  });
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const [version, command, ...args] = process.argv.slice(2);
    const result = await runWithTscVersion(version, command, args);
    process.exitCode = result.code;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
