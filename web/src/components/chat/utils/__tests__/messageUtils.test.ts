import { describe, expect, it } from "@jest/globals";
import { stripContextContent, parseThoughtContent, getMessageClass } from "../messageUtils";

describe("stripContextContent", () => {
  it("removes editor_context block with closing tag", () => {
    const input = "<editor_context>some context here</editor_context>Hello world";
    expect(stripContextContent(input)).toBe("Hello world");
  });

  it("removes editor_context block without closing tag (ends at double newline)", () => {
    const input = "<editor_context>some context\n\nHello world";
    expect(stripContextContent(input)).toBe("Hello world");
  });

  it("removes legacy context block", () => {
    const input = "<context>old context</context>Remaining text";
    expect(stripContextContent(input)).toBe("Remaining text");
  });

  it("returns content unchanged when no context tags present", () => {
    const input = "Just a normal message";
    expect(stripContextContent(input)).toBe("Just a normal message");
  });

  it("handles empty string", () => {
    expect(stripContextContent("")).toBe("");
  });

  it("strips leading whitespace after removing context", () => {
    const input = "<editor_context>ctx</editor_context>  \n  Content";
    expect(stripContextContent(input).startsWith("Content")).toBe(true);
  });
});

describe("parseThoughtContent", () => {
  it("parses think block with closing tag", () => {
    const input = "Before<think>My thought</think>After";
    const result = parseThoughtContent(input);
    expect(result).not.toBeNull();
    expect(result!.thoughtContent).toBe("My thought");
    expect(result!.hasClosingTag).toBe(true);
    expect(result!.textBeforeThought).toBe("Before");
    expect(result!.textAfterThought).toBe("After");
  });

  it("parses think block with redacted_thinking closing tag", () => {
    const input = "<think>Redacted thought</redacted_thinking>After";
    const result = parseThoughtContent(input);
    expect(result).not.toBeNull();
    expect(result!.thoughtContent).toBe("Redacted thought");
    expect(result!.hasClosingTag).toBe(true);
    expect(result!.textAfterThought).toBe("After");
  });

  it("parses think block without closing tag (streaming)", () => {
    const input = "<think>Partial thought still streaming";
    const result = parseThoughtContent(input);
    expect(result).not.toBeNull();
    expect(result!.thoughtContent).toBe("Partial thought still streaming");
    expect(result!.hasClosingTag).toBe(false);
    expect(result!.textAfterThought).toBe("");
  });

  it("returns null when no think tag present", () => {
    expect(parseThoughtContent("No thinking here")).toBeNull();
  });

  it("handles empty think block", () => {
    const result = parseThoughtContent("<think></think>");
    expect(result).not.toBeNull();
    expect(result!.thoughtContent).toBe("");
    expect(result!.hasClosingTag).toBe(true);
  });

  it("handles multiline thought content", () => {
    const input = "<think>Line 1\nLine 2\nLine 3</think>";
    const result = parseThoughtContent(input);
    expect(result).not.toBeNull();
    expect(result!.thoughtContent).toBe("Line 1\nLine 2\nLine 3");
  });
});

describe("getMessageClass", () => {
  it("returns user class for user role", () => {
    expect(getMessageClass("user")).toBe("chat-message user");
  });

  it("returns assistant class for assistant role", () => {
    expect(getMessageClass("assistant")).toBe("chat-message assistant");
  });

  it("returns base class for unknown role", () => {
    expect(getMessageClass("system")).toBe("chat-message");
  });

  it("returns base class for empty string", () => {
    expect(getMessageClass("")).toBe("chat-message");
  });
});
