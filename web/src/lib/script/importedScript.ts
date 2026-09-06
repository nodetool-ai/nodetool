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
 * The record lives on the document, under `setup.source`. It used to live in a
 * module-level Map, which held only as long as the tab: a reload kept the words
 * and lost the contract over them, so an FDX's speakers and a subtitle's cue
 * timings quietly became plain text on the next write (F3). The document is
 * where the rest of the flow's decisions already are (§ 6.4), the setup object
 * passes unknown keys through, and a client that does not know the field leaves
 * it untouched.
 *
 * The source is not the brief. The brief says what to write; the source is the
 * words that must survive writing. Keeping them apart is what lets a creator
 * add a note for the attribution pass without rewording their own script, and
 * what makes replacing a source an explicit act rather than a side effect of
 * typing (F3).
 *
 * Pure.
 */

import { splitImportedText } from "@nodetool-ai/protocol";
import type { ScriptSetup } from "@nodetool-ai/protocol/api-schemas/scripts.js";

import { parseFdx, type FdxImport } from "../storyboard/parseFdx";
import { parseSrt, type SubtitleImport } from "./parseSrt";

/** One imported line, before it is given an id and put on the document. */
export interface ImportedLine {
  text: string;
  /** Empty when the source names nobody — the writer attributes it. */
  speakerName: string;
  direction?: string;
  targetDurationMs?: number;
}

/** Where the words came from. Each kind carries different structure. */
export type ScriptSourceKind = "text" | "fdx" | "subtitles";

/** What the flow promises to do with the words it was given. */
export type ScriptPreservation = "verbatim";

export interface ImportedScript {
  kind: ScriptSourceKind;
  /**
   * The promise over these words. Every import is `verbatim`: the writer may
   * split them and say who reads them, and may not reword them.
   */
  preserve: ScriptPreservation;
  lines: ImportedLine[];
  /** The cast the source names, in first-appearance order. */
  speakers: string[];
  /**
   * True when the source already says who speaks each line, so the writer has
   * nothing to ask a model and applies the import as it stands.
   */
  attributed: boolean;
  /** The source read back as plain text — what the idea step shows. */
  text: string;
  /** What the creator imported, for the line that names it. */
  label: string;
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
    kind: "fdx",
    preserve: "verbatim",
    lines,
    speakers: dedupe(lines.map((line) => line.speakerName)),
    attributed: true,
    text: lines.map((line) => line.text).join("\n"),
    label: "Final Draft screenplay"
  };
}

/** Subtitle cues as lines: the cue's words, its duration, one Narrator. */
export function importedFromSubtitles(parsed: SubtitleImport): ImportedScript {
  return {
    kind: "subtitles",
    preserve: "verbatim",
    lines: parsed.lines.map((cue) => ({
      text: cue.text,
      speakerName: parsed.speakerName,
      targetDurationMs: cue.durationMs
    })),
    speakers: [parsed.speakerName],
    attributed: true,
    text: parsed.text,
    label: "Subtitles, with their cue timings"
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
    kind: "text",
    preserve: "verbatim",
    lines: split.map((line) => ({ text: line, speakerName: "" })),
    speakers: [],
    attributed: false,
    text: split.join("\n"),
    label: "Your own text"
  };
}

/**
 * A handed-over script file as a source, chosen by its name. One rule for every
 * caller: the step-1 picker, and a file the project composer carries into a new
 * script. A screenplay arrives with its speakers and a subtitle file with its
 * cue timings — neither is flattened to plain text on the way in (F3, F4).
 *
 * Throws what the parsers throw for a file that is not what its name claims.
 */
export function importedFromFile(
  fileName: string,
  text: string
): ImportedScript {
  const name = fileName.toLowerCase();
  if (name.endsWith(".fdx")) {
    return importedFromFdx(parseFdx(text));
  }
  if (name.endsWith(".srt") || name.endsWith(".vtt")) {
    return importedFromSubtitles(parseSrt(text));
  }
  return importedFromText(text);
}

// ── The record on the document ──────────────────────────────────────────────

/** The `setup` key the source is written under. */
const SOURCE_FIELD = "source";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const readLine = (value: unknown): ImportedLine | null => {
  if (!isRecord(value) || typeof value.text !== "string") {
    return null;
  }
  const line: ImportedLine = {
    text: value.text,
    speakerName: asString(value.speakerName)
  };
  if (typeof value.direction === "string" && value.direction !== "") {
    line.direction = value.direction;
  }
  if (typeof value.targetDurationMs === "number") {
    line.targetDurationMs = value.targetDurationMs;
  }
  return line;
};

const KINDS: readonly ScriptSourceKind[] = ["text", "fdx", "subtitles"];

/**
 * The source a script was imported from, or null. Read defensively: the record
 * round-trips through the server as an unknown key on `setup`, so anything that
 * is not a source reads as no source rather than as a broken one.
 */
export function readScriptSource(
  setup: ScriptSetup | null | undefined
): ImportedScript | null {
  const raw = setup?.[SOURCE_FIELD];
  if (!isRecord(raw)) {
    return null;
  }
  const kind = KINDS.find((candidate) => candidate === raw.kind);
  if (kind === undefined || !Array.isArray(raw.lines)) {
    return null;
  }
  const lines = raw.lines
    .map(readLine)
    .filter((line): line is ImportedLine => line !== null);
  if (lines.length === 0) {
    return null;
  }
  const speakers = Array.isArray(raw.speakers)
    ? raw.speakers.filter((name): name is string => typeof name === "string")
    : [];
  return {
    kind,
    preserve: "verbatim",
    lines,
    speakers,
    attributed: raw.attributed === true,
    text:
      typeof raw.text === "string"
        ? raw.text
        : lines.map((line) => line.text).join("\n"),
    label: asString(raw.label) || "Your own text"
  };
}

/**
 * The setup patch that records a source, or drops the one that is there.
 * Replacing a source is always this call, never a keystroke.
 */
export function scriptSourcePatch(
  source: ImportedScript | null
): Partial<ScriptSetup> {
  return { [SOURCE_FIELD]: source ?? undefined };
}

/**
 * What the writer's inputs were when this source was last handed to it. Two
 * sources with the same words and the same structure are the same source, so
 * the signature is the text plus what was said about it.
 */
export function scriptSourceSignature(
  source: ImportedScript | null
): string | undefined {
  return source === null
    ? undefined
    : `${source.kind}:${source.lines.length}:${source.text}`;
}
