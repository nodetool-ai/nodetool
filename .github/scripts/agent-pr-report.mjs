#!/usr/bin/env node
// Outcome report for the scheduled agent workflows: per `agent:*` label, how
// many PRs were opened, merged, and closed unmerged, and the net lines the
// merged ones added. A routine whose PRs stop merging, or that keeps growing
// the code it was meant to shrink, shows up here.
//
//   node .github/scripts/agent-pr-report.mjs [--days 30]

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function tally(prs) {
  const rows = new Map();
  for (const pr of prs) {
    for (const { name } of pr.labels) {
      if (!name.startsWith("agent:")) {
        continue;
      }
      const row = rows.get(name) ?? { label: name, opened: 0, merged: 0, closed: 0, open: 0, net: 0 };
      row.opened += 1;
      if (pr.state === "MERGED") {
        row.merged += 1;
        row.net += pr.additions - pr.deletions;
      } else if (pr.state === "CLOSED") {
        row.closed += 1;
      } else {
        row.open += 1;
      }
      rows.set(name, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function toMarkdown(rows, days) {
  const lines = [
    `## Agent PR outcomes, last ${days} days`,
    "",
    "| Workflow | Opened | Merged | Closed unmerged | Open | Net lines merged |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const net = r.net > 0 ? `+${r.net}` : String(r.net);
    lines.push(`| ${r.label.slice("agent:".length)} | ${r.opened} | ${r.merged} | ${r.closed} | ${r.open} | ${net} |`);
  }
  if (rows.length === 0) {
    lines.push("| (no labeled agent PRs) | | | | | |");
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const i = process.argv.indexOf("--days");
  const days = i > 0 ? Number(process.argv[i + 1]) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const prs = JSON.parse(
    execFileSync(
      "gh",
      ["pr", "list", "--state", "all", "--search", `author:app/claude created:>=${since}`, "--limit", "1000", "--json", "number,state,labels,additions,deletions"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    ),
  );
  const markdown = toMarkdown(tally(prs), days);
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
