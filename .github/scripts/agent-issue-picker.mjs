#!/usr/bin/env node
// Ranks the open issues for the issue-shipper routine, so the agent starts
// from the issues worth a full PR instead of scanning the code for something
// small to change.
//
//   node .github/scripts/agent-issue-picker.mjs [--limit 8]
//
// It drops issues nobody should start: claimed by another agent in the last
// 24 hours, assigned to someone, named by a closing keyword in an open PR,
// waiting on an open dependency, or labelled as planning, reports or
// duplicates. It scores the rest, keeps at most two issues per bracketed
// series prefix, and writes the top ones to the `candidates` step output as
// Markdown, one issue per line with the reasons for its score.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SKIP_LABELS = new Set(["planning", "model-watch", "question", "duplicate", "wontfix", "invalid", "agent:skip"]);
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const BUG_TITLE = /\b(fails?|failing|broken|crash(es)?|hangs?|leaks?|silently|regress(ion|es)?|error|wrong|ignores?|overwrites?|cannot|can't)\b/i;
const REPRO_HEADING = /^#{2,3}\s*(reproduction|steps to reproduce)/im;
const SPEC_HEADING = /^#{2,3}\s*(reproduction|steps to reproduce|expected|scope|exit evidence|acceptance)/im;
const SERIES_PREFIX = /^\[([^\]]+)\]/;
const PER_SERIES = 2;
const CLOSING_REF = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
const DEPENDS_ON = /\b(?:depends on|blocked by)\s+(#\d+(?:\s*(?:,|and)\s*#\d+)*)/gi;

const labelNames = (issue) => issue.labels.map((l) => l.name.toLowerCase());

/** Issue numbers an open PR says it closes. */
export function linkedIssueNumbers(prs) {
  const linked = new Set();
  for (const pr of prs) {
    for (const ref of pr.closingIssuesReferences ?? []) {
      linked.add(ref.number);
    }
    for (const match of `${pr.title}\n${pr.body ?? ""}`.matchAll(CLOSING_REF)) {
      linked.add(Number(match[1]));
    }
  }
  return linked;
}

export function hasFreshClaim(issue, now) {
  if (!labelNames(issue).includes("agent:claimed")) {
    return false;
  }
  return (issue.comments ?? []).some(
    (c) => /^Claimed by /m.test(c.body ?? "") && now - new Date(c.createdAt).getTime() < CLAIM_TTL_MS,
  );
}

export function openDependencies(issue, openNumbers) {
  const deps = [];
  for (const match of (issue.body ?? "").matchAll(DEPENDS_ON)) {
    for (const ref of match[1].matchAll(/#(\d+)/g)) {
      const n = Number(ref[1]);
      if (n !== issue.number && openNumbers.has(n)) {
        deps.push(n);
      }
    }
  }
  return deps;
}

export function scoreIssue(issue) {
  const labels = labelNames(issue);
  const reasons = [];
  let score = 0;
  if (labels.includes("bug") || BUG_TITLE.test(issue.title) || REPRO_HEADING.test(issue.body ?? "")) {
    score += 4;
    reasons.push("bug");
  } else if (labels.some((l) => ["enhancement", "improvement", "feature"].includes(l))) {
    score += 2;
    reasons.push("enhancement");
  }
  if (labels.includes("provider-gap")) {
    score += 2;
    reasons.push("missing provider models");
  }
  if (SPEC_HEADING.test(issue.body ?? "")) {
    score += 3;
    reasons.push("has repro or acceptance criteria");
  }
  const reactions = (issue.reactionGroups ?? []).reduce((sum, g) => sum + (g.users?.totalCount ?? 0), 0);
  if (reactions > 0) {
    score += Math.min(reactions, 5);
    reasons.push(`${reactions} reactions`);
  }
  const humanComments = (issue.comments ?? []).filter((c) => !/^Claimed by /m.test(c.body ?? "")).length;
  if (humanComments > 0) {
    score += Math.min(humanComments, 3) * 0.5;
    reasons.push(`${humanComments} comments`);
  }
  return { score, reasons };
}

export function rankIssues(issues, { prs, now, limit }) {
  const linked = linkedIssueNumbers(prs);
  const openNumbers = new Set(issues.map((i) => i.number));
  const ranked = [];
  for (const issue of issues) {
    const labels = labelNames(issue);
    if (labels.some((l) => SKIP_LABELS.has(l)) || /\(tracking\)/i.test(issue.title)) continue;
    if ((issue.assignees ?? []).length > 0) continue;
    if (linked.has(issue.number)) continue;
    if (hasFreshClaim(issue, now)) continue;
    if (openDependencies(issue, openNumbers).length > 0) continue;
    ranked.push({ number: issue.number, title: issue.title, labels, ...scoreIssue(issue) });
  }
  // Ties go to the older issue: it has waited longer.
  ranked.sort((a, b) => b.score - a.score || a.number - b.number);
  // A planned series such as "[music-mode] …" files dozens of issues at once.
  // Keep two per series so standalone bugs still reach the shortlist.
  const perSeries = new Map();
  return ranked
    .filter((r) => {
      const series = SERIES_PREFIX.exec(r.title)?.[1].toLowerCase();
      if (!series) return true;
      perSeries.set(series, (perSeries.get(series) ?? 0) + 1);
      return perSeries.get(series) <= PER_SERIES;
    })
    .slice(0, limit);
}

export function toMarkdown(ranked) {
  return ranked
    .map((r) => `- #${r.number} (score ${r.score}: ${r.reasons.join(", ") || "no signals"}) ${r.title}`)
    .join("\n");
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function main() {
  const limitAt = process.argv.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(process.argv[limitAt + 1]) : 8;
  const issues = JSON.parse(
    gh([
      "issue", "list", "--state", "open", "--limit", "1000",
      "--json", "number,title,body,labels,assignees,comments,reactionGroups",
    ]),
  );
  if (issues.length >= 1000) throw new Error("issue discovery is incomplete: result limit reached");
  const prs = JSON.parse(gh(["pr", "list", "--state", "open", "--limit", "1000", "--json", "number,title,body,closingIssuesReferences"]));
  if (prs.length >= 1000) throw new Error("PR discovery is incomplete: result limit reached");

  const ranked = rankIssues(issues, { prs, now: Date.now(), limit });
  const markdown = toMarkdown(ranked);
  const summary = `## Issue candidates\n\n${markdown || "No eligible open issue."}\n`;
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `candidates<<__AGENT_EOF__\n${markdown}\n__AGENT_EOF__\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
