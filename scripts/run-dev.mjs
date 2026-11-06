#!/usr/bin/env node
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["--import", "tsx", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=nodetool-dev"].filter(Boolean).join(" ")
  }
});

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
