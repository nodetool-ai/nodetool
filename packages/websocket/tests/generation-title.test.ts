import { describe, expect, it } from "vitest";
import { generationTitle } from "../src/session/media-generation.js";

describe("generationTitle", () => {
  it("takes the first words of the prompt without punctuation at the edges", () => {
    expect(generationTitle({ prompt: "  A red fox, in the snow!  " })).toBe(
      "A red fox in the snow"
    );
  });

  it("keeps at most eight words", () => {
    expect(
      generationTitle({ prompt: "one two three four five six seven eight nine ten" })
    ).toBe("one two three four five six seven eight");
  });

  it("drops entity mentions", () => {
    expect(generationTitle({ prompt: "entity://abc123 walking a dog" })).toBe(
      "walking a dog"
    );
  });

  it("uses the text of a speech request", () => {
    expect(generationTitle({ text: "Hello there", voice: "x" })).toBe(
      "Hello there"
    );
  });

  it.each([{}, { prompt: "" }, { prompt: "  ...  " }, { prompt: 4 }])(
    "has no title for %j",
    (params) => {
      expect(generationTitle(params as Record<string, unknown>)).toBeUndefined();
    }
  );
});
