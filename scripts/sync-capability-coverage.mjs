/**
 * Regenerate `packages/cli/src/harness/capability-table.ts` from the live
 * capability registry, the checked-in agent suites, and the eval case files.
 *
 * Everything mechanical is derived here so the table cannot drift: the wire
 * name, the owning module, the contract fingerprint, the suites that name the
 * capability, and the eval cases whose `requiredTools` demand it. The one
 * hand-written field is `gap` — the note a capability carries when nothing
 * covers it — and this script preserves it across runs.
 *
 *   node scripts/sync-capability-coverage.mjs           # rewrite the table
 *   node scripts/sync-capability-coverage.mjs --check   # fail if it is stale
 *
 * Needs `npm run build:packages` first: it reads @nodetool-ai/agents from dist
 * so the derivation sees the same specs the product does.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const AGENTS = join(ROOT, "packages", "agents");
const TABLE = join(ROOT, "packages/cli/src/harness/capability-table.ts");
/** One fingerprint implementation, shared with the audit and the gate. */
const { capabilityContractFingerprint, extractCoverageBlocks } = await import(
  pathToFileURL(join(ROOT, "packages/cli/dist/harness/capability-coverage.js")).href
);
const TESTS = join(AGENTS, "tests");
const EVAL_SRC = join(AGENTS, "src", "evals");

/** The harness whose selfcheck runs the suites this script attributes. */
const SELFCHECK = "capability-suites";

/**
 * Suites outside the `capabilities-*` naming convention that still exercise a
 * capability's behaviour. Keep this list short: a file earns a place by
 * testing what a capability does, not by mentioning its name.
 */
const SUITE_EXTRAS = [
  "workflow-version-tools.test.ts",
  "nodetool-api-workflows.test.ts",
  "mcp-tools.test.ts",
  "memory-tools.test.ts",
  // Drives `take_screenshot`, `browser` and `http_request` by wire name and
  // asserts their schemas. Outside the `capabilit*-` naming convention, so the
  // pool missed the one suite that actually pins those contracts.
  "browser-tools.test.ts",
  "sandbox-package-docs.test.ts",
  "sandbox-package-listing.test.ts",
  // Drives `edit_timeline` by wire name and pins every structural op it
  // dispatches to the bridge, plus the rule that a failing op is recorded and
  // the script continues. Outside the `capabilit*-` naming convention.
  "timelines-op-input.test.ts",
  "code-capabilities.test.ts",
  "js-scripts-capabilities.test.ts",
  "apify-capabilities.test.ts",
  "serpapi-capabilities.test.ts"
];

/**
 * Suites that name every capability by construction — a category snapshot and
 * a walk over the assembled belt. Counting them as coverage would make every
 * capability look covered and the table toothless.
 */
const SUITE_EXCLUSIONS = new Set([
  "capabilities-registry.test.ts",
  "capabilities-coverage.test.ts"
]);

/** Eval case files, by the dist module and export that declares the array. */
const EVAL_MODULES = [
  ["evals/codeact-api-cases.js", "CODEACT_API_EVAL_CASES"],
  ["evals/codeact-sandbox-pack-cases.js", "CODEACT_SANDBOX_PACK_EVAL_CASES"],
  ["evals/codeact-cases.js", "CODEACT_EVAL_CASES"],
  ["evals/tool-loop-cases.js", "TOOL_LOOP_EVAL_CASES"],
  ["evals/escalation-cases.js", "WORKFLOW_ESCALATION_TOOL_LOOP_CASES"],
  ["evals/surfaces/app.js", "APP_TOOL_LOOP_CASES"],
  ["evals/surfaces/creative-pipeline.js", "CREATIVE_PIPELINE_TOOL_LOOP_CASES"],
  ["evals/surfaces/js-script.js", "JS_SCRIPT_TOOL_LOOP_CASES"],
  ["evals/surfaces/model3d.js", "MODEL3D_TOOL_LOOP_CASES"],
  ["evals/surfaces/script.js", "SCRIPT_TOOL_LOOP_CASES"],
  ["evals/surfaces/sketch.js", "SKETCH_TOOL_LOOP_CASES"],
  ["evals/surfaces/storyboard.js", "STORYBOARD_TOOL_LOOP_CASES"],
  ["evals/surfaces/memory.js", "MEMORY_TOOL_LOOP_CASES"],
  ["evals/surfaces/timeline.js", "TIMELINE_TOOL_LOOP_CASES"]
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const rel = (path) => relative(ROOT, path).split("\\").join("/");

/** Constants a spec file binds to a wire name, so a suite may use either. */
function specAliases(moduleName) {
  const file = join(AGENTS, "src/capabilities", `${moduleName}.specs.ts`);
  if (!existsSync(file)) return new Map();
  const aliases = new Map();
  const pattern = /export const ([A-Z][A-Z0-9_]*)\s*=\s*"([a-z0-9_]+)"/g;
  const source = readFileSync(file, "utf8");
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const list = aliases.get(match[2]) ?? [];
    list.push(match[1]);
    aliases.set(match[2], list);
  }
  return aliases;
}

