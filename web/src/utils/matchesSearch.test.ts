import { matchesSearch, searchStem } from "./matchesSearch";

describe("matchesSearch", () => {
  const modelArena =
    "Model Arena One brief, three frontier models, answered side by side comparison llm";

  it("finds a word through another form of it", () => {
    expect(matchesSearch(modelArena, "compare")).toBe(true);
    expect(matchesSearch(modelArena, "comparing")).toBe(true);
    expect(matchesSearch("Vary Image change one thing about a photo", "photos")).toBe(true);
    expect(matchesSearch("Jargon in, plain and simple language out", "simplify")).toBe(true);
  });

  it("needs every query word, in any order", () => {
    expect(matchesSearch(modelArena, "side models")).toBe(true);
    expect(matchesSearch(modelArena, "compare video")).toBe(false);
  });

  it("ignores case and surrounding space", () => {
    expect(matchesSearch(modelArena, "  ARENA ")).toBe(true);
  });

  it("matches everything for an empty query", () => {
    expect(matchesSearch(modelArena, "   ")).toBe(true);
  });

  // UX research study 13: participants searched for these jobs in their own
  // words and found nothing.
  it("finds text by the words people searched for", () => {
    const rewrite = "Jargon in, plain and simple language out, from an email thread";
    expect(matchesSearch(rewrite, "email")).toBe(true);
    expect(matchesSearch(rewrite, "simple")).toBe(true);
    expect(matchesSearch(rewrite, "simplify")).toBe(true);
    expect(matchesSearch(rewrite, "jargon")).toBe(true);
  });

  it("keeps short words whole", () => {
    expect(searchStem("side")).toBe("side");
    expect(searchStem("ads")).toBe("ads");
    expect(searchStem("compare")).toBe("compar");
    expect(searchStem("background")).toBe("background");
  });
});
