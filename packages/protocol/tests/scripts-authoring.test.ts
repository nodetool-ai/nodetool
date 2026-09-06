/**
 * The writer's contract (PRD § 9.7).
 *
 * Criterion 3: a run produces cast and lines and nothing else — no take, no
 * asset, no job — which here means the parse yields only those two things and
 * the schema offers nowhere else to write.
 *
 * Criterion 4: imported text is kept verbatim. The proof is structural rather
 * than statistical: the attribution schema has no `text` field, and
 * `applyAttribution` reads every line's words from the split, so an answer
 * that tries to rewrite the import is ignored. The fixture below is that
 * attempt.
 */

import { describe, expect, it } from "vitest";
import {
  applyAttribution,
  buildAttributionSchema,
  buildScriptSchema,
  buildScriptWriterPrompt,
  countScriptWords,
  estimateSpokenSeconds,
  fallbackScript,
  parseWrittenScript,
  SCRIPT_FORMATS,
  splitImportedText,
  wordsForSeconds
} from "../src/script-authoring.js";

/** A pasted script: a heading, two paragraphs, and a long unbroken one. */
const IMPORTED = `Cold open, a kitchen before sunrise.

We built this because nobody wanted to read another manual.
So we wrote one sentence instead.

The first release shipped on a Tuesday to eleven people, and by the end of that week it had reached four hundred, which was more than the team had planned for and rather more than the servers had, so the rest of the month went into making it hold. It held.`;

const words = (text: string): string[] => text.trim().split(/\s+/);

describe("splitImportedText", () => {
  it("keeps every word of the source, in order", () => {
    const lines = splitImportedText(IMPORTED);
    expect(words(lines.join(" "))).toEqual(words(IMPORTED));
  });

  it("drops blank lines and cuts a long paragraph at its sentence ends", () => {
    const lines = splitImportedText(IMPORTED);
    expect(lines).toContain("Cold open, a kitchen before sunrise.");
    expect(lines).toContain("So we wrote one sentence instead.");
    expect(lines[lines.length - 1]).toBe("It held.");
    expect(lines.every((line) => line.trim() !== "")).toBe(true);
  });

  it("leaves a short line exactly as it was written", () => {
    expect(splitImportedText("  Don't fix my punctuation…  ")).toEqual([
      "Don't fix my punctuation…"
    ]);
  });
});

describe("applyAttribution", () => {
  const lines = splitImportedText(IMPORTED);

  /** What a model that ignores the schema sends: its own, better prose. */
  const rewritingAnswer = {
    speakers: [{ name: "Narrator" }, { name: "Founder" }],
    lines: lines.map((line, index) => ({
      number: index + 1,
      speaker: index === 0 ? "Narrator" : "Founder",
      text: `A punchier way of saying line ${index + 1}.`,
      direction: index === 0 ? "cold, unhurried" : ""
    }))
  };

  it("keeps the imported words verbatim whatever the answer says", () => {
    const written = applyAttribution(lines, rewritingAnswer, {
      idPrefix: "t"
    });
    expect(written.sections[0].lines.map((line) => line.text)).toEqual(lines);
    expect(words(written.sections[0].lines.map((l) => l.text).join(" "))).toEqual(
      words(IMPORTED)
    );
  });

  it("attributes by line number and carries the direction across", () => {
    const written = applyAttribution(lines, rewritingAnswer, { idPrefix: "t" });
    const [first, second] = written.sections[0].lines;
    const cast = new Map(written.cast.map((s) => [s.id, s.name]));
    expect(cast.get(first.speakerId ?? "")).toBe("Narrator");
    expect(cast.get(second.speakerId ?? "")).toBe("Founder");
    expect(first.direction).toBe("cold, unhurried");
    expect(second.direction).toBeUndefined();
  });

  it("voices every line even when the answer names nobody", () => {
    const written = applyAttribution(lines, {}, { idPrefix: "t" });
    expect(written.cast).toHaveLength(1);
    expect(
      written.sections[0].lines.every((line) => line.speakerId === written.cast[0].id)
    ).toBe(true);
  });

  it("reuses the ids an earlier import already wrote", () => {
    const ids = lines.map((_, index) => `line_${index}`);
    const written = applyAttribution(lines, rewritingAnswer, {
      idPrefix: "t",
      lineIds: ids
    });
    expect(written.sections[0].lines.map((line) => line.id)).toEqual(ids);
  });

  it("offers the model no field to write text into", () => {
    const schema = buildAttributionSchema(lines.length);
    const item = (
      (schema["properties"] as Record<string, Record<string, unknown>>)[
        "lines"
      ]["items"] as Record<string, unknown>
    )["properties"] as Record<string, unknown>;
    expect(Object.keys(item).sort()).toEqual(["direction", "number", "speaker"]);
  });
});

