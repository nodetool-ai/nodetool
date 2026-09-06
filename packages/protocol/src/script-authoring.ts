/**
 * @nodetool-ai/protocol — Script authoring rules
 *
 * What the script writer asks a model for, and how its answer becomes cast and
 * lines: the formats, the pace table, the system prompt, the prompt shaping,
 * the JSON schema the structured call is forced into, and the parse that mints
 * or retains line ids.
 *
 * Imported words take a different path on purpose (PRD § 9.2, criterion 4).
 * {@link splitImportedText} cuts pasted or extracted text into lines with no
 * model in the loop, and the attribution call is handed a schema with no field
 * to write text into — {@link applyAttribution} reads every line's text from
 * the split, never from the answer. A model that ignores the schema and returns
 * its own prose therefore cannot rewrite the creator's words; the worst it can
 * do is misattribute them.
 *
 * Pure, and shared: the browser's `writeScript` and the headless `write_script`
 * capability author through this, so a script written in the flow and one
 * written by an agent are the same artifact.
 */

import { isRecord, isString } from "./predicates.js";

// ── Formats ─────────────────────────────────────────────────────────────────

/** How many named voices a format expects, which is what shapes the cast. */
export type ScriptCastShape = "narrator" | "characters" | "host-and-guest";

export interface ScriptFormat {
  id: string;
  /** Card title, e.g. "Voiceover narration". */
  label: string;
  /** One line under the title on the format card (PRD § 9.2). */
  description: string;
  castShape: ScriptCastShape;
  /** The speakers the writer starts from. One entry means one voice. */
  speakers: readonly string[];
  /** The section layout this format lays its lines into. */
  sections: readonly string[];
}

/** The five § 9.2 formats. Order is the order the cards are shown in. */
export const SCRIPT_FORMATS: readonly ScriptFormat[] = [
  {
    id: "voiceover",
    label: "Voiceover narration",
    description: "One voice reads over picture.",
    castShape: "narrator",
    speakers: ["Narrator"],
    sections: ["Open", "Body", "Close"]
  },
  {
    id: "dialogue",
    label: "Dialogue",
    description: "Two or more characters talk to each other.",
    castShape: "characters",
    speakers: ["Character A", "Character B"],
    sections: ["Scene"]
  },
  {
    id: "interview",
    label: "Interview",
    description: "A host asks, a guest answers.",
    castShape: "host-and-guest",
    speakers: ["Host", "Guest"],
    sections: ["Intro", "Questions", "Outro"]
  },
  {
    id: "ad-read",
    label: "Ad read",
    description: "One voice sells something in a set time.",
    castShape: "narrator",
    speakers: ["Narrator"],
    sections: ["Hook", "Pitch", "Call to action"]
  },
  {
    id: "tutorial",
    label: "Tutorial",
    description: "One voice walks through the steps.",
    castShape: "narrator",
    speakers: ["Narrator"],
    sections: ["Intro", "Steps", "Recap"]
  }
];

export const scriptFormatById = (id: string): ScriptFormat | undefined =>
  SCRIPT_FORMATS.find((format) => format.id === id);

/** The lengths offered beside the format cards, in seconds (PRD § 9.2). */
export const SCRIPT_LENGTH_CHOICES: readonly number[] = [30, 60, 120];

// ── Pace ────────────────────────────────────────────────────────────────────

export type ScriptPaceId = "slow" | "normal" | "fast";

/**
 * Words a minute per pace. The figures are ordinary spoken-delivery rates —
 * audiobook, presenter, ad read — and they are what turns a word count into
 * the seconds shown under the review's title and asked of the writer.
 */
export const PACE_WORDS_PER_MINUTE: Readonly<Record<ScriptPaceId, number>> = {
  slow: 110,
  normal: 140,
  fast: 170
};

/** Words in a stretch of text, counting a run of whitespace as one break. */
export const countScriptWords = (text: string): number => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

/** How long `words` take to say at `pace`, in seconds. */
export const estimateSpokenSeconds = (
  words: number,
  pace: ScriptPaceId = "normal"
): number => (words / PACE_WORDS_PER_MINUTE[pace]) * 60;

