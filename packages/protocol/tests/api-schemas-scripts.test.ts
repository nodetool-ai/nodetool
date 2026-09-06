/**
 * The `setup` field is additive (PRD § 9.5): every script written before the
 * guided flow existed has no `setup`, and those documents must keep parsing
 * or the editor stops opening them. The passthrough is what lets a newer
 * client's field survive a round trip through an older one.
 */

import { describe, expect, it } from "vitest";
import {
  scriptDocument,
  scriptSetup
} from "../src/api-schemas/scripts.js";

const legacyDocument = {
  cast: [{ id: "spk_1", name: "Narrator" }],
  sections: [
    {
      id: "sec_1",
      lines: [{ id: "line_1", speakerId: "spk_1", text: "The tide came in." }]
    }
  ]
};

describe("scriptDocument.setup", () => {
  it("parses a script that has no setup", () => {
    const parsed = scriptDocument.parse(legacyDocument);
    expect(parsed.setup).toBeUndefined();
    expect(parsed.sections[0].lines[0].text).toBe("The tide came in.");
  });

  it("parses a script at each stage of the flow", () => {
    for (const stage of ["idea", "format", "review", "voices", "done"] as const) {
      const parsed = scriptDocument.parse({
        ...legacyDocument,
        setup: { stage, brief: "A 60-second explainer" }
      });
      expect(parsed.setup?.stage).toBe(stage);
    }
  });

  it("keeps the fields the format and voices steps write", () => {
    const parsed = scriptDocument.parse({
      ...legacyDocument,
      setup: {
        stage: "voices",
        brief: "A podcast intro",
        format: "interview",
        length_seconds: 60,
        pace: "fast",
        language: "German"
      }
    });
    expect(parsed.setup).toMatchObject({
      format: "interview",
      length_seconds: 60,
      pace: "fast",
      language: "German"
    });
  });

  it("passes an unknown field through instead of dropping it", () => {
    const parsed = scriptSetup.parse({
      stage: "idea",
      brief: "",
      unreleasedField: "from a newer client"
    });
    expect(parsed).toMatchObject({ unreleasedField: "from a newer client" });
  });

  it("refuses a stage that is not one of the five", () => {
    expect(() =>
      scriptDocument.parse({
        ...legacyDocument,
        setup: { stage: "voicing", brief: "" }
      })
    ).toThrow();
  });
});
