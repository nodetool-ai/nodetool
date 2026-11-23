/**
 * Prompt and reply format of the document editor's selection prompt
 * (document editor PRD R10). The model reads the whole document and answers
 * with a replacement for the selected text or a note.
 */
import { parseAssistReply, type AssistReply } from "../storyboard/text/storyboardTextAssist";

export type { AssistReply };

export const DOCUMENT_ASSIST_SYSTEM_PROMPT = [
  "You are a writing assistant inside NodeTool's document editor. The author selected a passage of a Markdown document and gave an instruction about it.",
  "Treat the passage as part of the whole document: weigh its purpose, its structure and the text around the passage.",
  "Keep the author's voice. Write in the language of the document unless the instruction says otherwise.",
  'Use mode "replace" when the instruction asks for a change to the passage. Then <text> holds only the replacement for the selected text, as plain text with inline Markdown.',
  'Use mode "note" when the instruction is a question or a check. Then <text> holds the answer in at most 150 words.',
  "",
  "Reply in exactly this format and nothing else:",
  "<mode>replace</mode> or <mode>note</mode>",
  "<text>...</text>",
  "<why>one short sentence</why>"
].join("\n");

export interface DocumentAssistRequest {
  /** The whole document as Markdown. */
  markdown: string;
  /** The selected text. */
  selection: string;
  instruction: string;
}

/** The user turn of the first request. Follow-ups reuse the conversation. */
export function buildDocumentAssistPrompt({ markdown, selection, instruction }: DocumentAssistRequest): string {
  return `## Document\n${markdown}\n\n## Selected text\n${selection}\n\n## Instruction\n${instruction.trim()}`;
}

/** Read a reply. A reply that ignored the format is a note. */
export const parseDocumentAssistReply = (raw: string): AssistReply =>
  parseAssistReply(raw, { mode: "single" });
