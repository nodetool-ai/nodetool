#!/usr/bin/env node
// Prebuild guard for `vite build`.
//
// The web bundle imports the node packages (core-nodes, image-nodes, etc.) and
// their decorator-based deps (node-sdk, kernel) from their built `dist/` — they
// have no `nodetool-dev` source condition because `@prop` decorators must be
// compiled by tsc, not bundled from source. The in-browser runner Web Worker
// (browserRunner.worker.ts) bundles as its own self-contained entry, where an
// unresolved `dist/` import is a hard error (workers can't externalize).
//
// CI and the release workflow run `npm run build:packages` before building web,
// so those dists exist. A standalone `vite build` — e.g. the Cloudflare Pages
// deploy, whose build command is just `npm run build` in `web/` — does not, and
// fails to resolve `@nodetool-ai/core-nodes/nodes/constant`. This guard closes
// that gap: when any required dist is missing it builds the packages first;
// otherwise it's a no-op (no redundant rebuild, no nested turbo invocation).

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// One built file per package that the web bundle pulls from `dist/`. These are
// produced together by `build:packages`, so a missing one means packages were
// never built in this environment (a fresh clone / standalone deploy).
const REQUIRED_DISTS = [
  "packages/node-sdk/dist/index.js",
  "packages/kernel/dist/index.js",
  "packages/core-nodes/dist/nodes/constant.js",
  "packages/image-nodes/dist/nodes/image.js",
  "packages/audio-nodes/dist/nodes/audio.js",
  "packages/code-nodes/dist/nodes/code-node.js"
];

const missing = REQUIRED_DISTS.filter(
  (rel) => !existsSync(resolve(repoRoot, rel))
);

if (missing.length === 0) {
  console.info(
    "[prebuild] workspace package dist/ present — skipping build:packages"
  );
  process.exit(0);
}

console.info(
  `[prebuild] missing built packages (${missing.join(", ")}) — running build:packages`
);
const result = spawnSync("npm", ["run", "build:packages"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32"
});
process.exit(result.status ?? 1);
