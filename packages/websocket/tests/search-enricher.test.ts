import { describe, expect, it } from "vitest";
import { __testing } from "../src/search-enricher.js";

const { segmentsOf } = __testing;

describe("segmentsOf", () => {
  it("keeps the time range of each recognized chunk", () => {
    expect(
      segmentsOf({
        text: "hello there",
        chunks: [
          { timestamp: [0, 1.5], text: "hello" },
          { timestamp: [1.5, 2], text: "there" }
        ]
      })
    ).toEqual([
      { text: "hello", start: 0, end: 1.5 },
      { text: "there", start: 1.5, end: 2 }
    ]);
  });

  it("falls back to the whole text when the model gives no chunks", () => {
    expect(segmentsOf({ text: "just text" })).toEqual([{ text: "just text" }]);
    expect(segmentsOf("plain string")).toEqual([{ text: "plain string" }]);
  });

  it("returns nothing for an answer with no text", () => {
    expect(segmentsOf(null)).toEqual([]);
    expect(segmentsOf({ chunks: [{ timestamp: [0, 1] }] })).toEqual([]);
  });
});
