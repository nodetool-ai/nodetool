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
} else {
  report(counts, total, files, clean, rules, trees);
}
