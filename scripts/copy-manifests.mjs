#!/usr/bin/env node
/**
 * Copy node-package manifest JSON files from each package's `src/` into its
 * `dist/` after a TypeScript build. `tsc` only emits `.js`/`.d.ts`, so these
 * hand-authored manifests (consumed at runtime by the node registry) must be
 * copied alongside the compiled output.
 *
 * Centralized here so the manifest list lives in one place instead of being
 * duplicated as inline `fs.cpSync` calls across root package.json scripts.
 */
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Packages that ship a `<name>-manifest.json` in src/ to be copied into dist/. */
const MANIFESTS = [
  ["replicate-nodes", "replicate-manifest.json"],
  ["fal-nodes", "fal-manifest.json"],
  ["kie-nodes", "kie-manifest.json"],
  ["topaz-nodes", "topaz-manifest.json"],
  ["atlascloud-nodes", "atlascloud-manifest.json"],
  ["together-nodes", "together-manifest.json"]
];

let copied = 0;
for (const [pkg, file] of MANIFESTS) {
  const from = resolve(repoRoot, "packages", pkg, "src", file);
  const to = resolve(repoRoot, "packages", pkg, "dist", file);
  if (!existsSync(from)) {
    console.warn(`copy-manifests: source missing, skipping ${pkg}/src/${file}`);
    continue;
  }
  cpSync(from, to);
  copied++;
}

console.log(`copy-manifests: copied ${copied}/${MANIFESTS.length} manifest(s)`);
