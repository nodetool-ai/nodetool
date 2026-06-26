#!/usr/bin/env node
// Guards against the dependency-drift failure behind the lexical revert
// (commit 2796c017): `@lexical/link` and `@lexical/utils` were bumped while the
// rest of the `@lexical/*` family stayed pinned, and the mismatched internal
// APIs broke typecheck. Packages in these families share internal contracts and
// MUST move in lockstep — every member resolves to one version range.
//
// This check collects, per coupled family, the declared version range of every
// member across all manifests and fails if a family carries more than one range.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

// Families whose members must all declare the same version range. A dep belongs
// to a family when its name matches the family's `test`.
const FAMILIES = [
  {
    name: "lexical",
    test: (dep) => dep === "lexical" || dep.startsWith("@lexical/"),
  },
];

// Manifests to inspect: root, every workspace package, and the standalone apps.
async function manifestPaths() {
  const paths = [join(repoRoot, "package.json")];
  for (const app of ["web", "electron", "mobile"]) {
    paths.push(join(repoRoot, app, "package.json"));
  }
  const packagesDir = join(repoRoot, "packages");
  let entries = [];
  try {
    entries = await readdir(packagesDir, { withFileTypes: true });
  } catch {
    // no packages dir — nothing to add
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      paths.push(join(packagesDir, entry.name, "package.json"));
    }
  }
  return paths;
}

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

// family name -> Map<versionRange, Array<{ dep, manifest }>>
const seen = new Map(FAMILIES.map((f) => [f.name, new Map()]));

for (const manifestPath of await manifestPaths()) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    continue;
  }
  const rel = manifestPath.slice(repoRoot.length + 1);
  for (const field of DEP_FIELDS) {
    const deps = manifest[field];
    if (!deps) continue;
    for (const [dep, range] of Object.entries(deps)) {
      for (const family of FAMILIES) {
        if (!family.test(dep)) continue;
        const byRange = seen.get(family.name);
        if (!byRange.has(range)) byRange.set(range, []);
        byRange.get(range).push({ dep, manifest: rel });
      }
    }
  }
}

const violations = [];
for (const family of FAMILIES) {
  const byRange = seen.get(family.name);
  if (byRange.size > 1) violations.push({ family: family.name, byRange });
}

if (violations.length > 0) {
  console.error("Coupled dependency families with mismatched versions:\n");
  for (const { family, byRange } of violations) {
    console.error(`  ${family}:`);
    for (const [range, members] of byRange) {
      const detail = members.map((m) => `${m.dep} (${m.manifest})`).join(", ");
      console.error(`    ${range}: ${detail}`);
    }
  }
  console.error(
    "\nMembers of a coupled family share internal APIs and must move together.\n" +
      "Align every member to a single version range, then run `npm install`.\n" +
      "See the lexical revert (commit 2796c017)."
  );
  process.exit(1);
}

console.log(
  `Coupled-dependency check passed (${FAMILIES.map((f) => f.name).join(", ")} aligned).`
);
