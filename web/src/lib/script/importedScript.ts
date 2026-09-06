/**
 * What a script was imported from, and how each source becomes lines.
 *
 * Three sources reach step 1 (PRD § 9.1): a Final Draft file, a subtitle file,
 * and plain text — pasted, or extracted from a PDF or DOCX by the § 7.6 route.
 * The first two already say who speaks, so they become lines here with no model
 * in the loop; plain text names nobody, so its lines go to the writer for
 * attribution only (§ 9.2). Either way the words are the creator's and this
 * module is the only thing that produces them.
 *
 * The registry at the bottom holds the import for as long as the tab is open,
 * for the same reason the storyboard's does: nothing is rendered from it and no
 * other surface means anything different because of it, so writing it into the
 * document would give every reader a field to ignore.
 *
 * Pure but for the registry.
 */

import { splitImportedText } from "@nodetool-ai/protocol";

import type { FdxImport } from "../storyboard/parseFdx";
import type { SubtitleImport } from "./parseSrt";

/** One imported line, before it is given an id and put on the document. */
export interface ImportedLine {
  text: string;
  /** Empty when the source names nobody — the writer attributes it. */
  speakerName: string;
  direction?: string;
  targetDurationMs?: number;
}

export interface ImportedScript {
  lines: ImportedLine[];
  /** The cast the source names, in first-appearance order. */
  speakers: string[];
  /**
   * True when the source already says who speaks each line, so the writer has
   * nothing to ask a model and applies the import as it stands.
   */
  attributed: boolean;
  /** The source read back as plain text — what lands in the idea textarea. */
  text: string;
}

const dedupe = (names: readonly string[]): string[] =>
  Array.from(new Set(names.filter((name) => name !== "")));

/**
 * A Final Draft screenplay as script lines: one line per dialogue block,
 * spoken by the character the block names, with the parenthetical carried
 * across as the direction. Action paragraphs are not spoken, so they do not
 * become lines a voice would read out.
 */
export function importedFromFdx(parsed: FdxImport): ImportedScript {
  const lines: ImportedLine[] = [];
  for (const shot of parsed.shots) {
    if (shot.dialogue === undefined || shot.dialogue === "") continue;
    const rows = shot.dialogue.split("\n").filter((row) => row.trim() !== "");
    // `parseFdx` writes the block as character, parenthetical, then the spoken
    // rows — the order Final Draft itself types them in.
    let speakerName = "";
    let direction = "";
    let start = 0;
    if (rows.length > 1 && !rows[0].startsWith("(")) {
      speakerName = rows[0].trim();
      start = 1;
    }
    if (rows[start]?.startsWith("(")) {
      direction = rows[start].replace(/^\(|\)$/g, "").trim();
      start += 1;
    }
    const text = rows.slice(start).join(" ").trim();
    if (text === "") continue;
    const line: ImportedLine = { text, speakerName };
    if (direction !== "") {
      line.direction = direction;
    }
    lines.push(line);
  }
  return {
    lines,
    speakers: dedupe(lines.map((line) => line.speakerName)),
    attributed: true,
    text: lines.map((line) => line.text).join("\n")
  };
}

/** Subtitle cues as lines: the cue's words, its duration, one Narrator. */
export function importedFromSubtitles(parsed: SubtitleImport): ImportedScript {
  return {
    lines: parsed.lines.map((cue) => ({
      text: cue.text,
      speakerName: parsed.speakerName,
      targetDurationMs: cue.durationMs
    })),
    speakers: [parsed.speakerName],
    attributed: true,
    text: parsed.text
  };
}

/**
 * Pasted or extracted text as lines. Split only — nobody is named, so the
 * writer's attribution pass says who reads what and the words stay as they
 * were written (PRD § 9.7 criterion 4).
 */
export function importedFromText(text: string): ImportedScript {
  const split = splitImportedText(text);
  return {
    lines: split.map((line) => ({ text: line, speakerName: "" })),
    speakers: [],
    attributed: false,
    text: split.join("\n")
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

const imports = new Map<string, ImportedScript>();

/** Record what this script was imported from, replacing any earlier import. */
export function setScriptImport(
  scriptId: string,
  imported: ImportedScript
): void {
  imports.set(scriptId, imported);
}

export function getScriptImport(scriptId: string): ImportedScript | undefined {
  return imports.get(scriptId);
}

/** Forget a script's import — its tab closed, or the writer consumed it. */
export function clearScriptImport(scriptId: string): void {
  imports.delete(scriptId);
}
