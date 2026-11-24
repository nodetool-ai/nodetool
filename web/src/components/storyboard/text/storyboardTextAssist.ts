/**
 * The selection assistant's request and reply, kept free of React and Lexical
 * so the wording the model sees is testable.
 *
 * The model always receives the whole board as Markdown and the entity
 * library, so it can weigh a passage against the brief, the scene and the
 * neighbouring shots. The selection is marked inside its lines with ⟦ and ⟧.
 */
import type { StoryboardMarkdownEntities } from "@nodetool-ai/protocol";

/** A selection described in board terms. */
export interface AssistSelection {
  /** "single": inside one value (a field, an action, a heading); "multi": across objects. */
  mode: "single" | "multi";
  /** The selected text, as Markdown. */
  text: string;
  /** The selected lines with the selection marked by ⟦ and ⟧. */
  marked: string;
  /** "Shot 3 · Motion", or "4 lines" for a multi-line selection. */
  scope: string;
  /** Scope of the first and last selected line. */
  from: string;
  to: string;
  /** The selection is a heading: a replacement must stay on one line. */
  heading: boolean;
}

export interface AssistRequest {
  markdown: string;
  entities: StoryboardMarkdownEntities;
  selection: AssistSelection;
  instruction: string;
}

export interface AssistReply {
  /** "replace": `text` replaces the selection; "note": `text` is an answer to read. */
  mode: "replace" | "note";
  text: string;
  why: string;
}

export const ASSIST_SYSTEM_PROMPT = [
  "You are the director's assistant inside NodeTool's storyboard editor. The director selected a passage of the storyboard and gave an instruction about it.",
  "Treat the passage as part of the whole film: weigh the brief, the act, the scene, the cast and the neighbouring shots.",
  "The storyboard is Markdown that maps onto NodeTool's storyboard document: # after the title is an act, ## is a scene, ### is a shot, the text under a shot heading is its action, and - **Label:** lines are fields.",
  "An entity is mentioned as [Name](entity://id). Keep every mention exactly, and mention a library entity this way when you add one.",
  "{#id} marks are object ids. Never change, add or remove one. A new shot is a ### heading without one.",
  "A replacement is inserted at the selection as Markdown, so write plain text unless the instruction asks for new lines, fields or shots.",
  "Keep the author's voice. Write in the language of the storyboard unless the instruction says otherwise.",
  "",
  "Reply in exactly this format and nothing else:",
  "<mode>replace</mode> or <mode>note</mode>",
  "<text>...</text>",
  "<why>one short sentence</why>"
].join("\n");

const libraryText = (entities: StoryboardMarkdownEntities): string =>
  [...entities.values()]
    .map((e) => `- ${e.name} (${e.kind}) entity://${e.id}: ${e.descriptor?.trim() || "no descriptor yet"}`)
    .join("\n") || "(none)";

/** The user turn of the first request. Follow-ups reuse the conversation. */
export function buildAssistPrompt({ markdown, entities, selection, instruction }: AssistRequest): string {
  const single = selection.mode === "single";
  const where = single
    ? `Location: ${selection.scope}\nThe selected line${selection.marked.includes("\n") ? "s" : ""}, with the selection between ⟦ and ⟧:\n${selection.marked}`
    : `The selection runs from "${selection.from}" to "${selection.to}".\nSelected Markdown:\n${selection.text}`;
  const rule = single
    ? 'Use mode "replace" when the instruction asks for a change to the passage. Then <text> holds only the replacement for the selected passage' +
      (selection.heading ? ", on one line" : "") +
      '. Use mode "note" when the instruction is a question or a check. Then <text> holds the answer in at most 120 words.'
    : 'The selection spans several objects, so always use mode "note". <text> holds the answer in at most 160 words.';
  return `${rule}\n\n## Entity library\n${libraryText(entities)}\n\n## Storyboard\n${markdown}\n\n## Selection\n${where}\n\n## Instruction\n${instruction.trim()}`;
}

/** Follow-up turn: refine the previous answer. */
export const buildFollowUp = (instruction: string): string => `Follow-up instruction: ${instruction.trim()}\nReply in the same format.`;

/** The content of the first `<tag>`, up to its closing tag or the end of a reply still streaming. */
function between(raw: string, tag: string): string | undefined {
  const lower = raw.toLowerCase();
  const open = lower.indexOf(`<${tag}>`);
  if (open < 0) {
    return undefined;
  }
  const from = open + tag.length + 2;
  const close = lower.indexOf(`</${tag}>`, from);
  return raw.slice(from, close < 0 ? undefined : close);
}

/**
 * Read a reply, also while it streams: a partial `<text>` is returned as far
 * as it got. A reply that ignored the format is shown as a note.
 */
export function parseAssistReply(raw: string, selection: Pick<AssistSelection, "mode">): AssistReply {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const mode = /<mode>\s*(replace|note)/i.exec(cleaned)?.[1]?.toLowerCase();
  const text = between(cleaned, "text");
  const why = between(cleaned, "why");
  const tagged = mode !== undefined || /^\s*<\w*$/.test(cleaned) || /^\s*<mode/i.test(cleaned);
  return {
    // Only a selection inside one value can be replaced.
    mode: mode === "replace" && selection.mode === "single" ? "replace" : "note",
    text: text !== undefined ? text.trim() : tagged ? "" : cleaned,
    why: why?.trim() ?? ""
  };
}
