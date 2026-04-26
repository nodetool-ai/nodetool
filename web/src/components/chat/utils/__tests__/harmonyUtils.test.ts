import {
  parseHarmonyContent,
  hasHarmonyTokens,
  getDisplayContent,
  HarmonyMessage
} from "../harmonyUtils";

describe("harmonyUtils", () => {
  describe("parseHarmonyContent", () => {
    it("returns empty messages and raw text for plain content", () => {
      const result = parseHarmonyContent("Hello world");
      expect(result.messages).toEqual([]);
      expect(result.rawText).toBe("Hello world");
    });

    it("parses a single Harmony message with channel", () => {
      const content =
        '<|start|>assistant<|channel|>final<|message|>Hello<|end|>';
      const result = parseHarmonyContent(content);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({
        role: "assistant",
        channel: "final",
        content: "Hello"
      });
      expect(result.rawText).toBe("");
    });

    it("parses a message without channel", () => {
      const content = "<|start|>user<|message|>How are you?<|end|>";
      const result = parseHarmonyContent(content);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].channel).toBeUndefined();
      expect(result.messages[0].content).toBe("How are you?");
    });

    it("parses multiple messages", () => {
      const content =
        "<|start|>assistant<|channel|>analysis<|message|>Thinking...<|end|>" +
        "<|start|>assistant<|channel|>final<|message|>Here is the answer.<|end|>";
      const result = parseHarmonyContent(content);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].channel).toBe("analysis");
      expect(result.messages[0].content).toBe("Thinking...");
      expect(result.messages[1].channel).toBe("final");
      expect(result.messages[1].content).toBe("Here is the answer.");
    });

    it("preserves text outside Harmony tokens as rawText", () => {
      const content =
        "Preamble <|start|>assistant<|message|>body<|end|> epilogue";
      const result = parseHarmonyContent(content);

      expect(result.messages).toHaveLength(1);
      expect(result.rawText).toBe("Preamble  epilogue");
    });

    it("returns empty string rawText when all content is parsed", () => {
      const content = "<|start|>system<|message|>init<|end|>";
      const result = parseHarmonyContent(content);
      expect(result.rawText).toBe("");
    });

    it("handles multiline message content", () => {
      const content =
        "<|start|>assistant<|channel|>final<|message|>Line 1\nLine 2\nLine 3<|end|>";
      const result = parseHarmonyContent(content);

      expect(result.messages[0].content).toBe("Line 1\nLine 2\nLine 3");
    });
  });

  describe("hasHarmonyTokens", () => {
    it("returns true for content with <|start|>", () => {
      expect(hasHarmonyTokens("prefix <|start|> suffix")).toBe(true);
    });

    it("returns true for content with <|end|>", () => {
      expect(hasHarmonyTokens("prefix <|end|> suffix")).toBe(true);
    });

    it("returns true for content with <|message|>", () => {
      expect(hasHarmonyTokens("<|message|>hello")).toBe(true);
    });

    it("returns true for content with <|channel|>", () => {
      expect(hasHarmonyTokens("<|channel|>final")).toBe(true);
    });

    it("returns false for plain text", () => {
      expect(hasHarmonyTokens("Just regular text")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(hasHarmonyTokens("")).toBe(false);
    });

    it("returns false for similar but non-matching tokens", () => {
      expect(hasHarmonyTokens("<start> <end> <message>")).toBe(false);
    });
  });

  describe("getDisplayContent", () => {
    it("returns content for messages with no channel", () => {
      const msg: HarmonyMessage = {
        role: "assistant",
        content: "Hello"
      };
      expect(getDisplayContent(msg)).toBe("Hello");
    });

    it("returns content for 'final' channel", () => {
      const msg: HarmonyMessage = {
        role: "assistant",
        channel: "final",
        content: "Final answer"
      };
      expect(getDisplayContent(msg)).toBe("Final answer");
    });

    it("returns content for 'analysis' channel", () => {
      const msg: HarmonyMessage = {
        role: "assistant",
        channel: "analysis",
        content: "Analyzing..."
      };
      expect(getDisplayContent(msg)).toBe("Analyzing...");
    });

    it("returns content for 'commentary' channel", () => {
      const msg: HarmonyMessage = {
        role: "assistant",
        channel: "commentary",
        content: "Side note"
      };
      expect(getDisplayContent(msg)).toBe("Side note");
    });
  });
});
