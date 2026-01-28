import { formatNodeDocumentation } from "../stores/formatNodeDocumentation";

describe("formatNodeDocumentation", () => {
  it("handles null documentation", () => {
    const result = formatNodeDocumentation(null as any);
    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
    expect(result.useCases.raw).toBe("");
    expect(result.useCases.html).toBe("");
  });

  it("handles empty string documentation", () => {
    const result = formatNodeDocumentation("");
    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
    expect(result.useCases.raw).toBe("");
    expect(result.useCases.html).toBe("");
  });

  it("extracts description from first line", () => {
    const result = formatNodeDocumentation("This is a description.\ntag1, tag2");
    expect(result.description).toBe("This is a description.");
    expect(result.tags).toEqual(["tag1", "tag2"]);
  });

  it("extracts tags from second line", () => {
    const result = formatNodeDocumentation("Description.\naudio, generation");
    expect(result.tags).toEqual(["audio", "generation"]);
  });

  it("trims whitespace from tags", () => {
    const result = formatNodeDocumentation("Description.\n  audio  ,  generation  ");
    expect(result.tags).toEqual(["audio", "generation"]);
  });

  it("filters empty tags", () => {
    const result = formatNodeDocumentation("Description.\naudio,, generation, ");
    expect(result.tags).toEqual(["audio", "generation"]);
  });

  it("extracts use cases section", () => {
    const doc = `Description.
tags

Use cases:
- Generate audio from text
- Process audio files`;
    const result = formatNodeDocumentation(doc);
    expect(result.useCases.raw).toContain("Generate audio from text");
    expect(result.useCases.raw).toContain("Process audio files");
  });

  it("formats use cases as bullet list", () => {
    const doc = `Description.
tags

Use cases:
- Case 1
- Case 2`;
    const result = formatNodeDocumentation(doc);
    expect(result.useCases.html).toContain("<ul>");
    expect(result.useCases.html).toContain("<li>");
  });

  it("handles use cases without bullet points", () => {
    const doc = `Description.
tags

Use cases:
This is a paragraph style use case.`;
    const result = formatNodeDocumentation(doc);
    expect(result.useCases.raw).toContain("paragraph style use case");
  });

  it("returns empty useCases when no use cases section", () => {
    const result = formatNodeDocumentation("Simple description.");
    expect(result.useCases.raw).toBe("");
    expect(result.useCases.html).toBe("");
  });

  it("applies search highlighting when searchTerm provided", () => {
    const doc = `Description.
tags

Use cases:
- Generate audio
- Process audio`;
    const searchInfo = {
      matches: [
        {
          key: "use_cases",
          value: "audio",
          indices: [[0, 5]]
        }
      ]
    };
    const result = formatNodeDocumentation(doc, "audio", searchInfo);
    expect(result.useCases.html).toContain("highlight");
  });

  it("returns original format without search when no searchInfo", () => {
    const doc = `Description.
tags

Use cases:
- Case 1
- Case 2`;
    const result = formatNodeDocumentation(doc, "search", undefined);
    expect(result.useCases.html).toContain("<ul>");
  });
});
