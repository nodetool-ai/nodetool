/**
 * Skill loader — discovers and parses SKILL.md files from the filesystem.
 *
 * SKILL.md format:
 *
 * ```
 * ---
 * name: my-skill
 * description: "Short description of the skill"
 * ---
 * Detailed instructions that will be injected into the system prompt…
 * ```
 *
 * Skills are resolved from multiple directories (constructor args, env vars,
 * and well-known defaults) and can be matched automatically against an
 * objective string.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createLogger } from "@nodetool/config";
import type { ProviderSkill } from "./types.js";

const log = createLogger("nodetool.runtime.providers.skill-loader");

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const INVALID_SKILL_NAME_RE = /[^a-z0-9-]/;
const XML_TAG_RE = /<[^>]+>/;
const SKILL_RESERVED_TERMS = ["anthropic", "claude"];
const SKILL_WORD_RE = /[a-z0-9]+/g;

function isValidSkillName(name: string): boolean {
  if (!name || name.length > 64) return false;
  if (INVALID_SKILL_NAME_RE.test(name)) return false;
  const lowered = name.toLowerCase();
  return !SKILL_RESERVED_TERMS.some((term) => lowered.includes(term));
}

function isValidSkillDescription(description: string): boolean {
  if (!description || description.length > 1024) return false;
  return !XML_TAG_RE.test(description);
}

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

/**
 * Parse minimal YAML frontmatter (key: value pairs).
 */
export function parseFrontmatter(frontmatter: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of frontmatter.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------

/**
 * Load a single skill from a SKILL.md file.
 * Returns null if the file is invalid or cannot be read.
 */
export async function loadSkillFromFile(
  skillFile: string
): Promise<ProviderSkill | null> {
  let content: string;
  try {
    content = await fs.readFile(skillFile, "utf-8");
  } catch {
    return null;
  }

  if (!content.startsWith("---")) return null;

  const parts = content.split("---", 3);
  if (parts.length < 3) return null;

  const metadata = parseFrontmatter(parts[1]);
  const name = (metadata["name"] ?? "").trim();
  const description = (metadata["description"] ?? "").trim();
  const instructions = parts[2].trim();

  if (!isValidSkillName(name)) return null;
  if (!isValidSkillDescription(description)) return null;
  if (!instructions) return null;

  return { name, description, instructions };
}

/**
 * Recursively find all SKILL.md files under a directory.
 */
async function findSkillFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findSkillFiles(fullPath)));
    } else if (entry.name === "SKILL.md") {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Load all valid skills from a directory (recursively searches for SKILL.md files).
 */
export async function loadSkillsFromDirectory(
  dir: string
): Promise<ProviderSkill[]> {
  const skillFiles = await findSkillFiles(dir);
  const skills: ProviderSkill[] = [];
  for (const file of skillFiles) {
    const skill = await loadSkillFromFile(file);
    if (skill) skills.push(skill);
  }
  return skills;
}

// ---------------------------------------------------------------------------
// Directory resolution
// ---------------------------------------------------------------------------

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/**
 * Resolve the list of directories to search for SKILL.md files.
 *
 * Sources (in order):
 * 1. Explicitly provided directories
 * 2. `NODETOOL_AGENT_SKILL_DIRS` environment variable (path-separated)
 * 3. Well-known defaults: `./.claude/skills`, `~/.claude/skills`, `~/.codex/skills`
 */
export function resolveSkillDirs(explicitDirs: string[] = []): string[] {
  const resolved: string[] = [];

  for (const d of explicitDirs) {
    resolved.push(d.startsWith("~") ? d.replace("~", os.homedir()) : d);
  }

  const envDirs = process.env["NODETOOL_AGENT_SKILL_DIRS"];
  if (envDirs) {
    for (const d of envDirs.split(path.delimiter)) {
      const trimmed = d.trim();
      if (trimmed) {
        resolved.push(
          trimmed.startsWith("~")
            ? trimmed.replace("~", os.homedir())
            : trimmed
        );
      }
    }
  }

  resolved.push(
    path.join(process.cwd(), ".claude", "skills"),
    path.join(os.homedir(), ".claude", "skills"),
    path.join(os.homedir(), ".codex", "skills")
  );

  return dedupePreserveOrder(resolved);
}

// ---------------------------------------------------------------------------
// Discovery & resolution
// ---------------------------------------------------------------------------

/**
 * Discover all valid skills from a set of directories.
 * The first skill with a given name wins (earlier directories take priority).
 */
export async function discoverSkills(
  dirs?: string[]
): Promise<Map<string, ProviderSkill>> {
  const discovered = new Map<string, ProviderSkill>();
  const resolvedDirs = resolveSkillDirs(dirs);

  for (const dir of resolvedDirs) {
    try {
      await fs.access(dir);
    } catch {
      continue;
    }
    const skills = await loadSkillsFromDirectory(dir);
    for (const skill of skills) {
      if (!discovered.has(skill.name)) {
        discovered.set(skill.name, skill);
      }
    }
  }

  log.debug("Skills discovered", {
    count: discovered.size,
    names: [...discovered.keys()]
  });

  return discovered;
}

/**
 * Resolve which skills should be active.
 *
 * - If `requested` names are provided (or `NODETOOL_AGENT_SKILLS` env var),
 *   only those skills are returned.
 * - Otherwise, auto-matching selects skills whose description words overlap
 *   with the objective (can be disabled with `NODETOOL_AGENT_AUTO_SKILLS=0`).
 */
export function resolveActiveSkills(
  available: Map<string, ProviderSkill>,
  objective: string,
  requested?: string[]
): ProviderSkill[] {
  const envRequested = process.env["NODETOOL_AGENT_SKILLS"] ?? "";
  const envNames = envRequested
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const explicitNames = dedupePreserveOrder([
    ...(requested ?? []),
    ...envNames
  ]);

  if (explicitNames.length > 0) {
    const active: ProviderSkill[] = [];
    for (const name of explicitNames) {
      const skill = available.get(name);
      if (skill) active.push(skill);
    }
    return active;
  }

  const autoEnabled = !["0", "false", "no", "off"].includes(
    (process.env["NODETOOL_AGENT_AUTO_SKILLS"] ?? "1").toLowerCase()
  );
  if (!autoEnabled) return [];

  const objectiveWords = new Set(
    (objective.toLowerCase().match(SKILL_WORD_RE) ?? []).filter(
      (w) => w.length >= 4
    )
  );

  const active: ProviderSkill[] = [];
  for (const skill of available.values()) {
    const descWords = new Set(
      (skill.description.toLowerCase().match(SKILL_WORD_RE) ?? []).filter(
        (w) => w.length >= 4
      )
    );
    for (const w of descWords) {
      if (objectiveWords.has(w)) {
        active.push(skill);
        break;
      }
    }
  }

  return active;
}

/**
 * Build the system-prompt section for a set of active skills.
 * Returns null when there are no skills.
 */
export function buildSkillSystemPrompt(
  skills: ProviderSkill[]
): string | null {
  if (skills.length === 0) return null;
  const sections = [
    "# Skills",
    "Use these skill instructions when relevant:"
  ];
  for (const skill of skills) {
    sections.push(`\n## ${skill.name}\n${skill.instructions}`);
  }
  return sections.join("\n");
}
