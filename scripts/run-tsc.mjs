/**
 * Runs `tsc` with an explicit V8 heap ceiling.
 *
 * Node sizes the default old-space heap from the machine (2 GiB on a 16 GiB
 * box, less under a container memory limit), and `web`'s program needs ~4.5 GiB
 * to check: 10k files once MUI/Emotion structural assignability is counted. A
 * bare `tsc --noEmit` therefore dies with `JavaScript heap out of memory` on
 * the exact machines it has to pass on, and the failure looks like a compiler
 * bug rather than a missing flag.
 *
 * The ceiling comes from `typeScriptBuildEnv`, the same NODETOOL_TSC_HEAP_MB
 * policy `npm run build:packages` uses, so the repo has one heap knob and an
 * existing `--max-old-space-size` in NODE_OPTIONS still wins.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { typeScriptBuildEnv } from "./build-typescript-workspace.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

/**
 * Nearest `node_modules/typescript/bin/tsc` at or above `startDir`, falling
 * back to the repo root. `mobile/` has its own dependency tree, so the
 * workspace's own TypeScript has to win over the root one.
 */
export function findTscBin(startDir, root = repoRoot, exists = existsSync) {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, "node_modules", "typescript", "bin", "tsc");
    if (exists(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  const rootCandidate = join(root, "node_modules", "typescript", "bin", "tsc");
  return exists(rootCandidate) ? rootCandidate : null;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;

if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  const tsc = findTscBin(process.cwd());
  if (!tsc) {
    console.error(
      "run-tsc: no node_modules/typescript/bin/tsc at or above " +
        `${process.cwd()} or in ${repoRoot}. Run npm install first.`
    );
    process.exit(1);
  }
  const child = spawn(process.execPath, [tsc, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: typeScriptBuildEnv()
  });
  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
}
