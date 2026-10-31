#!/usr/bin/env node
import { formatCliError } from "./lean/errors.js";
import { runCli } from "./lean/program.js";
void runCli().catch((error: unknown) => {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
});
