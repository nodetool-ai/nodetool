#!/usr/bin/env node
import { formatCliError } from "./lean/errors.js";
import { loadInstalledCommandFeature } from "@nodetool-ai/pack-manager";
void loadInstalledCommandFeature(import.meta.url, "cli-chat").then(feature => feature.run(["chat", ...process.argv.slice(2)])).catch((error: unknown) => {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
});
