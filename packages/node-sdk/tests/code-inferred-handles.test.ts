import { describe, expect, it } from "vitest";
import {
  inferredCodeInputNames,
  inferredCodeOutputNames
} from "../src/code-analysis.js";

describe("inferredCodeInputNames", () => {
  it("returns nothing for empty or unparseable code", () => {
    expect(inferredCodeInputNames("")).toEqual([]);
    expect(inferredCodeInputNames("return { out: ")).toEqual([]);
  });

  it("reads names off the inputs object", () => {
    expect(
      inferredCodeInputNames("return { out: inputs.a + inputs.b };")
    ).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("includes stream handle names", () => {
    expect(
      inferredCodeInputNames(
        'for await (const x of stream("items")) { await emit("out", x * inputs.factor); }'
      )
    ).toEqual(expect.arrayContaining(["items", "factor"]));
  });

  it("skips Code node property names", () => {
    expect(inferredCodeInputNames("return { out: inputs.code + inputs.timeout };")).toEqual(
      []
    );
  });
});

describe("inferredCodeOutputNames", () => {
  it("reads keys of the last return object", () => {
    expect(inferredCodeOutputNames("return { sum: 1, upper: 2 };")).toEqual(
      expect.arrayContaining(["sum", "upper"])
    );
  });

  it("prefers emit/output names over a return object", () => {
    expect(
      inferredCodeOutputNames('await output("sum", 1);\nreturn { ignored: 2 };')
    ).toEqual(["sum"]);
  });

  it("returns nothing when the body names no outputs", () => {
    expect(inferredCodeOutputNames("const x = 1;")).toEqual([]);
  });
});
