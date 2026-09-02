// Builds the shipped example compositions.
//
// Input:  scripts/example-compositions/compositions.mjs — the curated spec
// Output: packages/base-nodes/nodetool/examples/compositions/<slug>.composition.json
//
// A composition is a document fragment (AS6): a group clip, its children, and
// the parameters that vary. Shipping one is shipping a JSON file — no media, no
// model call, so the build needs no key and produces the same bytes every time.
// That is what `--check` reads: a bundle whose spec changed and whose file did
// not is a stale template nobody would notice, because listing reads the
// directory rather than the spec.
//
//   node scripts/build-example-compositions.mjs
//   node scripts/build-example-compositions.mjs --check
//   node scripts/build-example-compositions.mjs --composition lower-third

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EXAMPLE_COMPOSITIONS } from "./example-compositions/compositions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(
  ROOT,
  "packages/base-nodes/nodetool/examples/compositions"
);
const SUFFIX = ".composition.json";

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const only = (() => {
  const at = argv.indexOf("--composition");
  return at >= 0 ? argv[at + 1] : undefined;
})();

/** The composition a spec entry describes, as the shipped file carries it. */
function buildComposition(spec) {
  const composition = {
    id: spec.slug,
    name: spec.name,
    description: spec.description,
    params: spec.params,
    group: { ...spec.group, id: `${spec.slug}-group` },
    children: spec.children.map((child, index) => ({
      ...child,
      id: `${spec.slug}-${index}-${child.id.toLowerCase()}`
    }))
  };
  const problems = [];
  for (const [name, param] of Object.entries(spec.params)) {
    const segments = param.path.slice(1).split("/");
    let cursor = composition.children;
    for (const segment of segments) {
      if (cursor === undefined || cursor === null) break;
      cursor = Array.isArray(cursor) ? cursor[Number(segment)] : cursor[segment];
    }
    if (cursor === undefined) {
      problems.push(`${spec.slug}: parameter "${name}" points at ${param.path}, which no child has.`);
    }
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return composition;
}

function main() {
  const specs = only
    ? EXAMPLE_COMPOSITIONS.filter((spec) => spec.slug === only)
    : EXAMPLE_COMPOSITIONS;
  if (specs.length === 0) {
    console.error(`No composition named "${only}" in the spec.`);
    process.exit(1);
  }

  let changed = 0;
  for (const spec of specs) {
    const file = path.join(OUT, `${spec.slug}${SUFFIX}`);
    const serialized = `${JSON.stringify(buildComposition(spec), null, 2)}\n`;
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;

    if (checkOnly) {
      if (current !== serialized) {
        changed += 1;
        console.error(
          `  DIFF  ${path.relative(ROOT, file)} — run node scripts/build-example-compositions.mjs`
        );
      }
      continue;
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(file, serialized);
    console.log(`  ok    ${spec.slug} — ${spec.children.length} child clip(s)`);
  }

  if (checkOnly && !only) {
    // A composition dropped from the spec leaves its file behind, and a stale
    // file still lists and still installs.
    const known = new Set(specs.map((spec) => `${spec.slug}${SUFFIX}`));
    const orphans = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).filter(
      (name) => name.endsWith(SUFFIX) && !known.has(name)
    );
    for (const name of orphans) {
      changed += 1;
      console.error(
        `  ORPHAN  ${path.relative(ROOT, path.join(OUT, name))} — no spec entry builds it`
      );
    }
  }

  if (checkOnly) {
    if (changed > 0) {
      console.error(`\n${changed} example composition file(s) are out of date.`);
      process.exit(1);
    }
    console.log(`${specs.length} example composition(s) are up to date.`);
  }
}

main();
