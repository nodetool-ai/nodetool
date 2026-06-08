// @ts-nocheck
/**
 * Mutation-hardening for classNameToTitle's numeric-token merge: the merge
 * must fire only for *purely* numeric tokens, so tokens that merely start or
 * end with digits (V3-style) must not be joined with ".".
 */
import { describe, it, expect } from "vitest";
import { classNameToTitle } from "../src/class-name-to-title.js";

describe("classNameToTitle numeric-merge anchoring", () => {
  it("merges only adjacent purely-numeric tokens", () => {
    expect(classNameToTitle("GPT_4_1_Nano")).toBe("GPT 4.1 Nano");
    expect(classNameToTitle("Foo_Bar")).toBe("Foo Bar");
  });

  it("does not merge a token that only ends with digits", () => {
    expect(classNameToTitle("X2_3")).toBe("X2 3");
    expect(classNameToTitle("4_X2")).toBe("4 X2");
  });

  it("does not merge a token that only starts with digits", () => {
    expect(classNameToTitle("3D_4")).toBe("3D 4");
    expect(classNameToTitle("4_3D")).toBe("4 3D");
  });
});
