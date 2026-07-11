/**
 * @jest-environment node
 */
import { fuzzyScore } from "../fuzzyMatch";

describe("fuzzyScore", () => {
  describe("no match", () => {
    it("returns 0 for an empty query", () => {
      expect(fuzzyScore("", "anything")).toBe(0);
      expect(fuzzyScore("   ", "anything")).toBe(0);
    });

    it("returns 0 for an empty text", () => {
      expect(fuzzyScore("query", "")).toBe(0);
    });

    it("returns 0 when the query is longer than the text", () => {
      expect(fuzzyScore("longer query", "short")).toBe(0);
    });

    it("returns 0 when the query is not a subsequence of the text", () => {
      expect(fuzzyScore("xyz", "add numbers")).toBe(0);
      expect(fuzzyScore("dda", "add")).toBe(0);
    });
  });

  describe("exact match", () => {
    it("returns 1 for an identical string", () => {
      expect(fuzzyScore("add", "add")).toBe(1);
    });

    it("is case-insensitive", () => {
      expect(fuzzyScore("ADD", "add")).toBe(1);
      expect(fuzzyScore("Add", "aDd")).toBe(1);
    });

    it("trims the query", () => {
      expect(fuzzyScore("  add  ", "add")).toBe(1);
    });
  });

  describe("tier ranking", () => {
    it("ranks exact > prefix > word-boundary substring > mid-word substring > subsequence", () => {
      const exact = fuzzyScore("add", "add");
      const prefix = fuzzyScore("add", "add numbers");
      const boundary = fuzzyScore("add", "list add");
      const midWord = fuzzyScore("add", "baddie");
      const subsequence = fuzzyScore("add", "a divided");

      expect(exact).toBeGreaterThan(prefix);
      expect(prefix).toBeGreaterThan(boundary);
      expect(boundary).toBeGreaterThan(midWord);
      expect(midWord).toBeGreaterThan(subsequence);
      expect(subsequence).toBeGreaterThan(0);
    });

    it("keeps every tier inside its documented range", () => {
      const prefix = fuzzyScore("con", "concatenate");
      expect(prefix).toBeGreaterThanOrEqual(0.85);
      expect(prefix).toBeLessThanOrEqual(0.95);

      const boundary = fuzzyScore("cat", "the cat sat");
      expect(boundary).toBeGreaterThanOrEqual(0.7);
      expect(boundary).toBeLessThanOrEqual(0.8);

      const midWord = fuzzyScore("cat", "concatenate");
      expect(midWord).toBeGreaterThanOrEqual(0.55);
      expect(midWord).toBeLessThanOrEqual(0.65);

      const subsequence = fuzzyScore("cnt", "concatenate");
      expect(subsequence).toBeGreaterThan(0);
      expect(subsequence).toBeLessThan(0.5);
    });
  });

  describe("length affinity", () => {
    it("prefers the shorter text for the same prefix match", () => {
      expect(fuzzyScore("add", "add")).toBeGreaterThan(
        fuzzyScore("add", "add column")
      );
      expect(fuzzyScore("add", "add row")).toBeGreaterThan(
        fuzzyScore("add", "add row to dataframe")
      );
    });

    it("prefers the shorter text for the same substring match", () => {
      expect(fuzzyScore("image", "load image")).toBeGreaterThan(
        fuzzyScore("image", "load image from folder")
      );
    });
  });

  describe("subsequence quality", () => {
    it("scores denser subsequences higher than widely scattered ones", () => {
      expect(fuzzyScore("abc", "axbxc")).toBeGreaterThan(
        fuzzyScore("abc", "a12345b12345c")
      );
    });

    it("rewards word-boundary alignment", () => {
      // Same span, same consecutive runs — only boundary hits differ.
      expect(fuzzyScore("fb", "foo bar")).toBeGreaterThan(
        fuzzyScore("or", "foo bar")
      );
    });

    it("rewards consecutive runs", () => {
      // "lod" in "load data": l,o adjacent, then d — beats fully scattered.
      expect(fuzzyScore("lod", "load data")).toBeGreaterThan(
        fuzzyScore("lod", "list of dicts today")
      );
    });

    it("matches acronym-style queries", () => {
      expect(fuzzyScore("ltd", "load text document")).toBeGreaterThan(0);
    });
  });

  describe("typo tolerance", () => {
    it("corrects a single-character substitution", () => {
      const score = fuzzyScore("imagf", "image");
      expect(score).toBeGreaterThanOrEqual(0.375);
      expect(score).toBeLessThan(0.5);
    });

    it("corrects an adjacent transposition", () => {
      const score = fuzzyScore("iamge", "image");
      expect(score).toBeGreaterThanOrEqual(0.375);
      expect(score).toBeLessThan(0.5);
    });

    it("corrects a typo against a single word of a multi-word text", () => {
      const score = fuzzyScore("imagf", "Load Image");
      // Comfortably above the node-search field threshold (0.3).
      expect(score).toBeGreaterThan(0.3);
      expect(score).toBeLessThan(0.5);
    });

    it("keeps typo matches below every contiguous-match tier", () => {
      const typo = fuzzyScore("imagf", "image");
      const midWord = fuzzyScore("mag", "image"); // substring, mid-word
      expect(fuzzyScore("image", "image")).toBeGreaterThan(typo);
      expect(fuzzyScore("imag", "image")).toBeGreaterThan(typo); // prefix
      expect(midWord).toBeGreaterThan(typo);
    });

    it("does not tolerate typos in very short queries", () => {
      // floor(len / 4) === 0 for 1–3 char queries, so no correction budget.
      expect(fuzzyScore("cat", "car")).toBe(0);
      expect(fuzzyScore("dda", "add")).toBe(0);
    });

    it("ignores distant strings within the correction path", () => {
      expect(fuzzyScore("imagf", "concatenate")).toBe(0);
      expect(fuzzyScore("xyzzy", "gradient")).toBe(0);
    });

    it("keeps every score normalized to [0, 1]", () => {
      for (const [q, t] of [
        ["imagf", "image"],
        ["iamge", "load image"],
        ["cocat", "concatenate"],
        ["xyzzy", "gradient"]
      ] as const) {
        const score = fuzzyScore(q, t);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("ranking sanity on realistic node titles", () => {
    const titles = [
      "Add",
      "Add Column",
      "Address Lookup",
      "Gradient Descent",
      "Load Audio"
    ];

    it("puts the exact title first for 'add'", () => {
      const ranked = [...titles].sort(
        (a, b) => fuzzyScore("add", b) - fuzzyScore("add", a)
      );
      expect(ranked[0]).toBe("Add");
      expect(ranked[1]).toBe("Add Column");
    });

    it("prefers prefix matches over embedded matches", () => {
      expect(fuzzyScore("add", "Address Lookup")).toBeGreaterThan(
        fuzzyScore("add", "Gradient Descent")
      );
    });
  });
});
