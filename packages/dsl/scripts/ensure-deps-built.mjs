// Ensures the workspace packages the DSL test suite loads are compiled to
// `dist/` before vitest runs.
//
// The suite aliases `@nodetool-ai/base-nodes` to its TypeScript source (so the
// node-sdk `NodeRegistry` stays a single module instance across the DSL runtime
// and the registered node classes). That source imports a dozen sibling node
// packages (core-nodes, image-nodes, video-nodes, …) which resolve only from
// their compiled `dist/`, as do the extra provider packs the `run` helper loads
// dynamically (huggingface-nodes, reve-nodes). Without a prior build the first
// such import fails with
//   Cannot find package '@nodetool-ai/core-nodes/nodes/control'
// and every suite that touches base-nodes errors out.
//
// In CI the packages are already built (turbo's `^build` dependency, or the
// downloaded `dist` artifact), so this script is a fast existence check and a
// no-op. It only triggers a build for a standalone `npm test --workspace=
// packages/dsl` on a fresh checkout.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// One built file per package the suite pulls from `dist/`. tsc emits a package's
// whole `dist/` in one pass, so a present entrypoint means that package was
// built. Covers every `*-nodes` pack `base-nodes/src` imports plus the provider
// packs `run` loads dynamically — so a partial build (some dists present, one
// missing) still triggers a rebuild instead of no-oping into a later failure.
const REQUIRED_DISTS = [
  "packages/core-nodes/dist/nodes/control.js",
  "packages/audio-nodes/dist/index.js",
  "packages/automation-nodes/dist/index.js",
  "packages/code-nodes/dist/index.js",
  "packages/data-nodes/dist/index.js",
  "packages/document-nodes/dist/index.js",
  "packages/image-nodes/dist/index.js",
  "packages/integration-nodes/dist/index.js",
  "packages/llm-nodes/dist/index.js",
  "packages/text-nodes/dist/index.js",
  "packages/video-nodes/dist/index.js",
  "packages/huggingface-nodes/dist/index.js",
  "packages/reve-nodes/dist/index.js"
];

const missing = REQUIRED_DISTS.filter(
  (rel) => !existsSync(resolve(repoRoot, rel))
);

if (missing.length === 0) {
  process.exit(0);
}

console.log(
  `[dsl] workspace dependency dist not found (${missing.join(", ")}) — ` +
    "building packages first (one-time on a fresh checkout)…"
);
const result = spawnSync("npm", ["run", "build:packages"], {
  cwd: repoRoot,
  stdio: "inherit",
  // `spawnSync("npm", …)` hits ENOENT on Windows unless routed through the
  // shell (npm is `npm.cmd` there). Matches web/scripts/ensure-packages-built.mjs.
  shell: process.platform === "win32"
});
process.exit(result.status ?? 1);
