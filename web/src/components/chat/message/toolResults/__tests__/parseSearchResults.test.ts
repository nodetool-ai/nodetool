/**
 * @jest-environment node
 */
import { normalizeSearchResults } from "../parseSearchResults";

describe("normalizeSearchResults", () => {
  test("normalizes a { results: [...] } object (google_news shape)", () => {
    const content = {
      success: true,
      results: [
        {
          title: "Quiet luxury 2026",
          link: "https://www.ssense.com/editorial/x",
          snippet: "Warm tungsten key, cool ambient fill.",
          source: { name: "SSENSE" },
          date: "2026-01-01"
        }
      ]
    };
    const items = normalizeSearchResults(content);
    expect(items).toHaveLength(1);
    expect(items![0]).toEqual({
      title: "Quiet luxury 2026",
      url: "https://www.ssense.com/editorial/x",
      snippet: "Warm tungsten key, cool ambient fill.",
      source: "SSENSE",
      date: "2026-01-01"
    });
  });

  test("derives source domain from url when source is absent", () => {
    const items = normalizeSearchResults([
      { title: "A", url: "https://www.phlearn.com/recipes" }
    ]);
    expect(items![0].source).toBe("phlearn.com");
  });

  test("parses the numbered plain-text format (google_search shape)", () => {
    const text = [
      "1. The new quiet luxury",
      "   https://ssense.com/editorial",
      "   Warm tungsten key and plum tones.",
      "",
      "2. Studio recipes",
      "   https://phlearn.com/studio",
      "   Bounce-card placement."
    ].join("\n");
    const items = normalizeSearchResults(text);
    expect(items).toHaveLength(2);
    expect(items![0]).toMatchObject({
      title: "The new quiet luxury",
      url: "https://ssense.com/editorial",
      snippet: "Warm tungsten key and plum tones.",
      source: "ssense.com"
    });
    expect(items![1].title).toBe("Studio recipes");
  });

  test("parses a JSON string payload", () => {
    const items = normalizeSearchResults(
      JSON.stringify({ results: [{ title: "T", link: "https://e.com" }] })
    );
    expect(items).toHaveLength(1);
    expect(items![0].title).toBe("T");
  });

  test("carries an image search result's preview", () => {
    const items = normalizeSearchResults({
      success: true,
      results: [
        {
          title: "A red fox",
          link: "https://wildlife.example/fox",
          original: "https://cdn.example/fox.jpg",
          thumbnail: "https://cdn.example/fox-thumb.jpg"
        }
      ]
    });
    expect(items).toHaveLength(1);
    expect(items![0]).toMatchObject({
      title: "A red fox",
      url: "https://wildlife.example/fox",
      imageUrl: "https://cdn.example/fox-thumb.jpg"
    });
  });

  test("falls back to the image itself when a backend sends no thumbnail", () => {
    const items = normalizeSearchResults({
      results: [
        {
          title: "Bare",
          link: "https://wildlife.example/fox",
          original: "https://cdn.example/fox.jpg"
        }
      ]
    });
    expect(items![0].imageUrl).toBe("https://cdn.example/fox.jpg");
  });

  test("leaves imageUrl unset on results with no picture", () => {
    const items = normalizeSearchResults([
      { title: "T", url: "https://e.com", snippet: "s" }
    ]);
    expect(items![0].imageUrl).toBeUndefined();
  });

  test("returns null for non-search content", () => {
    expect(normalizeSearchResults(null)).toBeNull();
    expect(normalizeSearchResults("")).toBeNull();
    expect(normalizeSearchResults("just a plain answer")).toBeNull();
    expect(normalizeSearchResults({ status: "ok" })).toBeNull();
    expect(normalizeSearchResults(42)).toBeNull();
  });
});
