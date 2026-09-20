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
//
// It also checks the skills, which are the other half of what an agent is told.
// `packages/system-skills/<name>` holds the one copy of a NodeTool skill and
// `.claude/skills/<name>` is a symlink to it, so the product and the coding
// agent read the same document:
//
//   5. A `.claude/skills` entry naming a shipped skill is that symlink, not a
//      second copy that drifts from it.
//   6. Every symlink under `.claude/skills` resolves to a real SKILL.md.
//   7. A shipped skill's frontmatter `name` matches its directory, and it ships
//      nothing but `SKILL.md` — the loader silently drops both mistakes, so the
//      skill would simply be absent from the catalog with no error anywhere.

import { readFile, lstat, readdir, readlink } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SYSTEM_SKILLS_DIR = "packages/system-skills";
const REPO_SKILLS_DIR = ".claude/skills";

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

  const skills = await checkSkills(failures);

  if (failures.length > 0) {
    console.error("Agent-doc check failed:\n");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Agent docs OK: ${agents.length} AGENTS.md files, each paired and reachable; ` +
      `${skills.shipped} system skills, ${skills.linked} of them linked into ${REPO_SKILLS_DIR}.`
  );
}

/** Directory entries, or [] when the directory is absent. */
async function entries(dir) {
  try {
    return await readdir(join(repoRoot, dir));
  } catch {
    return [];
  }
}

/** The frontmatter `name` of a SKILL.md, or null when it has none. */
function frontmatterName(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const close = lines.indexOf("---", 1);
  if (close === -1) return null;
  const match = /^name:(.*)$/m.exec(lines.slice(1, close).join("\n"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "").toLowerCase() : null;
}

/** Rules 5-7. Returns the counts the success line reports. */
async function checkSkills(failures) {
  const shipped = [];
  for (const name of (await entries(SYSTEM_SKILLS_DIR)).sort()) {
    const dir = join(SYSTEM_SKILLS_DIR, name);
    let stat;
    try {
      stat = await lstat(join(repoRoot, dir));
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let body;
    try {
      body = await readFile(join(repoRoot, dir, "SKILL.md"), "utf8");
    } catch {
      failures.push(`${dir} has no SKILL.md — a system skill is one directory holding one`);
      continue;
    }
    shipped.push(name);
    const declared = frontmatterName(body);
    if (declared !== name) {
      failures.push(
        `${dir}/SKILL.md declares name "${declared ?? "(none)"}" — the loader takes the ` +
          `directory name and drops the skill when they disagree, with no error`
      );
    }
    // Only SKILL.md is staged into the bundle and only SKILL.md is read, so a
    // reference file beside it is instructions the product never sees.
    const extra = (await entries(dir)).filter((entry) => entry !== "SKILL.md");
    if (extra.length > 0) {
      failures.push(
        `${dir} ships ${extra.join(", ")} beside SKILL.md — load_skill returns one ` +
          `document, so fold that material into a \`##\` section of the body`
      );
    }
  }

  const known = new Set(shipped);
  let linked = 0;
  for (const name of (await entries(REPO_SKILLS_DIR)).sort()) {
    const entry = join(REPO_SKILLS_DIR, name);
    const stat = await lstat(join(repoRoot, entry));
    if (stat.isSymbolicLink()) {
      const target = relative(
        repoRoot,
        resolve(join(repoRoot, REPO_SKILLS_DIR), await readlink(join(repoRoot, entry)))
      );
      if (target !== join(SYSTEM_SKILLS_DIR, name)) {
        failures.push(
          `${entry} points at ${target} — a repository skill links to ${join(SYSTEM_SKILLS_DIR, name)} or nothing`
        );
      } else if (!known.has(name)) {
        failures.push(`${entry} points at a system skill that does not exist`);
      } else {
        linked += 1;
      }
      continue;
    }
    if (stat.isDirectory() && known.has(name)) {
      failures.push(
        `${entry} is a copy of the shipped skill — replace it with a symlink to ` +
          `${join(SYSTEM_SKILLS_DIR, name)} so both readers get one document`
      );
    }
  }
  return { shipped: shipped.length, linked };
}

await main();
