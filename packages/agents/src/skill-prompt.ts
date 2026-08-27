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

/** The always-on catalog block: what exists, and how to read one in full. */
export function formatSkillCatalogForPrompt(
  skills: readonly SkillCatalogEntry[]
): string {
  if (skills.length === 0) return "";
  const lines = [
    "## Skills",
    "",
    "The user has these skills — saved instructions for a kind of work. The",
    "description says when a skill applies; call `load_skill` with its name to",
    "read the instructions before you act on it. A message that names one with",
    "a leading slash (`/name`) is asking for that skill.",
    ""
  ];
  for (const skill of skills) {
    lines.push(`- \`/${skill.name}\` — ${skill.description}`);
  }
  return lines.join("\n");
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