/** How many words fit in `seconds` at `pace` — the writer's length target. */
export const wordsForSeconds = (
  seconds: number,
  pace: ScriptPaceId = "normal"
): number => Math.max(1, Math.round((seconds / 60) * PACE_WORDS_PER_MINUTE[pace]));

// ── The written script ──────────────────────────────────────────────────────

export interface WrittenSpeaker {
  id: string;
  name: string;
}

export interface WrittenLine {
  id: string;
  speakerId: string | null;
  text: string;
  direction?: string;
  /**
   * How long the line is meant to take, in ms. Only a subtitle import sets
   * one: the cue's own timing is the target its take should hit (PRD § 9.1).
   */
  targetDurationMs?: number;
}

export interface WrittenSection {
  id: string;
  title: string;
  lines: WrittenLine[];
}

export interface WrittenScript {
  cast: WrittenSpeaker[];
  sections: WrittenSection[];
}

/** What the writer is told about the piece it is writing. */
export interface ScriptWriterInput {
  brief: string;
  /** A format id from {@link SCRIPT_FORMATS}, or an empty string. */
  format: string;
  lengthSeconds: number;
  pace?: ScriptPaceId;
  language?: string;
  /**
   * The script as it stands, when this is a rewrite. The model is asked to
   * keep the id of every line it keeps, which is what preserves takes and
   * shot links across a rewrite (PRD § 9.2, criterion 4 of § 7 by analogy).
   */
  existing?: WrittenScript;
}

export const SCRIPT_TOOL_NAME = "script";
export const SCRIPT_TOOL_DESCRIPTION =
  "Submit the finished script: the cast, and the lines each of them speaks.";

export const SCRIPT_WRITER_SYSTEM_PROMPT = [
  "You are a scriptwriter. Turn the user's brief into lines that will be read",
  "aloud. Write only what is spoken: no camera notes, no stage description, no",
  "markdown. Give every line to one speaker from the cast you return. Keep each",
  "line to a single spoken thought, short enough to say in one breath. Use the",
  "direction field for a performance note when one is needed, and leave it out",
  "otherwise. Call the script tool exactly once."
].join(" ");

/** The brief, format, length and existing script as the prompt shows them. */
export function buildScriptWriterPrompt(input: ScriptWriterInput): string {
  const format = scriptFormatById(input.format);
  const pace = input.pace ?? "normal";
  const words = wordsForSeconds(input.lengthSeconds, pace);
  const parts: string[] = [input.brief.trim()];

  if (format) {
    parts.push(
      `Format: ${format.label} — ${format.description} Cast: ${format.speakers.join(", ")}. Sections: ${format.sections.join(", ")}.`
    );
  }
  parts.push(
    `Length: about ${input.lengthSeconds} seconds at a ${pace} read, which is roughly ${words} words in total.`
  );
  if (input.language) {
    parts.push(`Write it in ${input.language}.`);
  }
  if (input.existing) {
    const lines: string[] = [];
    for (const section of input.existing.sections) {
      lines.push(`## ${section.title}`);
      for (const line of section.lines) {
        const speaker = input.existing.cast.find(
          (member) => member.id === line.speakerId
        );
        lines.push(`[${line.id}] ${speaker?.name ?? "—"}: ${line.text}`);
      }
    }
    parts.push(
      [
        "Here is the script as it stands. Rewrite it against the brief above.",
        "Every line you keep — even reworded — must come back with the id it",
        "carries here, so its recording and its shot link survive. Use a new id",
        "only for a line that did not exist.",
        "",
        ...lines
      ].join("\n")
    );
  }
  return parts.join("\n\n");
}

