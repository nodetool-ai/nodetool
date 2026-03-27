/**
 * Frontend tools for the text/code editor assistant.
 *
 * These tools are always registered but only functional when an editor is
 * active. useChatIntegration calls setEditorAdapter() on mount/unmount.
 */
import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";

export interface EditorAdapter {
  /** Returns the full document content */
  getContent: () => string;
  /** Returns the currently selected text (empty string if nothing selected) */
  getSelection: () => string;
  /** Replaces the entire document with new content */
  replaceAll: (text: string) => void;
  /** Replaces the current selection; falls back to replaceAll if no selection */
  replaceSelection: (text: string) => void;
  /** Inserts text at the current cursor position */
  insert: (text: string) => void;
  /** Human-readable language label, e.g. "javascript" */
  language: string;
}

let activeAdapter: EditorAdapter | null = null;

export function setEditorAdapter(adapter: EditorAdapter | null) {
  activeAdapter = adapter;
}

function requireAdapter(): EditorAdapter {
  if (!activeAdapter) {
    throw new Error("No editor is currently open.");
  }
  return activeAdapter;
}

// ── tool: get the full document ───────────────────────────────────────────────

FrontendToolRegistry.register({
  name: "ui_editor_get_content",
  description:
    "Read the full content of the currently open editor document. " +
    "Use this before making edits to understand what is already there.",
  parameters: z.object({}),
  async execute(_args, _ctx) {
    const adapter = requireAdapter();
    return { content: adapter.getContent(), language: adapter.language };
  }
});

// ── tool: get selected text ───────────────────────────────────────────────────

FrontendToolRegistry.register({
  name: "ui_editor_get_selection",
  description:
    "Read the text that the user has selected in the editor. " +
    "Returns an empty string if nothing is selected.",
  parameters: z.object({}),
  async execute(_args, _ctx) {
    const adapter = requireAdapter();
    return { selection: adapter.getSelection() };
  }
});

// ── tool: replace entire document ─────────────────────────────────────────────

FrontendToolRegistry.register({
  name: "ui_editor_replace_all",
  description:
    "Replace the entire content of the editor with new text. " +
    "Use this when you want to rewrite the whole document, e.g. after a refactor.",
  parameters: z.object({
    content: z.string().describe("The new full content to write into the editor.")
  }),
  async execute({ content }, _ctx) {
    const adapter = requireAdapter();
    adapter.replaceAll(content);
    return { ok: true, chars: content.length };
  }
});

// ── tool: replace selection ───────────────────────────────────────────────────

FrontendToolRegistry.register({
  name: "ui_editor_replace_selection",
  description:
    "Replace the currently selected text in the editor with new text. " +
    "If nothing is selected, the text is inserted at the cursor position. " +
    "Prefer this over ui_editor_replace_all when you only want to change part of the document.",
  parameters: z.object({
    text: z.string().describe("The replacement text.")
  }),
  async execute({ text }, _ctx) {
    const adapter = requireAdapter();
    const hadSelection = !!adapter.getSelection().trim();
    if (hadSelection) {
      adapter.replaceSelection(text);
    } else {
      adapter.insert(text);
    }
    return { ok: true, replaced_selection: hadSelection };
  }
});

// ── tool: insert at cursor ────────────────────────────────────────────────────

FrontendToolRegistry.register({
  name: "ui_editor_insert",
  description:
    "Insert text at the current cursor position without replacing anything. " +
    "Use this to append snippets, add imports, or inject boilerplate.",
  parameters: z.object({
    text: z.string().describe("The text to insert at the cursor position.")
  }),
  async execute({ text }, _ctx) {
    const adapter = requireAdapter();
    adapter.insert(text);
    return { ok: true, chars: text.length };
  }
});
