#!/usr/bin/env node
// Summarize the snapshots nodetool-mutator writes under .metrics/mutate.
//
// Usage:
//   node scripts/mutation-score.mjs [--metrics-dir <rel>] [pkg ...]
//   node scripts/mutation-score.mjs --survivors [--limit N] [--json] [--metrics-dir <rel>] [pkg ...]
//
// The first form prints a Markdown table of the mutation score per package.
// The score is killed / (killed + survived), as in unclebob/mutator. Uncovered
// sites are listed but excluded from the score. --survivors lists every
// surviving mutant with its file, line, function, and replacement.
// Package names select snapshots whose forms live in packages/<pkg>/. With no
// names, every snapshot is read. Exits 0 always (reporting only).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        return walk(path);
      }
      return name.endsWith(".json") ? [path] : [];
    });
}

export function packageOf(file) {
  const match = /^packages\/([^/]+)\//.exec(file);
  return match ? match[1] : file.split("/")[0];
}

export function loadSnapshots(metricsDir) {
  return walk(metricsDir).map((path) => JSON.parse(readFileSync(path, "utf8")));
}

export function scoreTable(snapshots, requested) {
  const rows = new Map(requested.map((pkg) => [pkg, null]));
  for (const snapshot of snapshots) {
    for (const form of snapshot.forms ?? []) {
      const pkg = packageOf(form.file ?? snapshot.source);
      if (requested.length > 0 && !rows.has(pkg)) {
        continue;
      }
      const row = rows.get(pkg) ?? { killed: 0, survived: 0, uncovered: 0 };
      row.killed += form.killed ?? 0;
      row.survived += form.survived ?? 0;
      row.uncovered += form.uncovered ?? 0;
      rows.set(pkg, row);
    }
  }
  const fmt = (killed, survived) =>
    killed + survived === 0 ? "—" : `${((killed / (killed + survived)) * 100).toFixed(2)}%`;
  const lines = ["| Package | Mutation Score | Killed / Run | Uncovered |", "| --- | --- | --- | --- |"];
  const total = { killed: 0, survived: 0, uncovered: 0 };
  for (const [pkg, row] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
    if (row === null) {
      lines.push(`| \`${pkg}\` | ⚠️ no snapshot | — | — |`);
      continue;
    }
    total.killed += row.killed;
    total.survived += row.survived;
    total.uncovered += row.uncovered;
    lines.push(
      `| \`${pkg}\` | ${fmt(row.killed, row.survived)} | ${row.killed} / ${row.killed + row.survived} | ${row.uncovered} |`
    );
  }
  lines.push(
    `| **Overall** | **${fmt(total.killed, total.survived)}** | **${total.killed} / ${total.killed + total.survived}** | **${total.uncovered}** |`
  );
  return `${lines.join("\n")}\n`;
}

function lineAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

export function survivors(snapshots, requested, readSource) {
  const found = [];
  const sources = new Map();
  for (const snapshot of snapshots) {
    for (const [mutation, status] of Object.entries(snapshot.outcomes ?? {})) {
      if (status !== "survived") {
        continue;
      }
      const [file, namespace, form, start, , original, mutant] = JSON.parse(mutation);
      if (requested.length > 0 && !requested.includes(packageOf(file))) {
        continue;
      }
      if (!sources.has(file)) {
        sources.set(file, readSource(file));
      }
      const source = sources.get(file);
      found.push({
        file,
        line: source === null ? 0 : lineAt(source, start),
        function: `${namespace} ${form.replace(/^defn-?\//, "")}`,
        mutation: mutant === "" ? `delete ${original}` : `${original} -> ${mutant}`
      });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function readRepoFile(file) {
  try {
    return readFileSync(join(root, file), "utf8");
  } catch {
    return null;
  }
}

function main(argv) {
  const args = [...argv];
  const take = (flag) => {
    const index = args.indexOf(flag);
    if (index === -1) {
      return null;
    }
    const [, value] = args.splice(index, 2);
    return value;
  };
  const flag = (name) => {
    const index = args.indexOf(name);
    if (index === -1) {
      return false;
    }
    args.splice(index, 1);
    return true;
  };
  const metricsDir = join(root, take("--metrics-dir") ?? ".metrics/mutate");
  const limit = Number(take("--limit") ?? 40);
  const listSurvivors = flag("--survivors");
  const asJson = flag("--json");
  const snapshots = loadSnapshots(metricsDir);
  if (!listSurvivors) {
    return scoreTable(snapshots, args);
  }
  const list = survivors(snapshots, args, readRepoFile);
  if (asJson) {
    return `${JSON.stringify(list, null, 2)}\n`;
  }
  const lines = [`${list.length} mutants survived.`, ""];
  if (list.length > 0) {
    lines.push("| File | Line | Function | Mutation |", "| --- | --- | --- | --- |");
    for (const entry of list.slice(0, limit)) {
      lines.push(`| \`${entry.file}\` | ${entry.line} | \`${entry.function}\` | \`${entry.mutation}\` |`);
    }
    if (list.length > limit) {
      lines.push("", `…and ${list.length - limit} more.`);
    }
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(main(process.argv.slice(2)));
}
