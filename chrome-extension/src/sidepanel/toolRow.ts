/**
 * Presentation rules for one tool call row.
 *
 * `execute_code` is the CodeAct action primitive: its one interesting argument
 * is a JavaScript program, so the row lifts `code` (and the LLM's `title`) out
 * of the argument bag and renders the program as a code block instead of a
 * JSON-escaped string. Mirrors `web/src/components/chat/message/MessageView.tsx`.
 */

export const EXECUTE_CODE_TOOL_NAME = "execute_code";

export interface ToolRowView {
  /** Chip label: the LLM's own title when it gave one. */
  label: string;
  /** JavaScript program to show as code, when this is a code action. */
  code: string | null;
  /** Arguments left after the lifted keys are removed, or undefined. */
  args: unknown;
}

function pickString(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/** Strip a common leading indent so a nested program reads flush left. */
export function dedentCode(code: string): string {
  const lines = code.replace(/\r\n?/g, "\n").replace(/\t/g, "  ").split("\n");
  while (lines.length > 0 && !lines[0]?.trim()) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1]?.trim()) lines.pop();
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^ */)?.[0].length ?? 0);
  const pad = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(pad)).join("\n");
}

export function toolRowView(row: {
  name: string;
  args?: unknown;
  message?: string;
}): ToolRowView {
  const bag =
    row.args && typeof row.args === "object" && !Array.isArray(row.args)
      ? (row.args as Record<string, unknown>)
      : null;

  if (row.name !== EXECUTE_CODE_TOOL_NAME || !bag) {
    return { label: row.name, code: null, args: row.args };
  }

  const code = pickString(bag, "code");
  const title = pickString(bag, "title");
  const rest = { ...bag };
  delete rest.code;
  delete rest.title;

  return {
    label: title ?? row.message ?? row.name,
    code: code ? dedentCode(code) : null,
    args: Object.keys(rest).length > 0 ? rest : undefined
  };
}
