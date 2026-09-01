/**
 * F16: `CaptionWord.kind` and `confidence` existed on the model type and not in
 * the Zod schema, so every save dropped them. Filler-word removal reads `kind`,
 * which made the feature work until the document was saved once and then find
 * nothing.
 *
 * The round trip is the check. `timelineDocument` strips what it does not
 * declare, so a fixture whose words come back with both fields intact is the
 * evidence, and `field_stripped` is what reports the regression if either is
 * removed from the schema again.
 */
import { describe, expect, it } from "vitest";

import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

/**
 * "like" is not in the filler lexicon, so nothing but the explicit `kind`
 * marks it — exactly the word a save used to turn back into ordinary speech.
 */
function captionedDocument(): Record<string, unknown> {
  return {
    tracks: [
      {
        id: "track-1",
        name: "Voiceover",
        type: "audio",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    markers: [],
    clips: [
      {
        id: "vo-1",
        trackId: "track-1",
        name: "Line 1",
        startMs: 0,
        durationMs: 2000,
        mediaType: "audio",
        sourceType: "generated",
        prompt: "So um like yes",
        status: "generated",
        locked: false,
        versions: [],
        caption: {
          words: [
            { word: "So", startMs: 0, endMs: 200, kind: "word", confidence: 0.99 },
            { word: "um", startMs: 200, endMs: 400, kind: "filler", confidence: 0.42 },
            { word: "like", startMs: 400, endMs: 600, kind: "filler", confidence: 0.51 },
            { word: "yes", startMs: 600, endMs: 900, kind: "word", confidence: 0.97 },
            { word: "", startMs: 900, endMs: 1200, kind: "pause" }
          ]
        }
      }
    ]
  };
}

describe("caption word kind and confidence survive the schema", () => {
  it("parses every kind and keeps the confidence", () => {
    const parsed = timelineDocument.parse(captionedDocument());
    const words = parsed.clips[0]?.caption?.words ?? [];
    expect(words.map((word) => word.kind)).toEqual([
      "word",
      "filler",
      "filler",
      "word",
      "pause"
    ]);
    expect(words.map((word) => word.confidence)).toEqual([
      0.99, 0.42, 0.51, 0.97, undefined
    ]);
  });

  it("round trips the whole document unchanged", () => {
    const raw = captionedDocument();
    expect(timelineDocument.parse(raw)).toEqual(raw);
  });

  it("strips nothing and reports no issue", () => {
    const result = validateTimelineSequence(captionedDocument());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("refuses a kind the schema does not know", () => {
    const doc = captionedDocument();
    const clips = doc.clips as Record<string, unknown>[];
    const caption = clips[0].caption as { words: Record<string, unknown>[] };
    caption.words[1].kind = "disfluency";
    expect(timelineDocument.safeParse(doc).success).toBe(false);
  });

  it("refuses a confidence outside 0..1", () => {
    const doc = captionedDocument();
    const clips = doc.clips as Record<string, unknown>[];
    const caption = clips[0].caption as { words: Record<string, unknown>[] };
    caption.words[0].confidence = 1.5;
    expect(timelineDocument.safeParse(doc).success).toBe(false);
  });
});