/** Structured output: a cast, and sections of lines attributed to it. */
export function buildScriptSchema(
  options: { retainIds?: readonly string[] } = {}
): Record<string, unknown> {
  const id: Record<string, unknown> = {
    type: "string",
    description:
      options.retainIds && options.retainIds.length > 0
        ? "The id this line already carries, when it is a line you kept. Omit for a new line."
        : "Omit — ids are assigned for you."
  };
  return {
    type: "object",
    properties: {
      speakers: {
        type: "array",
        minItems: 1,
        description: "Everyone who speaks, in the order they first speak.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "How the speaker is named in the script." }
          },
          required: ["name"]
        }
      },
      sections: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "What this part of the script is." },
            lines: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                properties: {
                  id,
                  speaker: {
                    type: "string",
                    description: "The name of the speaker who says this line."
                  },
                  text: {
                    type: "string",
                    description: "The spoken words, exactly as they are to be read."
                  },
                  direction: {
                    type: "string",
                    description: "Optional performance note, e.g. 'wry, unhurried'."
                  }
                },
                required: ["speaker", "text"]
              }
            }
          },
          required: ["title", "lines"]
        }
      }
    },
    required: ["speakers", "sections"]
  };
}

/** Mints `${prefix}_1`, `${prefix}_2`, … so a parse is reproducible in a test. */
const counter = (prefix: string): (() => string) => {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}_${n}`;
  };
};

const cleanText = (value: unknown): string =>
  isString(value) ? value.trim() : "";

export interface ParseWrittenScriptOptions {
  /**
   * Prefix for minted ids. A caller that must not collide with what is already
   * on the document passes something unique to the run; a test passes a fixed
   * string and reads the ids back.
   */
  idPrefix: string;
  /** Line ids already on the document. An answer may only reuse these. */
  retainIds?: readonly string[];
  /**
   * Speakers already in the cast. A speaker the answer names again keeps its
   * id — and with it the voice bound to it — while one the answer drops is
   * gone: a cast member with no lines would sit in the voices step with
   * nothing to say.
   */
  existingCast?: readonly WrittenSpeaker[];
}

/**
 * The model's answer as cast and sections. Unknown speaker names become new
 * cast members; a line naming no known speaker keeps the section's last
 * speaker, because an unattributed line still has to be voiced by someone.
 */
export function parseWrittenScript(
  raw: unknown,
  options: ParseWrittenScriptOptions
): WrittenScript {
  const answer = isRecord(raw) ? raw : {};
  const nextSpeakerId = counter(`${options.idPrefix}_spk`);
  const nextSectionId = counter(`${options.idPrefix}_sec`);
  const nextLineId = counter(`${options.idPrefix}_line`);
  const retained = new Set(options.retainIds ?? []);
  const usedIds = new Set<string>();

  const cast: WrittenSpeaker[] = [];
  const held = new Map(
    (options.existingCast ?? []).map((member) => [
      member.name.trim().toLowerCase(),
      member
    ])
  );
  const byName = new Map<string, WrittenSpeaker>();

  const speakerFor = (name: string): WrittenSpeaker | null => {
    const key = name.trim().toLowerCase();
    if (key === "") return null;
    const already = byName.get(key);
    if (already) return already;
    const kept = held.get(key);
    const created: WrittenSpeaker = kept
      ? { id: kept.id, name: kept.name }
      : { id: nextSpeakerId(), name: name.trim() };
    cast.push(created);
    byName.set(key, created);
    return created;
  };

  for (const entry of Array.isArray(answer["speakers"]) ? answer["speakers"] : []) {
    if (isRecord(entry)) {
      speakerFor(cleanText(entry["name"]));
    } else if (isString(entry)) {
      speakerFor(entry);
    }
  }

  const sections: WrittenSection[] = [];
  const rawSections = Array.isArray(answer["sections"]) ? answer["sections"] : [];
  for (const rawSection of rawSections) {
    if (!isRecord(rawSection)) continue;
    const lines: WrittenLine[] = [];
    const rawLines = Array.isArray(rawSection["lines"]) ? rawSection["lines"] : [];
    let lastSpeakerId: string | null = null;
    for (const rawLine of rawLines) {
      if (!isRecord(rawLine)) continue;
      const text = cleanText(rawLine["text"]);
      if (text === "") continue;
      const speaker = speakerFor(cleanText(rawLine["speaker"]));
      if (speaker) lastSpeakerId = speaker.id;
      // An id is honoured only when the document already carries it and no
      // earlier line in this answer claimed it, so a model that repeats one id
      // cannot fold two lines onto the same take.
      const claimed = cleanText(rawLine["id"]);
      const id =
        claimed !== "" && retained.has(claimed) && !usedIds.has(claimed)
          ? claimed
          : nextLineId();
      usedIds.add(id);
      const line: WrittenLine = {
        id,
        speakerId: speaker?.id ?? lastSpeakerId,
        text
      };
      const direction = cleanText(rawLine["direction"]);
      if (direction !== "") {
        line.direction = direction;
      }
      lines.push(line);
    }
    if (lines.length === 0) continue;
    sections.push({
      id: nextSectionId(),
      title: cleanText(rawSection["title"]) || `Section ${sections.length + 1}`,
      lines
    });
  }

  return { cast, sections };
}

/**
 * The script a writer run falls back to when the provider answers with nothing
 * usable — the brief itself, split into lines and given the format's first
 * speaker. Deterministic, and the same rule the storyboard's Director applies.
 */
export function fallbackScript(
  input: ScriptWriterInput,
  options: ParseWrittenScriptOptions
): WrittenScript {
  const format = scriptFormatById(input.format);
  const name = format?.speakers[0] ?? "Narrator";
  const texts = splitImportedText(input.brief);
  const nextLineId = counter(`${options.idPrefix}_line`);
  const speaker: WrittenSpeaker = {
    id: `${options.idPrefix}_spk_1`,
    name
  };
  return {
    cast: [speaker],
    sections: [
      {
        id: `${options.idPrefix}_sec_1`,
        title: format?.sections[0] ?? "Script",
        lines: texts.map((text) => ({
          id: nextLineId(),
          speakerId: speaker.id,
          text
        }))
      }
    ]
  };
}

// ── Imported words ──────────────────────────────────────────────────────────

/**
 * The longest a split line gets before sentence boundaries are used as well.
 * A line is what one take records, so a whole pasted paragraph in one line
 * would be one long take nobody can re-voice a part of.
 */
const MAX_LINE_CHARS = 240;

/** Split a run of text at sentence ends, keeping the punctuation. */
const sentences = (text: string): string[] => {
  const parts = text.match(/[^.!?…]+[.!?…]*\s*/g);
  return (parts ?? [text]).map((part) => part.trim()).filter((part) => part !== "");
};

/**
 * Pasted, uploaded or extracted text as lines, with no model involved: blank
 * lines separate blocks, newlines separate lines, and a line too long to say
 * in one take is cut at its sentence ends. Only whitespace between words is
 * dropped, so the words and their order come out of this exactly as they went
 * in (PRD § 9.1, criterion 4).
 */
export function splitImportedText(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.length <= MAX_LINE_CHARS) {
      out.push(line);
      continue;
    }
    for (const sentence of sentences(line)) {
      out.push(sentence);
    }
  }
  return out;
}

export const ATTRIBUTION_TOOL_NAME = "script_attribution";
export const ATTRIBUTION_TOOL_DESCRIPTION =
  "Say who speaks each numbered line, and how. The words themselves are final.";

export const ATTRIBUTION_SYSTEM_PROMPT = [
  "You are casting a script that is already written. The lines are final: never",
  "reword, merge, split, reorder or drop one. For every line you are given, by",
  "its number, name the speaker who says it and, where it helps, a short",
  "performance note. Return one entry per line, in order.",
  "Call the attribution tool exactly once."
].join(" ");

/** The split lines as the attribution prompt shows them: numbered, verbatim. */
export function buildAttributionPrompt(
  lines: readonly string[],
  input: Pick<ScriptWriterInput, "brief" | "format">
): string {
  const format = scriptFormatById(input.format);
  const head = [
    input.brief.trim() === "" ? "" : `Context: ${input.brief.trim()}`,
    format
      ? `Format: ${format.label}. Expected cast: ${format.speakers.join(", ")}.`
      : ""
  ].filter((part) => part !== "");
  return [
    ...head,
    "Assign a speaker to every line below. Do not change a word of them.",
    "",
    ...lines.map((line, index) => `${index + 1}. ${line}`)
  ].join("\n");
}

/** Structured output with nowhere to write the words (PRD § 9.2, D10). */
export function buildAttributionSchema(
  lineCount: number
): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      speakers: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"]
        }
      },
      lines: {
        type: "array",
        minItems: lineCount,
        maxItems: lineCount,
        items: {
          type: "object",
          properties: {
            number: {
              type: "integer",
              minimum: 1,
              maximum: lineCount,
              description: "The number the line was given in the prompt."
            },
            speaker: { type: "string", description: "Who says it." },
            direction: {
              type: "string",
              description: "Optional performance note."
            }
          },
          required: ["number", "speaker"]
        }
      }
    },
    required: ["speakers", "lines"]
  };
}

export interface ApplyAttributionOptions extends ParseWrittenScriptOptions {
  /** Section title for the imported lines. */
  sectionTitle?: string;
  /**
   * Line ids to reuse, in order, for the imported lines. An SRT or FDX import
   * that already wrote lines passes them so re-running the writer does not
   * discard their takes.
   */
  lineIds?: readonly string[];
}

/**
 * The attribution answer applied to the split lines. `lines` is the only
 * source of text this function has, so the words cannot come from the model
 * whatever it returned (PRD § 9.7 criterion 4).
 */
export function applyAttribution(
  lines: readonly string[],
  raw: unknown,
  options: ApplyAttributionOptions
): WrittenScript {
  const answer = isRecord(raw) ? raw : {};
  const nextSpeakerId = counter(`${options.idPrefix}_spk`);
  const nextLineId = counter(`${options.idPrefix}_line`);

  const cast: WrittenSpeaker[] = [];
  const held = new Map(
    (options.existingCast ?? []).map((member) => [
      member.name.trim().toLowerCase(),
      member
    ])
  );
  const byName = new Map<string, WrittenSpeaker>();
  const speakerFor = (name: string): WrittenSpeaker | null => {
    const key = name.trim().toLowerCase();
    if (key === "") return null;
    const already = byName.get(key);
    if (already) return already;
    const kept = held.get(key);
    const created: WrittenSpeaker = kept
      ? { id: kept.id, name: kept.name }
      : { id: nextSpeakerId(), name: name.trim() };
    cast.push(created);
    byName.set(key, created);
    return created;
  };

  for (const entry of Array.isArray(answer["speakers"]) ? answer["speakers"] : []) {
    if (isRecord(entry)) {
      speakerFor(cleanText(entry["name"]));
    }
  }

  // Attribution by line number, so an answer that skips or reorders entries
  // still lands on the line it named.
  const attributed = new Map<number, { speaker: string; direction: string }>();
  for (const entry of Array.isArray(answer["lines"]) ? answer["lines"] : []) {
    if (!isRecord(entry)) continue;
    const number = Number(entry["number"]);
    if (!Number.isInteger(number)) continue;
    attributed.set(number, {
      speaker: cleanText(entry["speaker"]),
      direction: cleanText(entry["direction"])
    });
  }

  let lastSpeakerId: string | null = null;
  const written: WrittenLine[] = lines.map((text, index) => {
    const entry = attributed.get(index + 1);
    const speaker = entry ? speakerFor(entry.speaker) : null;
    if (speaker) lastSpeakerId = speaker.id;
    const line: WrittenLine = {
      id: options.lineIds?.[index] ?? nextLineId(),
      speakerId: speaker?.id ?? lastSpeakerId,
      text
    };
    const direction = entry?.direction ?? "";
    if (direction !== "") {
      line.direction = direction;
    }
    return line;
  });

  // Nobody was named: the lines still need a voice, so the format's first
  // speaker takes them all.
  if (cast.length === 0 && written.length > 0) {
    const only = speakerFor("Narrator");
    if (only) {
      for (const line of written) {
        line.speakerId = only.id;
      }
    }
  }

  return {
    cast,
    sections: [
      {
        id: `${options.idPrefix}_sec_1`,
        title: options.sectionTitle ?? "Script",
        lines: written
      }
    ]
  };
}
