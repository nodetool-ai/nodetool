#!/usr/bin/env node
// Measures the anti-slop backlog and ratchets what is already won.
//
// The backlog config (.oxlintrc.anti-slop.json) runs eight rules over 58 trees
// — 464 (rule, tree) pairs. 184 of those pairs are already at zero, but a pair
// at zero is only a fact about today unless something enforces it. This script
// derives the zero set from a real lint run and writes it into the enforced
// config (.oxlintrc.anti-slop-enforced.json) as one per-rule override, so a
// tree that reached zero cannot drift back.
//
// It also emits the per-rule backlog table. AGENTS.md carried that table by
// hand and had already drifted (6991/18453 against an actual 7016/18504),
// because a number nobody can regenerate is a number nobody can check.
//
//   node scripts/anti-slop-ratchet.mjs            # report: per-rule + per-tree
//   node scripts/anti-slop-ratchet.mjs --write    # regenerate the enforced overrides
//   node scripts/anti-slop-ratchet.mjs --check    # exit 1 if the overrides drifted
//   node scripts/anti-slop-ratchet.mjs --targets  # report + what to finish next

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_CONFIG = ".oxlintrc.anti-slop.json";
const ENFORCED_CONFIG = ".oxlintrc.anti-slop-enforced.json";

// Rules that carry options must keep them identical in both configs, or a tree
// promoted from one to the other is graded against a different rule.
const RULE_OPTIONS = {
  "no-runtime-typeof": { allowInTypeGuards: true }
};

/** Overrides appended after the generated ones, so they win. */
const TRAILING_OVERRIDES = [
  {
    files: ["packages/protocol/src/typecheck.ts"],
    rules: { "anti-slop/no-runtime-typeof": "off" }
  }
];

/** The eight backlog rules, read from the config rather than hardcoded. */
function backlogRules() {
  const config = JSON.parse(readFileSync(join(repoRoot, BACKLOG_CONFIG), "utf8"));
  return Object.keys(config.rules)
    .filter((name) => name.startsWith("anti-slop/"))
    .map((name) => name.slice("anti-slop/".length))
    .sort();
}

/** Every tree the backlog runs over: each package with sources, plus the three app trees. */
function lintableTrees() {
  const packages = readdirSync(join(repoRoot, "packages"))
    .filter((name) => existsSync(join(repoRoot, "packages", name, "src")))
    .map((name) => `packages/${name}`);
  return [...packages, "web", "electron", "mobile"].sort();
}

/**
 * Lint one tree with the backlog config and count its findings per rule.
 *
 * One invocation per tree, not one glob over all of them: oxlint does not
 * expand a wildcard path itself, so the `packages/[star]/src` glob the npm
 * scripts rely on is expanded by the shell, and the same argument passed
 * through execFileSync reaches oxlint literally — it then lints only the
 * concrete paths beside it and prints "No files found" for the glob. That
 * failure looks exactly
 * like success — every unscanned tree reports zero and reads as "clean", which
 * is the one wrong answer this script must never give. Per-tree runs make the
 * file count checkable, so a tree that was never opened is an error rather than
 * a win.
 *
 * oxlint exits 1 whenever it reports anything, which is the expected case here,
 * so the exit code carries no signal — unparseable stdout does.
 */
function measureTree(tree) {
  let stdout;
  try {
    stdout = execFileSync(
      "npx",
      ["oxlint", "--config", BACKLOG_CONFIG, "--format", "json", `${tree}/src`],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
    );
  } catch (error) {
    stdout = error.stdout;
    if (!stdout) {
      console.error(error.stderr?.trim() || error.message);
      throw new Error(`\`oxlint\` produced no output for ${tree}/src.`);
    }
  }

  const result = JSON.parse(stdout);
  if (result.number_of_files === 0) {
    throw new Error(
      `oxlint linted no files under ${tree}/src. Every tree here has sources, ` +
        `so this is a broken invocation, not a clean tree.`
    );
  }

  const findings = new Map();
  for (const diagnostic of result.diagnostics) {
    // oxlint's own default rules report through the same channel.
    const match = /^anti-slop\(([a-z-]+)\)$/.exec(diagnostic.code ?? "");
    if (match) findings.set(match[1], (findings.get(match[1]) ?? 0) + 1);
  }
  return { findings, files: result.number_of_files };
}

function measure(trees) {
  const counts = new Map();
  let total = 0;
  let files = 0;
  for (const tree of trees) {
    const { findings, files: scanned } = measureTree(tree);
    files += scanned;
    for (const [rule, count] of findings) {
      counts.set(`${tree}|${rule}`, count);
      total += count;
    }
  }
  return { counts, total, files };
}

/** Trees at zero for each rule — the set the enforced config should carry. */
function cleanTreesByRule(counts, rules, trees) {
  const clean = {};
  for (const rule of rules) {
    clean[rule] = trees.filter((tree) => (counts.get(`${tree}|${rule}`) ?? 0) === 0);
  }
  return clean;
}