describe("parseWrittenScript", () => {
  const answer = {
    speakers: [{ name: "Host" }, { name: "Guest" }],
    sections: [
      {
        title: "Intro",
        lines: [
          { speaker: "Host", text: "Welcome back.", direction: "warm" },
          { speaker: "Guest", text: "Glad to be here." }
        ]
      },
      {
        title: "Questions",
        lines: [{ speaker: "Host", text: "So what changed?" }]
      }
    ]
  };

  it("produces cast and lines and nothing else (criterion 3)", () => {
    const written = parseWrittenScript(answer, { idPrefix: "w" });
    expect(Object.keys(written).sort()).toEqual(["cast", "sections"]);
    expect(written.cast.map((s) => s.name)).toEqual(["Host", "Guest"]);
    expect(written.sections.map((s) => s.title)).toEqual(["Intro", "Questions"]);
    expect(
      written.sections.flatMap((s) => s.lines).map((l) => l.text)
    ).toEqual(["Welcome back.", "Glad to be here.", "So what changed?"]);
    expect(
      written.sections.flatMap((s) => s.lines).every((l) => l.speakerId !== null)
    ).toBe(true);
  });

  it("mints an id for every line and never repeats one", () => {
    const written = parseWrittenScript(answer, { idPrefix: "w" });
    const ids = written.sections.flatMap((s) => s.lines).map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the id of a line a rewrite retained", () => {
    const rewrite = {
      speakers: [{ name: "Host" }],
      sections: [
        {
          title: "Intro",
          lines: [
            { id: "line_1", speaker: "Host", text: "Welcome back to the show." },
            { id: "line_9", speaker: "Host", text: "A line that never existed." },
            { speaker: "Host", text: "And one that is new." }
          ]
        }
      ]
    };
    const written = parseWrittenScript(rewrite, {
      idPrefix: "w",
      retainIds: ["line_1", "line_2"],
      existingCast: [{ id: "spk_kept", name: "Host" }]
    });
    const lines = written.sections[0].lines;
    // The retained line keeps its id, so its takes and its shot link survive.
    expect(lines[0].id).toBe("line_1");
    // An id the document does not carry is not honoured — it would attach the
    // new line to a recording that was never made from it.
    expect(lines[1].id).not.toBe("line_9");
    expect(lines[2].id).not.toBe(lines[1].id);
    // The cast the script already had is reused, so the voice binding holds.
    expect(written.cast).toEqual([{ id: "spk_kept", name: "Host" }]);
  });

  it("refuses to fold two answer lines onto one retained id", () => {
    const written = parseWrittenScript(
      {
        speakers: [{ name: "Host" }],
        sections: [
          {
            title: "Intro",
            lines: [
              { id: "line_1", speaker: "Host", text: "First." },
              { id: "line_1", speaker: "Host", text: "Second." }
            ]
          }
        ]
      },
      { idPrefix: "w", retainIds: ["line_1"] }
    );
    const ids = written.sections[0].lines.map((line) => line.id);
    expect(ids[0]).toBe("line_1");
    expect(ids[1]).not.toBe("line_1");
  });

  it("gives an unattributed line the last speaker rather than no voice", () => {
    const written = parseWrittenScript(
      {
        speakers: [{ name: "Narrator" }],
        sections: [
          {
            title: "Body",
            lines: [
              { speaker: "Narrator", text: "One." },
              { speaker: "", text: "Two." }
            ]
          }
        ]
      },
      { idPrefix: "w" }
    );
    const [first, second] = written.sections[0].lines;
    expect(second.speakerId).toBe(first.speakerId);
  });
});

describe("the writer's prompt and schema", () => {
  it("asks for the length in words the pace implies", () => {
    const prompt = buildScriptWriterPrompt({
      brief: "A 60-second explainer about tide clocks",
      format: "voiceover",
      lengthSeconds: 60,
      pace: "slow"
    });
    expect(prompt).toContain("A 60-second explainer about tide clocks");
    expect(prompt).toContain("Voiceover narration");
    expect(prompt).toContain(`${wordsForSeconds(60, "slow")} words`);
  });

  it("shows a rewrite the ids it must send back", () => {
    const prompt = buildScriptWriterPrompt({
      brief: "Tighten it",
      format: "voiceover",
      lengthSeconds: 30,
      existing: {
        cast: [{ id: "spk_1", name: "Narrator" }],
        sections: [
          {
            id: "sec_1",
            title: "Body",
            lines: [{ id: "line_7", speakerId: "spk_1", text: "The tide came in." }]
          }
        ]
      }
    });
    expect(prompt).toContain("[line_7] Narrator: The tide came in.");
  });

  it("requires a speaker and text on every line", () => {
    const schema = buildScriptSchema();
    const line = (
      (
        (schema["properties"] as Record<string, Record<string, unknown>>)[
          "sections"
        ]["items"] as Record<string, Record<string, unknown>>
      )["properties"]["lines"] as Record<string, Record<string, unknown>>
    )["items"] as Record<string, unknown>;
    expect(line["required"]).toEqual(["speaker", "text"]);
  });
});

describe("fallbackScript", () => {
  it("splits the brief into lines under the format's first speaker", () => {
    const written = fallbackScript(
      { brief: "One line.\nAnother line.", format: "ad-read", lengthSeconds: 30 },
      { idPrefix: "f" }
    );
    expect(written.cast.map((s) => s.name)).toEqual(["Narrator"]);
    expect(written.sections[0].lines.map((l) => l.text)).toEqual([
      "One line.",
      "Another line."
    ]);
  });
});

describe("pace", () => {
  it("turns a word count into seconds and back", () => {
    expect(countScriptWords("one two three")).toBe(3);
    expect(Math.round(estimateSpokenSeconds(140, "normal"))).toBe(60);
    expect(wordsForSeconds(60, "normal")).toBe(140);
    expect(wordsForSeconds(60, "fast")).toBeGreaterThan(
      wordsForSeconds(60, "slow")
    );
  });
});

describe("SCRIPT_FORMATS", () => {
  it("offers the five § 9.2 formats, each with a cast shape and sections", () => {
    expect(SCRIPT_FORMATS.map((format) => format.id)).toEqual([
      "voiceover",
      "dialogue",
      "interview",
      "ad-read",
      "tutorial"
    ]);
    for (const format of SCRIPT_FORMATS) {
      expect(format.speakers.length).toBeGreaterThan(0);
      expect(format.sections.length).toBeGreaterThan(0);
    }
  });
});
