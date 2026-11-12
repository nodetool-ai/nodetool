#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function vitestArgs(args, env = process.env) {
  const configured = env.NODETOOL_TEST_WORKERS;
  if (configured && (!/^[1-9]\d*$/.test(configured) || !Number.isSafeInteger(Number(configured)))) {
    throw new Error("NODETOOL_TEST_WORKERS must be a positive integer.");
  }
  const workers = configured || (!env.CI || env.CI === "false" ? "2" : null);
  return workers ? [...args, "--maxWorkers", workers] : args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const env = { ...process.env };
    if (process.platform === "win32") {
      const bash = env.NODETOOL_BASH ?? join(env.ProgramFiles ?? "C:/Program Files", "Git", "bin", "bash.exe");
      if (!existsSync(bash)) {
        throw new Error("Windows script tests need Git Bash. Set NODETOOL_BASH to bash.exe.");
      }
      const key = Object.keys(env).find(name => name.toLowerCase() === "path") ?? "PATH";
      env[key] = [dirname(process.execPath), dirname(bash), env[key] ?? ""].join(delimiter);
    }
    const child = spawn(
      process.execPath,
      [resolve(repoRoot, "node_modules/vitest/vitest.mjs"), ...vitestArgs(process.argv.slice(2))],
      { stdio: "inherit", env }
    );

    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.once(signal, () => child.kill(signal));
    }

    child.once("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    child.once("exit", (code, signal) => {
      process.exitCode = signal ? 128 + (signal === "SIGINT" ? 2 : 15) : (code ?? 1);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
