/**
 * System skills — the instruction documents that ship with NodeTool.
 *
 * A user skill is a row someone wrote and can rewrite. A system skill is a
 * `SKILL.md` in the build: same shape in the prompt, but **immutable**, so a
 * workflow the product depends on cannot be edited away by an agent that
 * mis-read its own instructions, and every install has it on day one without a
 * seeding migration that then drifts per machine.
 *
 * Nothing imports these files, so they are not a workspace and npm links
 * nothing. Discovery mirrors the sandbox packs (`shippedPackSearchPaths`):
 * `_skills/` beside the bundled `server.mjs`, else `packages/system-skills` on
 * the way up from this module, else `NODETOOL_SYSTEM_SKILLS_DIR`.
 *
 * Their names are **reserved**: `create_skill` and `update_skill` refuse them,
 * so a user row can never shadow one going forward.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHIPPED_SYSTEM_SKILLS_BUNDLE_DIR,
  SHIPPED_SYSTEM_SKILLS_SOURCE_DIR
} from "@nodetool-ai/config";
import { isValidSkillDescription, isValidSkillName } from "@nodetool-ai/protocol";

/** One shipped skill, as the catalog and `load_skill` both see it. */
export interface SystemSkill {
  readonly name: string;
  readonly description: string;
  readonly content: string;
  /** Always true — the field exists so a merged list stays self-describing. */
  readonly system: true;
}

/** The directory holding the shipped skills, or null when this build has none. */
export function systemSkillsDir(): string | null {
  const override = process.env["NODETOOL_SYSTEM_SKILLS_DIR"];
  if (override) return existsSync(override) ? override : null;

  const here = dirname(fileURLToPath(import.meta.url));
  const bundled = join(here, SHIPPED_SYSTEM_SKILLS_BUNDLE_DIR);
  if (existsSync(bundled)) return bundled;

  const segments = SHIPPED_SYSTEM_SKILLS_SOURCE_DIR.split("/");
  let dir = here;
  for (;;) {
    const candidate = join(dir, ...segments);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Split a `SKILL.md` into its frontmatter fields and body.
 *
 * Deliberately not a YAML parse: the frontmatter is two scalar fields, and
 * pulling js-yaml into the host to read them would buy nothing. A file whose
 * frontmatter is missing or malformed yields null and is skipped rather than
 * failing the whole catalog — one bad shipped file must not cost a user every
 * other skill.
 */
export function parseSkillMarkdown(text: string): {
  name: string;
  description: string;
  content: string;
} | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return null;
  const [, front, body] = match;
  const field = (key: string): string => {
    const line = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(front ?? "");
    return (line?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
  };
  const name = field("name").toLowerCase();
  const description = field("description");
  const content = (body ?? "").trim();
  if (!name || !description || !content) return null;
  if (!isValidSkillName(name) || !isValidSkillDescription(description)) {
    return null;
  }
  return { name, description, content };
}

let cache: readonly SystemSkill[] | null = null;

/**
 * Every shipped skill, read once per process.
 *
 * Cached because the files are part of the build and cannot change under a
 * running server; `clearSystemSkillCache` exists for tests that stage a
 * directory of their own.
 */
export function loadSystemSkills(): readonly SystemSkill[] {
  if (cache) return cache;
  cache = readSystemSkills();
  return cache;
}

/** Drop the cache. Tests only. */
export function clearSystemSkillCache(): void {
  cache = null;
}

function readSystemSkills(): readonly SystemSkill[] {
  const root = systemSkillsDir();
  if (!root) return [];
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const skills: SystemSkill[] = [];
  const seen = new Set<string>();
  for (const entry of entries.sort()) {
    const file = join(root, entry, "SKILL.md");
    try {
      if (!statSync(join(root, entry)).isDirectory()) continue;
      if (!existsSync(file)) continue;
      const parsed = parseSkillMarkdown(readFileSync(file, "utf8"));
      if (!parsed) continue;
      // The directory names the skill. A frontmatter name that disagrees is a
      // packaging mistake, and taking the directory keeps `/name` matching what
      // a reader sees on disk.
      if (parsed.name !== entry.toLowerCase()) continue;
      if (seen.has(parsed.name)) continue;
      seen.add(parsed.name);
      skills.push({ ...parsed, system: true });
    } catch {
      // A skill that cannot be read is skipped, never fatal.
    }
  }
  return skills;
}

/** Whether `name` belongs to a shipped skill, and is therefore not writable. */
export function isSystemSkillName(name: string): boolean {
  const wanted = name.trim().replace(/^\//, "").toLowerCase();
  return loadSystemSkills().some((skill) => skill.name === wanted);
}

/** One shipped skill by name, or null. */
export function findSystemSkill(name: string): SystemSkill | null {
  const wanted = name.trim().replace(/^\//, "").toLowerCase();
  return loadSystemSkills().find((skill) => skill.name === wanted) ?? null;
}

/**
 * The catalog a prompt or `list_skills` should show: the user's rows, plus every
 * shipped skill the user has not already taken the name of.
 *
 * A pre-existing user row wins on a collision. Reserving the names only stops
 * *new* ones, so a row written before a skill shipped keeps working — and the
 * person who wrote it gets what they wrote.
 */
export function mergeSystemSkills<T extends { name: string; description: string }>(
  userSkills: readonly T[]
): (T | SystemSkill)[] {
  const taken = new Set(userSkills.map((skill) => skill.name.toLowerCase()));
  const shipped = loadSystemSkills().filter((skill) => !taken.has(skill.name));
  return [...userSkills, ...shipped];
}
