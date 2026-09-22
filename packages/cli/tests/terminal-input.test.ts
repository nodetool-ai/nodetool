import { describe, expect, it } from "vitest";
import { editInput } from "../src/readline-input.js";

describe("terminal editor", () => {
  it("deletes forward without eating the character before the cursor", () => {
    expect(
      editInput({ value: "abcd", cursor: 2 }, "", { delete: true })
    ).toEqual({ value: "abd", cursor: 2 });
  });
  it("moves Home and End within a multiline prompt", () => {
    const input = { value: "first\nsecond\nthird", cursor: 9 };
    expect(editInput(input, "", { home: true }).cursor).toBe(6);
    expect(editInput(input, "", { end: true }).cursor).toBe(12);
  });
  it("inserts multiline paste without submitting or preserving terminal commands", () => {
    expect(
      editInput({ value: "abc", cursor: 1 }, "one\r\ntwo\u001b[2J", {})
    ).toEqual({ value: "aone\ntwobc", cursor: 8 });
  });
  it("adds a newline for Alt+Enter and Ctrl+J", () => {
    expect(
      editInput({ value: "ab", cursor: 1 }, "", { return: true, meta: true })
    ).toEqual({ value: "a\nb", cursor: 2 });
    expect(editInput({ value: "", cursor: 0 }, "j", { ctrl: true })).toEqual({
      value: "\n",
      cursor: 1
    });
  });
  it("edits whole graphemes including emoji and combining marks", () => {
    for (const value of ["a👩‍💻", "ae\u0301", "a🇳🇱"]) {
      expect(
        editInput({ value, cursor: value.length }, "", { backspace: true })
      ).toEqual({ value: "a", cursor: 1 });
    }
  });
  it("keeps reserved shortcut keys out of the prompt", () => {
    const state = { value: "hello", cursor: 2 };
    expect(editInput(state, "o", { ctrl: true })).toEqual(state);
    expect(editInput(state, "", { escape: true })).toEqual(state);
  });
});