function suitePool() {
  return readdirSync(TESTS)
    .filter((name) => name.endsWith(".test.ts"))
    .filter((name) => !SUITE_EXCLUSIONS.has(name))
    .filter(
      (name) =>
        name.startsWith("capabilities-") ||
        name.startsWith("capability-") ||
        SUITE_EXTRAS.includes(name)
    )
    .sort()
    .map((name) => join(TESTS, name));
}

function suitesFor(name, moduleName, pool, sources, aliases) {
  const tokens = [name, ...(aliases.get(name) ?? [])];
  const matcher = new RegExp(`\\b(${tokens.join("|")})\\b`);
  const owned = [
    `capabilities-${moduleName}.test.ts`,
    `${moduleName}-capabilities.test.ts`
  ];
  const flat = moduleName.replace(/-/g, "");
  return pool
    .filter((file) => matcher.test(sources[file]))
    .sort((a, b) => {
      const rank = (file) => {
        const base = basename(file);
        if (owned.includes(base)) return 0;
        return base.replace(/-/g, "").includes(flat) ? 1 : 2;
      };
      return rank(a) - rank(b) || (a < b ? -1 : 1);
    })
    .slice(0, 2)
    .map(rel);
}

async function collectEvalCases() {
  /** capability name → file → case ids */
  const byCapability = new Map();
  const evalSources = Object.fromEntries(
    walk(EVAL_SRC)
      .filter((path) => path.endsWith(".ts"))
      .map((path) => [path, readFileSync(path, "utf8")])
  );

  const declaringFile = (caseId, loadedFrom) => {
    const needle = new RegExp(`id:\\s*"${caseId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
    const found = Object.keys(evalSources)
      .filter((path) => needle.test(evalSources[path]))
      .sort();
    if (found.length === 0) return null;
    const preferred = found.find((path) => path === loadedFrom);
    return rel(preferred ?? found[0]);
  };

  for (const [modulePath, exportName] of EVAL_MODULES) {
    const url = pathToFileURL(join(AGENTS, "dist", modulePath)).href;
    const loaded = await import(url);
    const cases = loaded[exportName];
    if (!Array.isArray(cases)) {
      throw new Error(`${modulePath} exports no array named ${exportName}`);
    }
    const loadedFrom = join(EVAL_SRC, modulePath.replace(/^evals\//, "").replace(/\.js$/, ".ts"));
    for (const evalCase of cases) {
      for (const tool of evalCase.expect?.requiredTools ?? []) {
        const file = declaringFile(evalCase.id, loadedFrom);
        if (file === null) continue;
        const perFile = byCapability.get(tool) ?? new Map();
        const ids = perFile.get(file) ?? new Set();
        ids.add(evalCase.id);
        perFile.set(file, ids);
        byCapability.set(tool, perFile);
      }
    }
  }
  return byCapability;
}

/**
 * Gap notes from the table as it stands, so a rewrite never loses one.
 *
 * Read out of the structural block scan rather than a regex over the whole
 * file: a pattern that matched a run of concatenated string literals nested
 * its quantifiers, which CodeQL correctly called exponential backtracking. A
 * gap is always the block's last field, so it is the text between the `gap:`
 * key and the closing brace.
 */
function existingGaps() {
  if (!existsSync(TABLE)) return new Map();
  const gaps = new Map();
  for (const [name, block] of extractCoverageBlocks(
    readFileSync(TABLE, "utf8")
  )) {
    // The rendered indentation, so a `gap:` inside a note cannot match.
    const key = block.indexOf("\n    gap:");
    if (key === -1) continue;
    const body = block.slice(key + "\n    gap:".length, block.lastIndexOf("}"));
    const trimmed = body.trim();
    gaps.set(name, trimmed.endsWith(",") ? trimmed.slice(0, -1).trim() : trimmed);
  }
  return gaps;
}

function renderGap(literal) {
  const parts = literal
    .split(/\s*\+\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 1) return [`    gap: ${parts[0]},`];
  return [
    "    gap:",
    ...parts.map((part, i) => `      ${part}${i < parts.length - 1 ? " +" : ","}`)
  ];
}

function render(entries) {
  const lines = [];
  for (const entry of entries) {
    lines.push("  {");
    lines.push(`    name: ${JSON.stringify(entry.name)},`);
    lines.push(`    module: ${JSON.stringify(entry.module)},`);
    lines.push(`    impl: ${JSON.stringify(entry.impl)},`);
    lines.push(`    contract: ${JSON.stringify(entry.contract)},`);
    if (entry.selfcheck) {
      lines.push(`    selfcheck: ${JSON.stringify(entry.selfcheck)},`);
      lines.push("    suites: [");
      for (const suite of entry.suites) {
        lines.push(`      ${JSON.stringify(suite)},`);
      }
      lines.push("    ],");
    }
    if (entry.evals) {
      lines.push("    evals: [");
      for (const ref of entry.evals) {
        lines.push("      {");
        lines.push(`        file: ${JSON.stringify(ref.file)},`);
        lines.push(
          `        cases: [${ref.cases.map((id) => JSON.stringify(id)).join(", ")}],`
        );
        lines.push("      },");
      }
      lines.push("    ],");
    }
    if (entry.gap) lines.push(...renderGap(entry.gap));
    lines.push("  },");
  }
  return `${HEADER}${lines.join("\n")}\n];\n`;
}

const HEADER = `/**
 * GENERATED — the capability coverage table. Do not hand-edit anything but a
 * gap note; \`npm run capabilities:sync\` rewrites the rest.
 *
 * One entry per exported agent capability: the file that implements it, the
 * checked-in suites a selfcheck runs over it, the eval cases that drive a
 * model through it, and a written gap note where nothing does yet. The rules,
 * the audit, and the gate live in \`capability-coverage.ts\`; the derivation
 * lives in \`scripts/sync-capability-coverage.mjs\`.
 *
 * A new capability lands here with no suite and no eval case, and
 * \`npm run capabilities:check\` fails until someone either writes the case or
 * writes down why there isn't one.
 */

import type { CapabilityCoverageEntry } from "./capability-coverage.js";

export const CAPABILITY_COVERAGE: readonly CapabilityCoverageEntry[] = [
`;

async function main() {
  const check = process.argv.includes("--check");
  const registry = await import(
    pathToFileURL(join(AGENTS, "dist/capabilities/registry.js")).href
  );
  const specs = registry.listCapabilitySpecs();
  const pool = suitePool();
  const sources = Object.fromEntries(
    pool.map((file) => [file, readFileSync(file, "utf8")])
  );
  const evalCases = await collectEvalCases();
  const gaps = existingGaps();

  const entries = specs.map((spec) => {
    const moduleName = registry.capabilityModuleOf(spec.name);
    const aliases = specAliases(moduleName);
    const suites = suitesFor(spec.name, moduleName, pool, sources, aliases);
    const perFile = evalCases.get(spec.name);
    const evals = perFile
      ? [...perFile.entries()]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([file, ids]) => ({ file, cases: [...ids].sort() }))
      : undefined;
    const entry = {
      name: spec.name,
      module: moduleName,
      impl: `packages/agents/src/capabilities/${moduleName}.ts`,
      contract: capabilityContractFingerprint(spec),
      ...(suites.length > 0 && { selfcheck: SELFCHECK, suites }),
      ...(evals && { evals })
    };
    if (!entry.selfcheck && !entry.evals) {
      const gap = gaps.get(spec.name);
      if (!gap) {
        entry.gap = JSON.stringify(
          `TODO: ${spec.name} has no suite and no eval case. Write the case, or ` +
            "write down why there isn't one."
        );
      } else {
        entry.gap = gap;
      }
    }
    return entry;
  });

  const rendered = render(entries);
  if (check) {
    const current = existsSync(TABLE) ? readFileSync(TABLE, "utf8") : "";
    if (current !== rendered) {
      console.error(
        "capability-table.ts is stale — run `npm run capabilities:sync`"
      );
      process.exit(1);
    }
    const todo = entries.filter((e) => e.gap?.includes("TODO"));
    if (todo.length > 0) {
      console.error(
        `${todo.length} capability(ies) carry a TODO gap note: ` +
          todo.map((e) => e.name).join(", ")
      );
      process.exit(1);
    }
    console.log(`capability table is current (${entries.length} capabilities)`);
    return;
  }
  writeFileSync(TABLE, rendered);
  const covered = entries.filter((e) => e.selfcheck || e.evals).length;
  console.log(
    `wrote ${rel(TABLE)}: ${entries.length} capabilities, ${covered} covered, ` +
      `${entries.length - covered} gap(s)`
  );
}

await main();
