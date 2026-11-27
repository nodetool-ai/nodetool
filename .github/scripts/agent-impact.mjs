#!/usr/bin/env node
// Writes the impact signals the scheduled agent routines rank their
// candidates by (.github/agent-routines.md):
//
//   node .github/scripts/agent-impact.mjs "$RUNNER_TEMP/agent-impact.md" [--days 90]
//
// Hot areas and files come from maintainers' commits on the checked-out
// history (it needs `fetch-depth: 0`), without bot commits, tests, docs and
// generated files. Open issues come from the REST API through `gh`.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SOURCE = /\.(ts|tsx|mts|mjs|js|cpp|cc|h|hpp|qml|py)$/;
const EXCLUDED = /(^|\/)(__tests__|tests?|fixtures|generated|dist|node_modules|docs)\/|\.(test|spec)\.[a-z]+$|\.d\.ts$/;
const BOT_AUTHOR = /\[bot\]$/;

/** Groups a path into the area a routine would call one module. */
export function areaOf(path) {
  const parts = path.split("/");
  if (["packages", "native"].includes(parts[0]) && parts.length > 2) return parts.slice(0, 2).join("/");
  if (["web", "electron", "mobile"].includes(parts[0]) && parts[1] === "src" && parts.length > 3) return parts.slice(0, 3).join("/");
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/") || path;
}

/**
 * Parses `git log --format=%x00%an --name-only` output into commit counts per
 * file and per area, skipping bot authors and non-source paths.
 */
export function rankHotspots(log, { files = 30, areas = 15 } = {}) {
  const fileCounts = new Map();
  const areaCounts = new Map();
  for (const entry of log.split("\0").slice(1)) {
    const [author, ...paths] = entry.split("\n");
    if (BOT_AUTHOR.test(author.trim())) continue;
    const touchedAreas = new Set();
    for (const path of paths.map((p) => p.trim())) {
      if (!path || !SOURCE.test(path) || EXCLUDED.test(path)) continue;
      fileCounts.set(path, (fileCounts.get(path) ?? 0) + 1);
      touchedAreas.add(areaOf(path));
    }
    for (const area of touchedAreas) {
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
    }
  }
  const top = (counts, n) => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
  return { files: top(fileCounts, files), areas: top(areaCounts, areas) };
}

export function toMarkdown({ files, areas }, issues, days) {
  const lines = [`# Impact signals`, "", `## Hot areas (maintainer commits, last ${days} days)`, ""];
  lines.push(...(areas.length ? areas.map(([a, n]) => `- ${a}: ${n}`) : ["- none found"]));
  lines.push("", "## Hot files", "");
  lines.push(...(files.length ? files.map(([f, n]) => `- ${f}: ${n}`) : ["- none found"]));
  lines.push("", "## Open issues", "");
  lines.push(
    ...(issues.length
      ? issues.map((i) => `- #${i.number} ${i.title}${i.labels.length ? ` [${i.labels.join(", ")}]` : ""}`)
      : ["- none found"]),
  );
  return `${lines.join("\n")}\n`;
}

function openIssues() {
  try {
    const pages = JSON.parse(
      execFileSync("gh", ["api", "--paginate", "--slurp", "repos/{owner}/{repo}/issues?state=open&per_page=100"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
    return pages
      .flat()
      .filter((i) => !i.pull_request && !BOT_AUTHOR.test(i.user?.login ?? ""))
      .map((i) => ({ number: i.number, title: i.title, labels: i.labels.map((l) => l.name) }));
  } catch (error) {
    process.stderr.write(`open issues unavailable: ${error.message}\n`);
    return [];
  }
}

function main() {
  const [out, ...rest] = process.argv.slice(2);
  if (!out) throw new Error("usage: agent-impact.mjs <output.md> [--days N]");
  const daysAt = rest.indexOf("--days");
  const days = daysAt >= 0 ? Number(rest[daysAt + 1]) : 90;
  const log = execFileSync("git", ["log", `--since=${days}.days`, "--no-merges", "--format=%x00%an", "--name-only", "HEAD"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const markdown = toMarkdown(rankHotspots(log), openIssues(), days);
  writeFileSync(out, markdown);
  process.stdout.write(markdown);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
