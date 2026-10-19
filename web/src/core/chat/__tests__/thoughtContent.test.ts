import {
  hasOpenThought,
  streamedChunkText,
  stripThoughtContent,
  thoughtBlocks
} from "../thoughtContent";

describe("thoughtContent", () => {
  it("opens a think block for the first reasoning chunk only", () => {
    expect(streamedChunkText("", "Hmm", true, false)).toBe("<think>Hmm");
    expect(streamedChunkText("<think>Hmm", " more", true, false)).toBe(" more");
  });

  it("closes the block when the answer starts or the stream ends", () => {
    expect(streamedChunkText("<think>Hmm", "Yes", false, false)).toBe(
      "</think>Yes"
    );
    expect(streamedChunkText("<think>Hmm", "", false, true)).toBe("</think>");
    expect(streamedChunkText("<think>Hmm", "", false, false)).toBe("");
  });

  it("leaves plain text alone", () => {
    expect(streamedChunkText("Hello", " world", false, false)).toBe(" world");
    expect(streamedChunkText("<think>a</think>b", "c", false, true)).toBe("c");
  });

  it("detects an open block", () => {
    expect(hasOpenThought("<think>a")).toBe(true);
    expect(hasOpenThought("<think>a</think>b")).toBe(false);
    expect(hasOpenThought("<think>a</redacted_thinking>b")).toBe(false);
    expect(hasOpenThought("plain")).toBe(false);
  });

  it("strips and extracts blocks", () => {
    const text = "<think>one</think>Answer<think>two";
    expect(stripThoughtContent(text)).toBe("Answer");
    expect(thoughtBlocks(text)).toBe("<think>one</think><think>two</think>");
    expect(thoughtBlocks("Answer")).toBe("");
  });
});
