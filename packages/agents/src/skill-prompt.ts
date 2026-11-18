/**
 * Rendering skills into a chat turn's prompt.
 *
 * Two tiers, the same shape the sandbox packs use. The **catalog** — one line
 * per skill, name and description — is always in context, so the agent knows
 * what exists without a tool call. The **body** costs a `load_skill` call, or
 * arrives for free when the user typed `/<name>`: naming a skill is asking for
 * it, so the turn should not spend a round trip re-fetching what was named.
 *
 * String in, string out — the host reads the rows and calls these.
 */

/** One skill as the catalog knows it. */
export interface SkillCatalogEntry {
  name: string;
  description: string;
  /** A skill that ships with NodeTool, as opposed to one the user wrote. */
  system?: boolean;
  /** A shipped skill the always-on catalog lists. */
  featured?: boolean;
}

/** One skill in full. */
export interface SkillInstructions extends SkillCatalogEntry {
  content: string;
}

/**
 * A `/name` the user typed: at the start of the text or after whitespace, so a
 * path (`src/utils`) and a closing `</tag>` are not skill invocations.
 */
const SLASH_COMMAND_RE = /(?:^|\s)\/([a-z0-9][a-z0-9-]{0,63})\b/g;

/** Skill names the text invokes with a leading slash, in order, deduped. */
export function findInvokedSkillNames(
  text: string,
  available: readonly string[]
): string[] {
  const known = new Set(available.map((name) => name.toLowerCase()));
  const found: string[] = [];
  for (const match of text.toLowerCase().matchAll(SLASH_COMMAND_RE)) {
    const name = match[1];
    if (known.has(name) && !found.includes(name)) found.push(name);
  }
  return found;
}

/** Longest catalog line; the full description is one `load_skill` away. */
const CATALOG_LINE_MAX = 80;

/** A clause break that ends the catalog line when enough precedes it. */
const CLAUSE_BREAKS = [": ", " — ", " ("];
const CLAUSE_MIN = 24;

/**
 * What a skill is for, in one short line: the description's first sentence,
 * cut at its first clause break (the list after a colon, an aside in
 * parentheses) and capped at a word boundary. The catalog only has to say
 * when a skill applies; the detail arrives with the body.
 */
export function catalogLine(description: string): string {
  const text = description.trim().replace(/\s+/g, " ");
  const end = text.search(/[.!?](\s|$)/);
  let line = end >= 0 ? text.slice(0, end) : text;
  for (const separator of CLAUSE_BREAKS) {
    const at = line.indexOf(separator);
    if (at >= CLAUSE_MIN) {
      line = line.slice(0, at);
      break;
    }
  }
  if (line.length <= CATALOG_LINE_MAX) return line;
  const cut = line.slice(0, CATALOG_LINE_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[,;]$/, "")}…`;
}

/** Code-point order, so the catalog never depends on locale or row order. */
function byName(a: SkillCatalogEntry, b: SkillCatalogEntry): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * The always-on catalog block: what exists, and how to read one in full.
 *
 * It lists the user's own skills and the featured shipped ones, sorted by
 * name, so a given set of skills renders the same bytes whatever order the
 * rows arrive in. It sits in the system message, which a local model's prefix
 * cache reuses only when it is byte-identical, so it carries no counts. The
 * other shipped skills are found with `list_skills`.
 */
export function formatSkillCatalogForPrompt(
  skills: readonly SkillCatalogEntry[]
): string {
  if (skills.length === 0) return "";
  const listed = skills
    .filter((skill) => !skill.system || skill.featured)
    .sort(byName);
  const lines = [
    "## Skills",
    "Call `load_skill` with a skill's name before work of that kind. A",
    "message that names one as `/name` asks for it.",
    ""
  ];
  for (const skill of listed) {
    lines.push(`- \`/${skill.name}\`: ${catalogLine(skill.description)}`);
  }
  if (listed.length < skills.length) {
    lines.push(
      "",
      "Find the other shipped skills with `list_skills({query})`: brief shapes",
      "for commercials, trailers, explainers and films, a prompting guide per",
      "model line, an `api-*` reference per `nodetool.*` namespace, motion craft",
      "references and the native game field reference."
    );
  }
  return lines.join("\n");
}

/**
 * The user's own skills, for the turn context: one line each, sorted by name.
 * The system message's catalog already says how to load a skill and what
 * `/name` means, so this block carries no preamble. Empty when the user has
 * none.
 */
export function formatUserSkillsForPrompt(
  skills: readonly SkillCatalogEntry[]
): string {
  const own = skills.filter((skill) => !skill.system).sort(byName);
  if (own.length === 0) return "";
  return [
    "## The user's skills",
    ...own.map((skill) => `- \`/${skill.name}\`: ${catalogLine(skill.description)}`)
  ].join("\n");
}

/** The bodies of the skills this turn named, already loaded. */
export function formatInvokedSkillsForPrompt(
  skills: readonly SkillInstructions[]
): string {
  if (skills.length === 0) return "";
  const lines = [
    "## Skill instructions",
    "",
    "The user's message names these skills. Follow them for this turn.",
    ""
  ];
  for (const skill of skills) {
    lines.push(`### /${skill.name}`, "", skill.content.trim(), "");
  }
  return lines.join("\n");
}
