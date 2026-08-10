/**
 * Fixture packs, materialized into a temp directory.
 *
 * The checked-in fixture keeps its dependency sources under `deps/` rather than
 * `node_modules/`, which git ignores everywhere in this repo. Materializing
 * copies `deps/<name>` to `node_modules/<name>`, which is what esbuild resolves
 * against — so the fixtures stay reviewable in the tree and nothing is fetched
 * at test time.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURE_ROOT = join(here, "fixtures");

/** Copy one fixture pack into a fresh temp directory and return its path. */
export function materializePack(name: string, into?: string): string {
  const root = into ?? mkdtempSync(join(tmpdir(), "nodetool-sandbox-fixture-"));
  const target = join(root, name);
  mkdirSync(target, { recursive: true });
  const source = join(FIXTURE_ROOT, name);
  cpSync(join(source, "package.json"), join(target, "package.json"));
  cpSync(join(source, "SKILL.md"), join(target, "SKILL.md"));
  cpSync(join(source, "deps"), join(target, "node_modules"), { recursive: true });
  return target;
}

/**
 * Write a pack whose dependency bundles past the size cap.
 *
 * Generated rather than checked in: a megabyte of filler in the tree would be a
 * megabyte nobody ever reads.
 */
export function materializeOversizedPack(bytes: number, into?: string): string {
  const root = into ?? mkdtempSync(join(tmpdir(), "nodetool-sandbox-fixture-"));
  const target = join(root, "oversized");
  const dependency = join(target, "node_modules", "fixture-oversized");
  mkdirSync(dependency, { recursive: true });
  writeFileSync(
    join(target, "package.json"),
    JSON.stringify({
      name: "@fixture/sandbox-oversized",
      version: "1.0.0",
      private: true,
      dependencies: { "fixture-oversized": "1.0.0" },
      nodetool: {
        apiVersion: 1,
        sandboxModules: [{ name: ".", kind: "js", npm: "fixture-oversized" }]
      }
    })
  );
  writeFileSync(
    join(target, "SKILL.md"),
    "---\nname: sandbox-oversized\ndescription: Fixture pack over the size cap\n---\n"
  );
  writeFileSync(
    join(dependency, "package.json"),
    JSON.stringify({
      name: "fixture-oversized",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      module: "index.js",
      exports: { ".": "./index.js" }
    })
  );
  // One exported string literal: tree shaking cannot remove it, and no scan
  // rule or probe objects to it, so size is the only thing that fails.
  writeFileSync(
    join(dependency, "index.js"),
    `export const filler = ${JSON.stringify("x".repeat(bytes))};\nexport const size = filler.length;\n`
  );
  return target;
}

/** Remove a materialized fixture root. */
export function cleanup(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

/**
 * Write a config-only pack from a package.json object.
 *
 * For manifests a test wants to *reject*: nothing to compile, nothing to copy,
 * just the two files discovery reads.
 */
export function writeFixturePack(
  root: string,
  name: string,
  packageJson: Record<string, unknown>
): string {
  const target = join(root, name);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "package.json"), JSON.stringify(packageJson, null, 2));
  writeFileSync(
    join(target, "SKILL.md"),
    `---\nname: ${name}\ndescription: fixture\n---\n\nfixture\n`
  );
  return target;
}
