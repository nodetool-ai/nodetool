#!/usr/bin/env node
// Keeps the agent-instruction docs paired and consistent.
//
// `CLAUDE.md` is a macro that imports its sibling `AGENTS.md` and holds no
// content of its own (root AGENTS.md, "single source of truth"). Claude Code
// reads CLAUDE.md, other agents read AGENTS.md, and a directory carrying only
// one of the two serves half its readers a different set of rules.
//
//   1. Every directory with an AGENTS.md has a CLAUDE.md beside it.
//   2. Every CLAUDE.md is exactly `@AGENTS.md` — no forked content.
//   3. Every CLAUDE.md has an AGENTS.md to import.
//   4. Every AGENTS.md is reachable by link from the root one, directly or
//      through another AGENTS.md, so nothing goes unread because nothing
//      points at it.

import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MACRO = "@AGENTS.md";

async function find(name) {
  const out = [];
  for await (const match of glob(`**/${name}`, {
    cwd: repoRoot,
    exclude: (entry) => entry === "node_modules" || entry === "dist" || entry === ".git",
  })) {
    out.push(match);
  }
  return out.sort();
}

/** Files an AGENTS.md links to, resolved repo-relative. */
async function linkedAgentsFiles(file) {
  const body = await readFile(join(repoRoot, file), "utf8");
  const links = [...body.matchAll(/\]\(([^)\s]+AGENTS\.md)(?:#[^)]*)?\)/g)].map((m) => m[1]);
  return links
    .filter((href) => !href.startsWith("http"))
    .map((href) => relative(repoRoot, resolve(join(repoRoot, dirname(file)), href)));
}

async function main() {
  const agents = await find("AGENTS.md");
  const claude = new Set(await find("CLAUDE.md"));
  const failures = [];

  for (const file of agents) {
    const sibling = join(dirname(file), "CLAUDE.md");
    if (!claude.has(sibling)) {
      failures.push(`${sibling} is missing — every AGENTS.md needs a CLAUDE.md importing it`);
      continue;
    }
    const body = (await readFile(join(repoRoot, sibling), "utf8")).trim();
    if (body !== MACRO) {
      failures.push(`${sibling} must be exactly \`${MACRO}\` — put the content in AGENTS.md instead`);
    }
  }

  for (const file of claude) {
    if (!agents.includes(join(dirname(file), "AGENTS.md"))) {
      failures.push(`${file} imports an AGENTS.md that does not exist`);
    }
  }

  // Walk the link graph out from the root file.
  const known = new Set(agents);
  const reached = new Set(["AGENTS.md"]);
  const queue = ["AGENTS.md"];
  while (queue.length > 0) {
    const file = queue.shift();
    for (const target of await linkedAgentsFiles(file)) {
      if (known.has(target) && !reached.has(target)) {
        reached.add(target);
        queue.push(target);
      }
    }
  }
  for (const file of agents) {
    if (!reached.has(file)) {
      failures.push(`${file} is not linked from AGENTS.md or anything it reaches — add it to a navigation list`);
    }
  }

  if (failures.length > 0) {
    console.error("Agent-doc check failed:\n");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Agent docs OK: ${agents.length} AGENTS.md files, each paired and reachable.`);
}

await main();
