import { describe, expect, it } from "vitest";
import { findViolations } from "../check-docs-prose.mjs";

describe("check-docs-prose", () => {
  it("flags banned adjectives in prose", () => {
    const text = "# Title\n\nA powerful editor that works seamlessly.\n";
    expect(findViolations(text)).toEqual([
      { line: 3, word: "powerful" },
      { line: 3, word: "seamlessly" },
    ]);
  });

  it("matches case-insensitively and across a line-wrapped phrase", () => {
    expect(findViolations("Next-Gen rendering is blazingly\tfast.")).toEqual([
      { line: 1, word: "Next-Gen" },
      { line: 1, word: "blazingly\tfast" },
    ]);
  });

  it("ignores fenced code, inline code, and HTML comments", () => {
    const text = [
      "Use `powerful` as a flag value.",
      "```",
      "seamless = true",
      "```",
      "<!-- intuitive -->",
      "<!--",
      "effortless",
      "-->",
      "Plain line.",
    ].join("\n");
    expect(findViolations(text)).toEqual([]);
  });

  it("checks text after a comment that spans lines", () => {
    expect(findViolations("<!-- note\nseamless --> but powerful")).toEqual([
      { line: 2, word: "powerful" },
    ]);
  });

  it("does not match words that only contain a banned word", () => {
    expect(findViolations("The empowerment-free seamlessness of supercharged-x.")).toEqual([]);
  });
});
