/**
 * Template-variable parsing for the text editor.
 *
 * Two token syntaxes are recognised:
 *  - "double": `{{ name }}` — always treated as a variable.
 *  - "single": `{name}` — only treated as a variable in prose languages
 *    (plaintext / markdown). In real code languages a lone brace is almost
 *    always syntax, not a placeholder, so single-brace matching is opt-in.
 */

export type VariableSyntax = "double" | "single";

export interface TemplateVariableMatch {
  name: string;
  syntax: VariableSyntax;
  /** Character offset of the first brace in the source. */
  start: number;
  /** Character offset just past the closing brace. */
  end: number;
}

export interface TemplateVariable {
  name: string;
  syntax: VariableSyntax;
  /** Number of times the variable appears in the source. */
  count: number;
}

// `{{ name }}` then `{ name }`. Identifiers are conventional: a leading letter
// or underscore followed by word characters.
const DOUBLE_RE = /\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g;
const SINGLE_RE = /\{\s*([a-zA-Z_][\w]*)\s*\}/g;

const PROSE_LANGUAGES = new Set(["", "plaintext", "text", "markdown", "md"]);

/** Whether single-brace `{name}` tokens should count as variables for a language. */
export const allowsSingleBraceVariables = (language?: string): boolean =>
  PROSE_LANGUAGES.has((language ?? "").toLowerCase());

/**
 * Find every variable occurrence with its source offsets, in document order.
 * Double-brace matches take precedence so the inner single-brace pattern never
 * double-counts a `{{ name }}`.
 */
export const findTemplateVariables = (
  text: string,
  includeSingle: boolean
): TemplateVariableMatch[] => {
  const matches: TemplateVariableMatch[] = [];
  const consumed: Array<[number, number]> = [];

  DOUBLE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DOUBLE_RE.exec(text)) !== null) {
    matches.push({
      name: m[1],
      syntax: "double",
      start: m.index,
      end: m.index + m[0].length
    });
    consumed.push([m.index, m.index + m[0].length]);
  }

  if (includeSingle) {
    SINGLE_RE.lastIndex = 0;
    while ((m = SINGLE_RE.exec(text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      const overlaps = consumed.some(([s, e]) => start >= s && start < e);
      if (!overlaps) {
        matches.push({ name: m[1], syntax: "single", start, end });
      }
    }
  }

  return matches.sort((a, b) => a.start - b.start);
};

/**
 * Collapse occurrences into the unique variables that appear, preserving
 * first-appearance order. A name's syntax is the one of its first occurrence.
 */
export const uniqueTemplateVariables = (
  text: string,
  includeSingle: boolean
): TemplateVariable[] => {
  const order: string[] = [];
  const byName = new Map<string, TemplateVariable>();
  for (const match of findTemplateVariables(text, includeSingle)) {
    const existing = byName.get(match.name);
    if (existing) {
      existing.count += 1;
    } else {
      order.push(match.name);
      byName.set(match.name, {
        name: match.name,
        syntax: match.syntax,
        count: 1
      });
    }
  }
  return order.map((name) => byName.get(name) as TemplateVariable);
};

/** Render the token a variable name inserts into the document. */
export const formatVariableToken = (
  name: string,
  syntax: VariableSyntax = "double"
): string => (syntax === "single" ? `{${name}}` : `{{ ${name} }}`);
