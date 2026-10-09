import { describe, expect, it } from "@jest/globals";
import { mayContainMath, normalizeMathDelimiters } from "../mathMarkdown";

describe("mayContainMath", () => {
  it("spots each delimiter a model writes", () => {
    expect(mayContainMath("$$E = mc^2$$")).toBe(true);
    expect(mayContainMath("where \\(x > 0\\)")).toBe(true);
    expect(mayContainMath("\\[\\int f\\]")).toBe(true);
  });

  it("ignores prices", () => {
    expect(mayContainMath("It costs $5, or $10 with shipping.")).toBe(false);
  });
});

describe("normalizeMathDelimiters", () => {
  it("turns \\( \\) into inline double-dollar math", () => {
    expect(normalizeMathDelimiters("where \\( x^2 \\) holds")).toBe(
      "where $$x^2$$ holds"
    );
  });

  it("turns \\[ \\] into a display block", () => {
    expect(normalizeMathDelimiters("so\\[a+b\\]done")).toBe(
      "so\n$$\na+b\n$$\ndone"
    );
  });

  it("makes a one-line $$ equation a display block", () => {
    expect(normalizeMathDelimiters("by\n\n$$E = mc^2$$\n\nwhere")).toBe(
      "by\n\n$$\nE = mc^2\n$$\n\nwhere"
    );
    expect(normalizeMathDelimiters("inline $$x$$ here")).toBe(
      "inline $$x$$ here"
    );
  });

  it("leaves code spans and fences as written", () => {
    const code = "`\\(x\\)` and\n```tex\n\\[y\\]\n```\n";
    expect(normalizeMathDelimiters(code)).toBe(code);
  });
});
