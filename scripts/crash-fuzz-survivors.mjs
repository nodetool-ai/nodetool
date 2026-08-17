#!/usr/bin/env node
// List the mutants the crash-fuzz corpus failed to kill.
//
// Usage: node scripts/crash-fuzz-survivors.mjs [--limit N] [--json]
//
// A survived or uncovered mutant of a parser file is a branch no fuzzed
// document distinguishes: either the corpus never reaches it, or reaching it
// changes nothing the oracle asserts. Both are gaps worth closing.
// Prints Markdown to stdout. Exits 0 always (reporting only).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(
  root,
  "packages/node-sdk/reports/crash-fuzz/mutation.json"
);

const argv = process.argv.slice(2);
const limitFlag = argv.indexOf("--limit");
const limit = limitFlag === -1 ? 40 : Number(argv[limitFlag + 1]);
const asJson = argv.includes("--json");

if (!existsSync(reportPath)) {
  process.stdout.write(`No crash-fuzz report at \`${reportPath}\`.\n`);
  process.exit(0);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const survivors = [];
for (const [file, entry] of Object.entries(report.files ?? {})) {
  for (const mutant of entry.mutants ?? []) {
    if (mutant.status !== "Survived" && mutant.status !== "NoCoverage") {
      continue;
    }
    survivors.push({
      file,
      line: mutant.location?.start?.line ?? 0,
      mutator: mutant.mutatorName,
      status: mutant.status,
      replacement: (mutant.replacement ?? "").replace(/\s+/g, " ").slice(0, 80)
    });
  }
}
survivors.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

if (asJson) {
  process.stdout.write(`${JSON.stringify(survivors, null, 2)}\n`);
  process.exit(0);
}

const lines = [`${survivors.length} mutants survived the crash corpus.`, ""];
if (survivors.length > 0) {
  lines.push("| File | Line | Mutator | Status | Replacement |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const s of survivors.slice(0, limit)) {
    lines.push(
      `| \`${s.file}\` | ${s.line} | ${s.mutator} | ${s.status} | \`${s.replacement}\` |`
    );
  }
  if (survivors.length > limit) {
    lines.push("");
    lines.push(`…and ${survivors.length - limit} more.`);
  }
}
process.stdout.write(`${lines.join("\n")}\n`);
