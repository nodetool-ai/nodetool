/**
 * `fillScript` — the substitution a `nodetool.script.FillScript` run performs.
 *
 * The case that must fail if the function ever blanked an unresolved
 * placeholder is "leaves a placeholder with no value in place": it asserts the
 * text still reads `{{price}}`, so a `return ""` in the replacer turns it red.
 */
import { describe, it, expect } from "vitest";
import { fillScript } from "../src/script-fill.js";
import type {
  ScriptDocumentSchema,
  Take
} from "../src/api-schemas/scripts.js";

const VOICE = { provider: "openai", model: "tts-1", voice: "alloy" };

const take = (text: string): Take => ({
  id: "take-1",
  assetId: "asset-1",
  durationMs: 1200,
  words: [],
  textSnapshot: text,
  voiceSnapshot: VOICE,
  createdAt: "2026-01-01T00:00:00.000Z"
});

function template(): ScriptDocumentSchema {
  return {
    cast: [{ id: "spk-1", name: "Narrator", voice: VOICE }],
    sections: [
      {
        id: "sec-1",
        title: "Open",
        lines: [
          {
            id: "line-1",
            speakerId: "spk-1",
            text: "Meet the {{name}}.",
            takes: [take("Meet the {{name}}.")],
            currentTakeId: "take-1"
          },
          {
            id: "line-2",
            speakerId: "spk-1",
            text: "It never changes.",
            takes: [take("It never changes.")],
            currentTakeId: "take-1"
          }
        ]
      }
    ]
  };
}

describe("fillScript", () => {
  it("substitutes every placeholder and reports the keys it filled", () => {
    const doc = template();
    doc.sections[0].lines[0].text = "Meet the {{name}}, yours for {{price}}.";

    const result = fillScript(doc, { name: "Aero 9", price: "$79" });

    expect(result.document.sections[0].lines[0].text).toBe(
      "Meet the Aero 9, yours for $79."
    );
    expect(result.filled).toEqual(["name", "price"]);
    expect(result.unresolved).toEqual([]);
  });

  it("accepts inner whitespace and repeats one key", () => {
    const doc = template();
    doc.sections[0].lines[0].text = "{{ name }} is the {{name}} you wanted.";

    const result = fillScript(doc, { name: "Aero 9" });

    expect(result.document.sections[0].lines[0].text).toBe(
      "Aero 9 is the Aero 9 you wanted."
    );
    expect(result.filled).toEqual(["name"]);
  });

  it("leaves a placeholder with no value in place and reports it", () => {
    const doc = template();
    doc.sections[0].lines[0].text = "Meet the {{name}}, yours for {{price}}.";

    const result = fillScript(doc, { name: "Aero 9" });

    expect(result.document.sections[0].lines[0].text).toBe(
      "Meet the Aero 9, yours for {{price}}."
    );
    expect(result.filled).toEqual(["name"]);
    expect(result.unresolved).toEqual(["price"]);
  });

  it("fills a key whose value is the empty string rather than reporting it", () => {
    const doc = template();

    const result = fillScript(doc, { name: "" });

    expect(result.document.sections[0].lines[0].text).toBe("Meet the .");
    expect(result.filled).toEqual(["name"]);
    expect(result.unresolved).toEqual([]);
  });

  it("keeps every take, so only the lines it changed need re-voicing", () => {
    const doc = template();

    const filled = fillScript(doc, { name: "Aero 9" });
    const [changed, untouched] = filled.document.sections[0].lines;

    expect(changed.takes).toHaveLength(1);
    expect(changed.currentTakeId).toBe("take-1");
    expect(untouched.takes).toHaveLength(1);
    // The comparison `needsVoicing` makes (`@nodetool-ai/timeline`): a take is
    // stale when its `textSnapshot` no longer matches the line. Asserted here
    // on the snapshots because protocol cannot import timeline; the node test
    // in `packages/video-nodes` runs the real `needsVoicing` on this output.
    expect(changed.takes[0].textSnapshot).not.toBe(changed.text);
    expect(untouched.takes[0].textSnapshot).toBe(untouched.text);
  });

  it("does not mutate the source document", () => {
    const doc = template();

    fillScript(doc, { name: "Aero 9" });

    expect(doc.sections[0].lines[0].text).toBe("Meet the {{name}}.");
  });

  it("returns unchanged lines by reference", () => {
    const doc = template();

    const result = fillScript(doc, { name: "Aero 9" });

    expect(result.document.sections[0].lines[1]).toBe(doc.sections[0].lines[1]);
  });

  it("carries templateId and cast through untouched", () => {
    const doc = template();
    doc.templateId = "script-template";

    const result = fillScript(doc, { name: "Aero 9" });

    expect(result.document.templateId).toBe("script-template");
    expect(result.document.cast).toEqual(doc.cast);
  });
});
