/**
 * Skills + Fonts routers — migrated from REST `/api/skills` and `/api/fonts`.
 *
 * Both procedures are GET-only, filesystem-backed listings with no streaming
 * or long-running semantics, so they move to tRPC cleanly.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, extname, basename, delimiter } from "node:path";
import { homedir, platform } from "node:os";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  listOutput as skillsListOutput,
  type SkillInfo
} from "@nodetool/protocol/api-schemas/skills.js";
import { listOutput as fontsListOutput } from "@nodetool/protocol/api-schemas/fonts.js";

// ── Skill listing helpers (ported from legacy skills-api.ts) ──────

function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const frontmatter: Record<string, string> = {};
  let body = content;

  if (content.startsWith("---\n") || content.startsWith("---\r\n")) {
    const endIdx = content.indexOf("\n---", 3);
    if (endIdx !== -1) {
      const fmBlock = content.slice(content.indexOf("\n") + 1, endIdx);
      for (const line of fmBlock.split("\n")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();
          if (key && value) frontmatter[key] = value;
        }
      }
      body = content.slice(endIdx + 4).trim();
    }
  }

  return { frontmatter, body };
}

function firstParagraph(text: string): string | null {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) return trimmed;
  }
  return null;
}

const NAME_RE = /^[a-z0-9-]+$/;

function isValidSkillName(name: string): boolean {
  if (name.length > 64) return false;
  if (!NAME_RE.test(name)) return false;
  if (name.includes("anthropic") || name.includes("claude")) return false;
  return true;
}

function collectSkillDirs(): string[] {
  const skillDirs: string[] = [];
  const envDirs = process.env.NODETOOL_AGENT_SKILL_DIRS;
  if (envDirs) {
    for (const d of envDirs.split(delimiter)) {
      if (d.trim()) skillDirs.push(d.trim());
    }
  }
  skillDirs.push(join(process.cwd(), ".claude", "skills"));
  skillDirs.push(join(homedir(), ".claude", "skills"));
  skillDirs.push(join(homedir(), ".codex", "skills"));

  const seen = new Set<string>();
  const uniqueDirs: string[] = [];
  for (const d of skillDirs) {
    if (!seen.has(d)) {
      seen.add(d);
      uniqueDirs.push(d);
    }
  }
  return uniqueDirs;
}

function readSkillsFromDirs(dirs: string[]): SkillInfo[] {
  const skills: SkillInfo[] = [];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir) as unknown as string[];
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (extname(entry).toLowerCase() !== ".md") continue;
      const filePath = join(dir, entry);
      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      const { frontmatter, body } = parseFrontmatter(content);
      const name = frontmatter.name ?? basename(entry, ".md");
      if (!isValidSkillName(name)) continue;

      const description = frontmatter.description ?? firstParagraph(body);
      skills.push({
        name,
        description: description || null,
        path: filePath,
        instructions: body || null
      });
    }
  }

  return skills;
}

// ── Font listing helpers ──────────────────────────────────────────

function collectFonts(): string[] {
  const fonts: string[] = [];
  const os = platform();

  if (os === "darwin") {
    const fontDirs = [
      "/Library/Fonts",
      "/System/Library/Fonts",
      join(homedir(), "Library", "Fonts")
    ];
    for (const dir of fontDirs) {
      if (!existsSync(dir)) continue;
      try {
        for (const entry of readdirSync(dir) as unknown as string[]) {
          const ext = extname(entry).toLowerCase();
          if ([".ttf", ".otf", ".ttc", ".dfont"].includes(ext)) {
            fonts.push(basename(entry, ext));
          }
        }
      } catch {
        /* skip */
      }
    }
  } else if (os === "win32") {
    const fontDir = join(process.env["WINDIR"] ?? "C:\\Windows", "Fonts");
    if (existsSync(fontDir)) {
      try {
        for (const entry of readdirSync(fontDir) as unknown as string[]) {
          const ext = extname(entry).toLowerCase();
          if ([".ttf", ".otf", ".ttc"].includes(ext)) {
            fonts.push(basename(entry, ext));
          }
        }
      } catch {
        /* skip */
      }
    }
  } else {
    const fontDirs = [
      "/usr/share/fonts",
      "/usr/local/share/fonts",
      join(homedir(), ".fonts")
    ];
    for (const dir of fontDirs) {
      if (!existsSync(dir)) continue;
      try {
        const entries = readdirSync(dir, { recursive: true });
        for (const entry of entries) {
          const entryStr =
            typeof entry === "string" ? entry : entry.toString();
          const ext = extname(entryStr).toLowerCase();
          if ([".ttf", ".otf"].includes(ext)) {
            fonts.push(basename(entryStr, ext));
          }
        }
      } catch {
        /* skip */
      }
    }
  }

  return Array.from(new Set(fonts)).sort();
}

// ── Routers ───────────────────────────────────────────────────────

export const skillsRouter = router({
  list: protectedProcedure.output(skillsListOutput).query(async () => {
    const skills = readSkillsFromDirs(collectSkillDirs());
    return { count: skills.length, skills };
  })
});

export const fontsRouter = router({
  list: protectedProcedure.output(fontsListOutput).query(async () => {
    return { fonts: collectFonts() };
  })
});
