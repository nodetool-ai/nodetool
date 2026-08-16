/**
 * SKILL.md parsing — frontmatter, body, and the body's `##` sections.
 *
 * The format is the agent skill format, and this is the parser the agent
 * package has always used, moved down the dependency order so sandbox package
 * discovery (node-sdk) can read a pack's SKILL.md with exactly the same rules
 * the skill system applies. It is string in, data out — no filesystem, no
 * environment — so protocol is the lowest layer it fits in.
 */

const INVALID_SKILL_NAME_RE = /[^a-z0-9-]/;
const XML_TAG_RE = /<[^>]+>/;
const SKILL_RESERVED_TERMS = ["anthropic", "claude"];
/**
 * `## ` heading text, or `null` for any other line.
 *
 * Deliberately not a regex. The pattern this replaces —
 * `/^##\s+(.+?)\s*$/` — put `\s+`, a lazy `.+?` and `\s*$` next to each
 * other, which backtracks polynomially on a heading followed by a long run of
 * spaces (CodeQL alert 311). SKILL.md bodies are third-party text, so the scan
 * is a single linear pass instead: match the marker, require one whitespace
 * after it, trim the rest.
 */
function sectionHeading(line: string): string | null {
  if (!line.startsWith("##")) return null;
  const rest = line.slice(2);
  const first = rest.charAt(0);
  if (first !== " " && first !== "\t") return null;
  const text = rest.trim();
  return text.length > 0 ? text : null;
}

/** A parsed SKILL.md: its frontmatter identity and its instruction body. */
export interface SkillDocument {
  name: string;
  description: string;
  instructions: string;
}

/** Parse minimal YAML frontmatter (key: value pairs). */
export function parseFrontmatter(frontmatter: string) {
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

/** A skill name is a short lowercase slug that does not claim a vendor. */
export function isValidSkillName(name: string): boolean {
  if (!name || name.length > 64) return false;
  if (INVALID_SKILL_NAME_RE.test(name)) return false;
  const lowered = name.toLowerCase();
  return !SKILL_RESERVED_TERMS.some((term) => lowered.includes(term));
}

/** A skill description is one bounded line with no markup in it. */
export function isValidSkillDescription(description: string): boolean {
  if (!description || description.length > 1024) return false;
  return !XML_TAG_RE.test(description);
}

/**
 * Parse a SKILL.md source into its document, or `null` when the frontmatter,
 * name, description or body does not hold up.
 */
export function parseSkillDocument(source: string): SkillDocument | null {
  if (!source.startsWith("---")) return null;

  // Frontmatter is delimited by the first two `---` fences. Rejoin everything
  // after the second fence so a `---` horizontal rule inside the body is
  // preserved rather than truncated (a limited `split` would discard the tail).
  const parts = source.split("---");
  if (parts.length < 3) return null;

  const metadata = parseFrontmatter(parts[1] ?? "");
  const name = (metadata["name"] ?? "").trim();
  const description = (metadata["description"] ?? "").trim();
  const instructions = parts.slice(2).join("---").trim();

  if (!isValidSkillName(name)) return null;
  if (!isValidSkillDescription(description)) return null;
  if (!instructions) return null;

  return { name, description, instructions };
}

/**
 * Split an instruction body on its `##` headings.
 *
 * A pack that exposes several modules documents them as one section each; the
 * keys are the heading text lowercased, so a lookup by specifier, by module
 * name, or by whatever the author wrote all land on the same entry. Text
 * before the first heading belongs to no section and is only part of the body.
 */
export function skillSections(instructions: string) {
  const sections: Record<string, string> = {};
  let heading: string | undefined;
  let lines: string[] = [];
  const flush = (): void => {
    if (heading === undefined) return;
    const body = lines.join("\n").trim();
    if (body) sections[heading] = body;
  };
  for (const line of instructions.split("\n")) {
    const found = sectionHeading(line);
    if (found === null) {
      lines.push(line);
      continue;
    }
    flush();
    heading = found.toLowerCase();
    lines = [];
  }
  flush();
  return sections;
}