function generatedOverrides(clean, rules) {
  return rules
    .filter((rule) => clean[rule].length > 0)
    .map((rule) => ({
      files: clean[rule].map((tree) => `${tree}/src/**`),
      rules: {
        [`anti-slop/${rule}`]: RULE_OPTIONS[rule]
          ? ["error", RULE_OPTIONS[rule]]
          : "error"
      }
    }));
}

function report(counts, total, files, clean, rules, trees) {
  const perRule = rules
    .map((rule) => ({
      rule,
      findings: trees.reduce((sum, tree) => sum + (counts.get(`${tree}|${rule}`) ?? 0), 0),
      clean: clean[rule].length
    }))
    .sort((a, b) => b.findings - a.findings);

  console.log(`| rule | findings | trees at zero |`);
  console.log(`|---|---:|---:|`);
  for (const row of perRule) {
    const label = row.findings === 0 ? `\`${row.rule}\` (enforced)` : `\`${row.rule}\``;
    console.log(`| ${label} | ${row.findings} | ${row.clean} / ${trees.length} |`);
  }

  const zeroPairs = rules.reduce((sum, rule) => sum + clean[rule].length, 0);
  const pairs = rules.length * trees.length;
  console.log(
    `\n${total} findings across ${rules.length} rules and ${trees.length} trees ` +
      `(${files} files scanned).` +
      `\n${zeroPairs} / ${pairs} (rule, tree) pairs at zero ` +
      `(${((100 * zeroPairs) / pairs).toFixed(1)}%).`
  );

  const spotless = trees.filter((tree) => rules.every((rule) => clean[rule].includes(tree)));
  console.log(`Trees at zero on all ${rules.length} rules: ${spotless.join(", ") || "none"}.`);
}

/**
 * The cheapest pairs to finish next, smallest first.
 *
 * The per-rule table ranks by how much work is left; this ranks by how little.
 * A pair sitting at one or two findings is a ratchet win for an afternoon,
 * and a tree whose every remaining pair is small can be finished outright —
 * which is worth more than the finding count suggests, because one typecheck
 * and one test run then cover several pairs.
 *
 * Printed rather than derived by whoever is doing the work: counting these by
 * hand off a raw `oxlint` run silently mixes in oxlint's own default-rule
 * diagnostics, which report through the same channel and are not backlog
 * findings at all.
 */
function targets(counts, rules, trees, limit = 40) {
  const pairs = [];
  for (const tree of trees) {
    for (const rule of rules) {
      const count = counts.get(`${tree}|${rule}`) ?? 0;
      if (count > 0) pairs.push({ count, rule, tree });
    }
  }
  pairs.sort((a, b) => a.count - b.count || a.tree.localeCompare(b.tree));

  const treeTotals = new Map(
    trees.map((tree) => [
      tree,
      rules.reduce((sum, rule) => sum + (counts.get(`${tree}|${rule}`) ?? 0), 0)
    ])
  );
  const nearlyDone = trees
    .filter((tree) => (treeTotals.get(tree) ?? 0) > 0)
    .sort((a, b) => (treeTotals.get(a) ?? 0) - (treeTotals.get(b) ?? 0))
    .slice(0, 10);

  console.log(`### Whole trees closest to zero on all ${rules.length} rules\n`);
  console.log(`| tree | findings left | rules left |`);
  console.log(`|---|---:|---:|`);
  for (const tree of nearlyDone) {
    const rulesLeft = rules.filter((rule) => (counts.get(`${tree}|${rule}`) ?? 0) > 0).length;
    console.log(`| \`${tree}\` | ${treeTotals.get(tree)} | ${rulesLeft} |`);
  }

  console.log(`\n### Cheapest (rule, tree) pairs\n`);
  console.log(`| findings | rule | tree |`);
  console.log(`|---:|---|---|`);
  for (const pair of pairs.slice(0, limit)) {
    console.log(`| ${pair.count} | \`${pair.rule}\` | \`${pair.tree}\` |`);
  }
  console.log(`\n${pairs.length} non-zero pairs remain.`);
}

const mode = process.argv[2] ?? "--report";
const rules = backlogRules();
const trees = lintableTrees();
const { counts, total, files } = measure(trees);
const clean = cleanTreesByRule(counts, rules, trees);

const configPath = join(repoRoot, ENFORCED_CONFIG);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const wanted = [...generatedOverrides(clean, rules), ...TRAILING_OVERRIDES];

if (mode === "--write") {
  config.overrides = wanted;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Wrote ${wanted.length} overrides to ${ENFORCED_CONFIG}.`);
  report(counts, total, files, clean, rules, trees);
} else if (mode === "--check") {
  if (JSON.stringify(config.overrides) === JSON.stringify(wanted)) {
    console.log(`${ENFORCED_CONFIG} matches the measured zero set.`);
  } else {
    console.error(
      `${ENFORCED_CONFIG} does not match the measured zero set.\n` +
        `A tree reached zero on a rule (or regressed off it) without the config ` +
        `following.\nRun \`npm run lint:anti-slop:write\` and commit the result.`
    );
    process.exit(1);
  }
} else if (mode === "--targets") {
  report(counts, total, files, clean, rules, trees);
  console.log("");
  targets(counts, rules, trees);
} else {
  report(counts, total, files, clean, rules, trees);
}
