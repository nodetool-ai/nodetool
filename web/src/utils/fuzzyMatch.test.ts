import { fuzzyScore } from "./fuzzyMatch";

describe("fuzzyScore", () => {
  describe("exact match", () => {
    it("returns 1.0 for case-insensitive exact match", () => {
      expect(fuzzyScore("hello", "hello")).toBe(1);
      expect(fuzzyScore("Hello", "hello")).toBe(1);
      expect(fuzzyScore("HELLO", "hello")).toBe(1);
    });
  });

  describe("empty inputs", () => {
    it("returns 0 for empty query", () => {
      expect(fuzzyScore("", "hello")).toBe(0);
      expect(fuzzyScore("   ", "hello")).toBe(0);
    });

    it("returns 0 for empty text", () => {
      expect(fuzzyScore("hello", "")).toBe(0);
    });
  });

  describe("prefix match", () => {
    it("scores prefix matches in [0.85, 0.95]", () => {
      const score = fuzzyScore("add", "Add Node");
      expect(score).toBeGreaterThanOrEqual(0.85);
      expect(score).toBeLessThanOrEqual(0.95);
    });

    it("shorter texts score higher (closer to query length)", () => {
      const scoreShort = fuzzyScore("add", "Add");
      const scoreLong = fuzzyScore("add", "Add Column Node");
      expect(scoreShort).toBeGreaterThan(scoreLong);
    });
  });

  describe("substring at word boundary", () => {
    it("scores word-boundary substring in [0.70, 0.80]", () => {
      const score = fuzzyScore("node", "Add Node");
      expect(score).toBeGreaterThanOrEqual(0.7);
      expect(score).toBeLessThanOrEqual(0.8);
    });
  });

  describe("substring not at boundary", () => {
    it("scores non-boundary substring in [0.55, 0.65]", () => {
      const score = fuzzyScore("ode", "Node");
      expect(score).toBeGreaterThanOrEqual(0.55);
      expect(score).toBeLessThanOrEqual(0.65);
    });
  });

  describe("subsequence match", () => {
    it("scores scattered subsequences below 0.5", () => {
      const score = fuzzyScore("anm", "animation");
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(0.5);
    });

    it("denser subsequences score higher", () => {
      const dense = fuzzyScore("abc", "aXbXc");
      const sparse = fuzzyScore("abc", "aXXXbXXXc");
      expect(dense).toBeGreaterThan(sparse);
    });
  });

  describe("typo correction", () => {
    it("returns 0 for short queries that are not subsequences", () => {
      expect(fuzzyScore("zx", "hello")).toBe(0);
    });

    it("scores near-miss typos for 4+ char queries in (0, 0.5)", () => {
      const score = fuzzyScore("noee", "node");
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(0.5);
    });

    it("handles transposition typos", () => {
      const score = fuzzyScore("noed", "node");
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(0.5);
    });
  });

  describe("no match", () => {
    it("returns 0 when query has no relation to text", () => {
      expect(fuzzyScore("xyz", "hello")).toBe(0);
    });
  });

  describe("tier ordering", () => {
    it("exact > prefix > boundary substring > non-boundary substring > subsequence", () => {
      const exact = fuzzyScore("node", "node");
      const prefix = fuzzyScore("node", "NodeEditor");
      const boundary = fuzzyScore("editor", "Node Editor");
      const nonBoundary = fuzzyScore("ditor", "Editor");
      const subseq = fuzzyScore("nde", "NodeEditor");

      expect(exact).toBeGreaterThan(prefix);
      expect(prefix).toBeGreaterThan(boundary);
      expect(boundary).toBeGreaterThan(nonBoundary);
      expect(nonBoundary).toBeGreaterThan(subseq);
    });
  });
});
