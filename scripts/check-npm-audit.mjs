#!/usr/bin/env node
// Ratchet for high and critical npm advisories in production dependencies.
//
//   node scripts/check-npm-audit.mjs --base <ref>   PR mode: fail on an advisory
//                                                   the diff adds, compared with
//                                                   the same audit of <ref>
//   node scripts/check-npm-audit.mjs                 full mode: fail on any
//                                                   advisory the allowlist does
//                                                   not explain
//   node scripts/check-npm-audit.mjs --write         add unlisted advisories with
//                                                   an empty reason, drop fixed ones
//
// Each project (the root workspace tree and mobile/, which has its own lock) is
// audited from its lockfile alone, so no install is needed and a base ref is
// audited from manifests extracted with `git archive`. Comparing base and head
// in PR mode keeps a newly published advisory from failing every open PR: it
// appears on both sides and is the nightly full run's to report.
//
// The allowlist is .github/npm-audit-allowlist.json. Every entry needs a reason:
// why the advisory is not reachable, or what fixing it takes.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;
export const ALLOWLIST_PATH = join(ROOT, ".github/npm-audit-allowlist.json");
const BLOCKING = new Set(["high", "critical"]);

/** Project name → directory, relative to the repo root. */
export const PROJECTS = { root: ".", mobile: "mobile" };

/** The blocking advisories in one `npm audit --json` report. */
export function advisoriesFromAudit(report, project) {
  if (report.error) {
    throw new Error(`npm audit failed for ${project}: ${report.error.summary ?? JSON.stringify(report.error)}`);
  }
  const byId = new Map();
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via !== "object" || !BLOCKING.has(via.severity)) {
        continue;
      }
      const id = via.url?.split("/").pop() || String(via.source);
      byId.set(`${project}:${id}`, {
        project,
        id,
        package: via.name,
        severity: via.severity,
        title: via.title,
        url: via.url,
      });
    }
  }
  return [...byId.values()].sort((a, b) => key(a).localeCompare(key(b)));
}

export const key = (a) => `${a.project}:${a.id}`;

/** Advisories in `head` that are neither in `base` nor allowlisted. */
export function addedAdvisories(head, base, allowlist) {
  const known = new Set([...base.map(key), ...allowlist.map(key)]);
  return head.filter((a) => !known.has(key(a)));
}

/** Compare the current advisories with the allowlist. */
export function checkAllowlist(current, allowlist) {
  const listed = new Set(allowlist.map(key));
  const present = new Set(current.map(key));
  return {
    unlisted: current.filter((a) => !listed.has(key(a))),
    stale: allowlist.filter((a) => !present.has(key(a))),
    unexplained: allowlist.filter((a) => present.has(key(a)) && !a.reason?.trim()),
  };
}

/** The allowlist `--write` produces: current advisories, keeping existing reasons. */
export function mergeAllowlist(current, allowlist) {
  const reasons = new Map(allowlist.map((a) => [key(a), a.reason]));
  return current.map((a) => ({ ...a, reason: reasons.get(key(a)) ?? "" }));
}

function audit(dir, project) {
  let out;
  try {
    out = execFileSync("npm", ["audit", "--package-lock-only", "--omit=dev", "--json"], {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    // npm audit exits non-zero whenever it finds anything; the report is still on stdout.
    out = err.stdout;
  }
  if (!out) {
    throw new Error(`npm audit printed nothing for ${project}`);
  }
  return advisoriesFromAudit(JSON.parse(out), project);
}

function auditWorkingTree() {
  return Object.entries(PROJECTS).flatMap(([project, dir]) => audit(join(ROOT, dir), project));
}

/** Audit each project as it stood at `ref`, from its manifests alone. */
function auditRef(ref) {
  const dir = mkdtempSync(join(tmpdir(), "npm-audit-base-"));
  try {
    const files = execFileSync("git", ["ls-tree", "-r", "--name-only", ref], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .filter((f) => /(^|\/)package(-lock)?\.json$/.test(f) && !f.includes("node_modules/"));
    const archive = execFileSync("git", ["archive", ref, ...files], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", dir], { input: archive });
    return Object.entries(PROJECTS).flatMap(([project, sub]) => audit(join(dir, sub), project));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const describe = (a) => `  ${a.severity.padEnd(8)} ${a.project}:${a.package} ${a.id} — ${a.title}`;

function readAllowlist() {
  return JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")).advisories;
}

function main() {
  const args = process.argv.slice(2);
  const baseAt = args.indexOf("--base");
  const allowlist = readAllowlist();
  const current = auditWorkingTree();

  if (args.includes("--write")) {
    const merged = mergeAllowlist(current, allowlist);
    writeFileSync(ALLOWLIST_PATH, `${JSON.stringify({ advisories: merged }, null, 2)}\n`);
    console.log(`Wrote ${merged.length} advisories to ${ALLOWLIST_PATH}. Fill in every empty reason.`);
    return;
  }

  if (baseAt >= 0) {
    const base = auditRef(args[baseAt + 1]);
    const added = addedAdvisories(current, base, allowlist);
    console.log(`High/critical production advisories: ${base.length} at base, ${current.length} here.`);
    if (added.length) {
      console.error("This change adds high or critical advisories:");
      added.forEach((a) => console.error(describe(a)));
      console.error("Upgrade or replace the dependency, or allowlist the advisory with a reason in .github/npm-audit-allowlist.json.");
      process.exit(1);
    }
    return;
  }

  const { unlisted, stale, unexplained } = checkAllowlist(current, allowlist);
  console.log(`High/critical production advisories: ${current.length}, allowlisted: ${current.length - unlisted.length}.`);
  stale.forEach((a) => console.log(`fixed, remove from the allowlist (npm run check:npm-audit -- --write): ${a.project}:${a.package} ${a.id}`));
  if (unlisted.length || unexplained.length) {
    unlisted.forEach((a) => console.error(`not allowlisted:${describe(a)}`));
    unexplained.forEach((a) => console.error(`allowlisted without a reason:${describe(a)}`));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
