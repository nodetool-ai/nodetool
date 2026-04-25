import {
  stripContextContent,
  parseThoughtContent,
  getMessageClass
} from "../messageUtils";

describe("stripContextContent", () => {
  it("returns content unchanged when no context tags", () => {
    expect(stripContextContent("Hello world")).toBe("Hello world");
  });

  it("strips <context>...</context> tags", () => {
    const input = "<context>some context data</context>Actual message";
    expect(stripContextContent(input)).toBe("Actual message");
  });

  it("strips <editor_context>...</editor_context> tags", () => {
    const input = "<editor_context>editor data</editor_context>Real content";
    expect(stripContextContent(input)).toBe("Real content");
  });

  it("strips context without closing tag", () => {
    const input = "<context>some context\n\nActual content here";
    const result = stripContextContent(input);
    expect(result).not.toContain("<context>");
  });

  it("strips editor_context without closing tag", () => {
    const input = "<editor_context>some context\n\nActual content here";
    const result = stripContextContent(input);
    expect(result).not.toContain("<editor_context>");
  });

  it("handles empty string", () => {
    expect(stripContextContent("")).toBe("");
  });
});

describe("parseThoughtContent", () => {
  it("returns null when no think tags", () => {
    expect(parseThoughtContent("Just a regular message")).toBe(null);
  });

  it("parses complete think block", () => {
    const content = "Before<think>I'm thinking about this</think>After";
    const result = parseThoughtContent(content);
    expect(result).not.toBeNull();
    expect(result!.thoughtContent).toBe("I'm thinking about this");
    expect(result!.hasClosingTag).toBe(true);
    expect(result!.textBeforeThought).toBe("Before");
    expect(result!.textAfterThought).toBe("After");
  });

  it("parses incomplete think block (streaming)", () => {
    const content = "<think>Still thinking...";
    const result = parseThoughtContent(content);
    expect(result).not.toBeNull();
    expect(result!.thoughtContent).toBe("Still thinking...");
    expect(result!.hasClosingTag).toBe(false);
    expect(result!.textAfterThought).toBe("");
  });

  it("handles multiline thought content", () => {
    const content = "<think>Line 1\nLine 2\nLine 3</think>";
    const result = parseThoughtContent(content);
    expect(result).not.toBeNull();
    expect(result!.thoughtContent).toContain("Line 1");
    expect(result!.thoughtContent).toContain("Line 3");
    expect(result!.hasClosingTag).toBe(true);
  });

  it("handles empty think tags", () => {
    const content = "<think></think>response";
    const result = parseThoughtContent(content);
    expect(result).not.toBeNull();
    expect(result!.thoughtContent).toBe("");
    expect(result!.hasClosingTag).toBe(true);
    expect(result!.textAfterThought).toBe("response");
  });
});

describe("getMessageClass", () => {
  it("returns base class for unknown role", () => {
    expect(getMessageClass("system")).toBe("chat-message");
  });

  it("returns user class for user role", () => {
    expect(getMessageClass("user")).toBe("chat-message user");
  });

  it("returns assistant class for assistant role", () => {
    expect(getMessageClass("assistant")).toBe("chat-message assistant");
  });
});
