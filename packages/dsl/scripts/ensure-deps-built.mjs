// Ensures the workspace packages the DSL test suite loads are compiled to
// `dist/` before vitest runs.
//
// The suite aliases `@nodetool-ai/base-nodes` to its TypeScript source (so the
// node-sdk `NodeRegistry` stays a single module instance across the DSL runtime
// and the registered node classes). That source imports a dozen sibling node
// packages (core-nodes, image-nodes, video-nodes, …) which resolve only from
// their compiled `dist/`. Without a prior build the very first import fails with
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

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

// Sentinels covering the two failure points the suite hits first: base-nodes'
// barrel and the core-nodes subpath its source pulls in. If both exist the
// dependency dist is present and there is nothing to do.
const sentinels = [
  resolve(repoRoot, "packages/base-nodes/dist/index.js"),
  resolve(repoRoot, "packages/core-nodes/dist/nodes/control.js")
];

if (sentinels.every((p) => existsSync(p))) {
  process.exit(0);
}

console.log(
  "[dsl] workspace dependency dist not found — building packages first " +
    "(one-time on a fresh checkout)…"
);
const result = spawnSync("npm", ["run", "build:packages"], {
  cwd: repoRoot,
  stdio: "inherit"
});
process.exit(result.status ?? 1);
