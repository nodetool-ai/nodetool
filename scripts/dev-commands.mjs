import { resolve } from "node:path";

/**
 * Build the command and args required to run an entrypoint with the
 * repo-local tsx CLI under `--watch`.
 */
export function getTsxWatchCommand(repoRoot, entrypoint) {
  return {
    command: process.execPath,
    args: [resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), "--watch", entrypoint]
  };
}
