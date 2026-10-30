#!/usr/bin/env node
import { run } from "./index.js";
const args = process.argv.slice(2);
if (!args.length) { args.push("serve"); }
void run(args[0] === "mcp" ? args : ["mcp", ...args]).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "MCP command failed"}\n`);
  process.exitCode = 1;
});
