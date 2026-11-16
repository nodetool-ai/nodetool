/**
 * Line-level helpers of the storyboard text editor, shared by the sync plugin
 * and the selection assistant. Each Lexical paragraph is one Markdown line.
 */
import { $createRangeSelection, $getRoot, $getSelection, $isRangeSelection, $setSelection, type RangeSelection } from "lexical";
import { STORYBOARD_MARKDOWN_ID, type StoryboardMarkdownResult } from "@nodetool-ai/protocol";

import { $isStoryboardLine, $lineOf, $lineOffset, $newLine, $setPoint, type StoryboardLineNode } from "./storyboardTextNodes";
import type { AssistSelection } from "./storyboardTextAssist";

export const RELOAD_TAG = "storyboard-text-reload";
export const ID_AFTER_CARET = new RegExp(`^\\s*\\{#${STORYBOARD_MARKDOWN_ID}\\}\\s*$`);
export const SHOT_REF = new RegExp(`\\[([^\\]\\n]*)\\]\\(#(${STORYBOARD_MARKDOWN_ID})\\)`, "g");

export const $lines = (): StoryboardLineNode[] => $getRoot().getChildren().filter($isStoryboardLine);
export const $loadText = (markdown: string): void => {
  const root = $getRoot();
  root.clear();
  root.append(...markdown.replace(/\n$/, "").split("\n").map($newLine));
};

/** The selection as Markdown, one line break per line. */
export function $selectedMarkdown(selection: RangeSelection): string {
  const [start, end] = selection.isBackward() ? [selection.focus, selection.anchor] : [selection.anchor, selection.focus];
  const a = $lineOf(start);
  const b = $lineOf(end);
  if (!a || !b) {
    return selection.getTextContent();
  }
  const from = $lineOffset(a, start);
  const to = $lineOffset(b, end);
  if (a.is(b)) {
    return a.getTextContent().slice(from, to);
  }
  const out = [a.getTextContent().slice(from)];
  for (let node = a.getNextSibling(); node && !node.is(b); node = node.getNextSibling()) {
    out.push(node.getTextContent());
  }
  out.push(b.getTextContent().slice(0, to));
  return out.join("\n");
}

export function $insertLines(text: string): void {
  text.split(/\r?\n/).forEach((part, i) => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    if (i > 0) {
      selection.insertParagraph();
    }
    const now = $getSelection();
    if (part && $isRangeSelection(now)) {
      now.insertText(part);
    }
  });
}


/** Where a selection sits, in line numbers and offsets, so it can be replaced after the popover closes. */
export interface LineRange {
  startLine: number;
  startOffset: number;
  endLine: number;
  endOffset: number;
}

/**
 * The current selection in board terms, or null when it selects nothing that
 * matters. The start never lies inside a line's syntax, and a single heading
 * stops before its `{#id}`. Lines that write the same value (a field and its
 * continuation lines) count as one selection.
 */
export function $locateSelection(result: StoryboardMarkdownResult): { range: LineRange; selection: AssistSelection } | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return null;
  }
  const lines = $lines();
  const texts = lines.map((line) => line.getTextContent());
  const [first, last] = selection.isBackward() ? [selection.focus, selection.anchor] : [selection.anchor, selection.focus];
  const a = $lineOf(first);
  const b = $lineOf(last);
  if (!a || !b) {
    return null;
  }
  let startLine = lines.findIndex((line) => line.is(a));
  let endLine = lines.findIndex((line) => line.is(b));
  let startOffset = $lineOffset(a, first);
  let endOffset = $lineOffset(b, last);
  if (startLine < 0 || endLine < 0) {
    return null;
  }
  // A selection that ends at the start of a line, or on blank lines, ends on the line before.
  while (endLine > startLine && (endOffset === 0 || !texts[endLine].trim())) {
    endLine -= 1;
    endOffset = texts[endLine].length;
  }
  while (startLine < endLine && (startOffset >= texts[startLine].length || !texts[startLine].trim())) {
    startLine += 1;
    startOffset = 0;
  }
  const startInfo = result.lines[startLine];
  const endInfo = result.lines[endLine];
  startOffset = Math.max(startOffset, Math.min(startInfo?.bodyStart ?? 0, texts[startLine].length));
  if (startLine === endLine) {
    if (startInfo?.bodyEnd !== undefined) {
      endOffset = Math.min(endOffset, startInfo.bodyEnd);
    }
    endOffset = Math.max(endOffset, startOffset);
  }
  const parts: string[] = [];
  const marked: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const from = i === startLine ? startOffset : 0;
    const to = i === endLine ? endOffset : texts[i].length;
    parts.push(texts[i].slice(from, to));
    let line = texts[i];
    if (i === endLine) {
      line = line.slice(0, endOffset) + "⟧" + line.slice(endOffset);
    }
    if (i === startLine) {
      line = line.slice(0, startOffset) + "⟦" + line.slice(startOffset);
    }
    marked.push(line);
  }
  const text = parts.join("\n");
  if (!text.trim()) {
    return null;
  }
  const group = startInfo?.group;
  const single = startLine === endLine || (!!group && result.lines.slice(startLine, endLine + 1).every((info) => info.group === group));
  return {
    range: { startLine, startOffset, endLine, endOffset },
    selection: {
      mode: single ? "single" : "multi",
      text,
      marked: marked.join("\n"),
      scope: single ? (startInfo?.scope ?? "") : "",
      from: startInfo?.scope ?? "",
      to: endInfo?.scope ?? "",
      heading: single && ["title", "act", "scene", "shot"].includes(startInfo?.role ?? "")
    }
  };
}

/**
 * Replace a located range with text, as one undo step. Returns false when the
 * text there changed since it was located, so a stale proposal never lands.
 */
export function $replaceRange(range: LineRange, expected: string, replacement: string, oneLine: boolean): boolean {
  const lines = $lines();
  const a = lines[range.startLine];
  const b = lines[range.endLine];
  if (!a || !b) {
    return false;
  }
  const selection = $createRangeSelection();
  $setPoint(selection.anchor, a, range.startOffset);
  $setPoint(selection.focus, b, range.endOffset);
  $setSelection(selection);
  if ($selectedMarkdown(selection) !== expected) {
    return false;
  }
  // A selection made with the mouse often takes a space at either end; the
  // replacement keeps it, so the passage does not run into its neighbours.
  const lead = /^\s*/.exec(expected)?.[0] ?? "";
  const trail = /\s*$/.exec(expected)?.[0] ?? "";
  const body = (oneLine ? replacement.replace(/\s*\n\s*/g, " ") : replacement).trim();
  selection.removeText();
  $insertLines(lead + body + trail);
  return true;
}
