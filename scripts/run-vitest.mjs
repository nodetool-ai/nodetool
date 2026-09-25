#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function vitestArgs(args, env = process.env) {
  const configured = env.NODETOOL_TEST_WORKERS;
  if (configured && (!/^[1-9]\d*$/.test(configured) || !Number.isSafeInteger(Number(configured)))) {
    throw new Error("NODETOOL_TEST_WORKERS must be a positive integer.");
  }
  const workers = configured ?? (!env.CI || env.CI === "false" ? "2" : null);
  return workers ? [...args, "--maxWorkers", workers] : args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const child = spawn(
      process.execPath,
      [resolve(repoRoot, "node_modules/vitest/vitest.mjs"), ...vitestArgs(process.argv.slice(2))],
      { stdio: "inherit", env: process.env }
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
