import { formatNodeDocumentation } from "../formatNodeDocumentation";

describe("formatNodeDocumentation", () => {
  it("extracts description from first line", () => {
    const doc = "This is the description.\ntag1, tag2";
    const result = formatNodeDocumentation(doc);

    expect(result.description).toBe("This is the description.");
  });

  it("extracts tags from second line", () => {
    const doc = "Description here.\ntag1, tag2, tag3";
    const result = formatNodeDocumentation(doc);

    expect(result.tags).toEqual(["tag1", "tag2", "tag3"]);
  });

  it("handles empty documentation", () => {
    const result = formatNodeDocumentation("");

    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
    expect(result.useCases.raw).toBe("");
    expect(result.useCases.html).toBe("");
  });

  it("handles null documentation", () => {
    const result = formatNodeDocumentation(null as any);

    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
  });

  it("handles documentation without tags line", () => {
    const doc = "Just a description without tags.";
    const result = formatNodeDocumentation(doc);

    expect(result.description).toBe("Just a description without tags.");
    expect(result.tags).toEqual([]);
  });

  it("handles documentation with only use cases", () => {
    const doc = `Description here.
Use cases:
- Use case 1
- Use case 2`;
    const result = formatNodeDocumentation(doc);

    expect(result.description).toBe("Description here.");
    expect(result.tags).toEqual(["Use cases:"]);
    expect(result.useCases.raw).toBe("Use case 1\nUse case 2");
  });

  it("handles documentation with tags and use cases", () => {
    const doc = `Description here.
tag1, tag2
Use cases:
- Use case 1
- Use case 2`;
    const result = formatNodeDocumentation(doc);

    expect(result.description).toBe("Description here.");
    expect(result.tags).toEqual(["tag1", "tag2"]);
    expect(result.useCases.raw).toBe("Use case 1\nUse case 2");
  });

  it("handles use cases without bullets", () => {
    const doc = `Description.
Use cases:
This is a use case without bullets.`;
    const result = formatNodeDocumentation(doc);

    expect(result.description).toBe("Description.");
    expect(result.useCases.raw).toBe("This is a use case without bullets.");
  });

  it("trims whitespace from lines", () => {
    const doc = "  Description with whitespace  .\n  tag1  ,  tag2  ";
    const result = formatNodeDocumentation(doc);

    expect(result.description).toBe("Description with whitespace  .");
    expect(result.tags).toEqual(["tag1", "tag2"]);
  });

  it("filters empty tags", () => {
    const doc = "Desc.\ntag1, , tag2, ";
    const result = formatNodeDocumentation(doc);

    expect(result.tags).toEqual(["tag1", "tag2"]);
  });

  it("generates HTML for use cases with bullets", () => {
    const doc = `Description.
Use cases:
- Case 1
- Case 2`;
    const result = formatNodeDocumentation(doc);

    expect(result.useCases.html).toContain("<ul>");
    expect(result.useCases.html).toContain("<li>");
    expect(result.useCases.html).toContain("Case 1");
    expect(result.useCases.html).toContain("Case 2");
  });

  it("generates HTML for use cases without bullets", () => {
    const doc = `Description.
Use cases:
This is a use case.`;
    const result = formatNodeDocumentation(doc);

    expect(result.useCases.html).toContain("This is a use case.");
  });

  it("escapes HTML in use cases", () => {
    const doc = `Description.
Use cases:
- <script>alert('xss')</script>`;
    const result = formatNodeDocumentation(doc);

    expect(result.useCases.html).toContain("&lt;script&gt;");
    expect(result.useCases.html).not.toContain("<script>");
  });

  it("handles multiple lines after use cases header", () => {
    const doc = `Description.
Use cases:
- First use case
- Second use case
- Third use case`;
    const result = formatNodeDocumentation(doc);

    expect(result.useCases.raw).toBe("First use case\nSecond use case\nThird use case");
  });

  it("handles tags with extra spaces", () => {
    const doc = "Desc.\ntag1  ,  tag2  ,  tag3";
    const result = formatNodeDocumentation(doc);

    expect(result.tags).toEqual(["tag1", "tag2", "tag3"]);
  });

  it("handles empty lines in documentation", () => {
    const doc = `Description here.


tag1, tag2

Use cases:
- Use case`;
    const result = formatNodeDocumentation(doc);

    expect(result.description).toBe("Description here.");
    expect(result.tags).toEqual([]);
    expect(result.useCases.raw).toBe("Use case");
  });

  it("handles documentation with only tags", () => {
    const doc = "Description.\ntag1, tag2, tag3";
    const result = formatNodeDocumentation(doc);

    expect(result.description).toBe("Description.");
    expect(result.tags).toEqual(["tag1", "tag2", "tag3"]);
    expect(result.useCases.raw).toBe("");
    expect(result.useCases.html).toBe("");
  });

  it("handles very long description", () => {
    const longDesc = "A".repeat(1000);
    const doc = longDesc;
    const result = formatNodeDocumentation(doc);

    expect(result.description).toBe(longDesc);
  });

  it("handles special characters in description", () => {
    const doc = "Description with <special> & 'characters'.";
    const result = formatNodeDocumentation(doc);

    expect(result.description).toBe("Description with <special> & 'characters'.");
  });
});
