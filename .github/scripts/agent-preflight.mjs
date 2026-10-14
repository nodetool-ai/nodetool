#!/usr/bin/env node
// Preflight for the scheduled agent workflows. Runs before any install so a
// routine with nothing to do costs seconds, not a full checkout and build.
//
//   node .github/scripts/agent-preflight.mjs --name logic-simplifier \
//     --title '^refactor: simplify' [--days 30]
//
// It ensures the `agent:<name>` label exists, then reads this routine's PRs:
// one carries the label, or (for PRs opened before the label existed) was
// opened by the Claude app with a title matching --title. It writes two step
// outputs: `skip=true` when one of them is still open, and `recent-files`,
// the files its PRs merged in the last --days days changed, so the next run
// picks a different target instead of reworking the same function.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CLAUDE_LOGINS = new Set(["claude[bot]", "app/claude", "claude"]);

export function belongsToRoutine(pr, label, titleRegex) {
  if (pr.labels.some((l) => l.name === label)) {
    return true;
  }
  return Boolean(titleRegex) && CLAUDE_LOGINS.has(pr.author?.login) && titleRegex.test(pr.title);
}

export function summarize(prs, { label, titleRegex, since }) {
  const own = prs.filter((pr) => belongsToRoutine(pr, label, titleRegex));
  const open = own.filter((pr) => pr.state === "OPEN");
  const files = new Set();
  for (const pr of own) {
    if (pr.state === "MERGED" && pr.mergedAt && new Date(pr.mergedAt) >= since) {
      for (const f of pr.files ?? []) {
        files.add(f.path);
      }
    }
  }
  return { open, recentFiles: [...files].sort() };
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function parseArgs(argv) {
  const args = { days: 30 };
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, "")] = argv[i + 1];
  }
  if (!args.name) {
    throw new Error("--name is required");
  }
  return args;
}

function main() {
  const { name, title, days } = parseArgs(process.argv.slice(2));
  const label = `agent:${name}`;
  const titleRegex = title ? new RegExp(title) : null;
  const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

  gh(["label", "create", label, "--color", "5319e7", "--description", `Opened by the ${name} workflow`, "--force"]);

  // Every routine opens its PRs as the Claude app, so the author filter keeps
  // both queries small. The open query has no date bound: an old open PR
  // still blocks a new one.
  const fields = "number,title,state,author,labels,mergedAt,files";
  const list = (state, search) =>
    JSON.parse(gh(["pr", "list", "--state", state, "--search", search, "--limit", "300", "--json", fields]));
  const prs = [
    ...list("open", "author:app/claude"),
    ...list("merged", `author:app/claude merged:>=${since.toISOString().slice(0, 10)}`),
  ];

  const { open, recentFiles } = summarize(prs, { label, titleRegex, since });

  const summary = [
    `## Agent preflight: ${name}`,
    open.length ? `Skipping: open PR ${open.map((pr) => `#${pr.number}`).join(", ")}` : "No open PR from this routine.",
    `${recentFiles.length} files changed by this routine's PRs merged in the last ${days} days.`,
    "",
  ].join("\n");
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `skip=${open.length > 0}\nrecent-files<<__AGENT_EOF__\n${recentFiles.join("\n")}\n__AGENT_EOF__\n`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
