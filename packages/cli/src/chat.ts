#!/usr/bin/env node
import { formatCliError } from "./lean/errors.js";
import { loadInstalledCliFeature } from "@nodetool-ai/pack-manager";
void loadInstalledCliFeature(import.meta.url).then(feature => feature.run([process.argv[0], process.argv[1], "chat", ...process.argv.slice(2)])).catch((error: unknown) => {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
});
