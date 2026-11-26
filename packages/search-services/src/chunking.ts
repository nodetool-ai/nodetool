/**
 * Cut extracted text into passages for the index (D6). The index uses one
 * splitter: Markdown is cut at the block boundaries of `splitMarkdownBlocks`
 * from `protocol`, plain text at blank lines, and both are packed into
 * passages of about {@link PASSAGE_CHARS} characters.
 *
 * The default local embedding model truncates at 256 word pieces, so a
 * passage with its title prefix targets about 200 tokens, roughly 800
 * characters of English.
 */

import { splitMarkdownBlocks } from "@nodetool-ai/protocol";
import type { ExtractedChunk } from "./extract.js";

export const PASSAGE_CHARS = 800;
/** Characters repeated from the end of one passage at the start of the next. */
export const PASSAGE_OVERLAP_CHARS = 100;

interface Piece {
  text: string;
  start: number;
  headings: string[];
}

/** Hard-split one piece that is longer than a passage, at word boundaries. */
function splitLong(piece: Piece): Piece[] {
  if (piece.text.length <= PASSAGE_CHARS) return [piece];
  const out: Piece[] = [];
  let offset = 0;
  while (offset < piece.text.length) {
    let end = Math.min(offset + PASSAGE_CHARS, piece.text.length);
    if (end < piece.text.length) {
      const space = piece.text.lastIndexOf(" ", end);
      if (space > offset + PASSAGE_CHARS / 2) end = space;
    }
    out.push({ text: piece.text.slice(offset, end), start: piece.start + offset, headings: piece.headings });
    if (end >= piece.text.length) break;
    offset = Math.max(end - PASSAGE_OVERLAP_CHARS, offset + 1);
  }
  return out;
}

/** Pack consecutive pieces into passages, never across a heading change. */
function pack(pieces: readonly Piece[], extraLocator: Record<string, unknown> = {}): ExtractedChunk[] {
  const out: ExtractedChunk[] = [];
  let current: Piece | null = null;
  let end = 0;
  const flush = (): void => {
    if (!current || !current.text.trim()) return;
    const locator: Record<string, unknown> = { ...extraLocator, start: current.start, end };
    if (current.headings.length > 0) locator.headings = current.headings;
    out.push({ field: "body", text: current.text.trim(), locator });
  };
  for (const piece of pieces.flatMap(splitLong)) {
    const open: Piece | null = current;
    if (
      open !== null &&
      open.headings.join("\u0000") === piece.headings.join("\u0000") &&
      open.text.length + piece.text.length + 2 <= PASSAGE_CHARS
    ) {
      open.text = `${open.text}\n\n${piece.text}`;
    } else {
      flush();
      current = { ...piece };
    }
    end = piece.start + piece.text.length;
  }
  flush();
  return out;
}

/** Passages of plain text, cut at blank lines. Locators are character ranges. */
export function chunkPlainText(text: string, extraLocator?: Record<string, unknown>): ExtractedChunk[] {
  const pieces: Piece[] = [];
  const pattern = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g;
  for (const match of text.matchAll(pattern)) {
    if (match[0].trim()) pieces.push({ text: match[0], start: match.index ?? 0, headings: [] });
  }
  return pack(pieces, extraLocator);
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/**
 * Passages of Markdown, cut at blocks and never across a heading. Each
 * locator carries the character range and the heading path above it.
 */
export function chunkMarkdown(text: string): ExtractedChunk[] {
  const { leading, blocks } = splitMarkdownBlocks(text);
  const pieces: Piece[] = [];
  const headings: string[] = [];
  let offset = leading.length;
  for (const block of blocks) {
    if (block.kind === "heading") {
      const match = HEADING.exec(block.text.split("\n")[0] ?? "");
      if (match) {
        const level = match[1]!.length;
        headings.splice(level - 1);
        while (headings.length < level - 1) headings.push("");
        headings.push(match[2] ?? "");
      }
    }
    if (block.kind !== "front_matter" && block.text.trim()) {
      pieces.push({ text: block.text, start: offset, headings: headings.filter(Boolean) });
    }
    offset += block.text.length + block.gap.length;
  }
  return pack(pieces);
}

/** Passages of source code, by line. Locators are 1-based line ranges. */
export function chunkLines(text: string): ExtractedChunk[] {
  const lines = text.split("\n");
  const out: ExtractedChunk[] = [];
  let first = 0;
  while (first < lines.length) {
    let last = first;
    let size = lines[first]!.length;
    while (last + 1 < lines.length && size + lines[last + 1]!.length + 1 <= PASSAGE_CHARS) {
      last += 1;
      size += lines[last]!.length + 1;
    }
    const body = lines.slice(first, last + 1).join("\n");
    if (body.trim()) {
      out.push({
        field: "body",
        text: body.slice(0, PASSAGE_CHARS * 2),
        locator: { line_start: first + 1, line_end: last + 1 }
      });
    }
    first = last + 1;
  }
  return out;
}
