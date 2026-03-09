import { isTextLikeChunk } from "../outputChunkUtils";

describe("OutputRenderer chunk classification", () => {
  it("treats missing content_type as text for Python-style chunks", () => {
    expect(
      isTextLikeChunk({
        type: "chunk",
        content: "Hello",
        done: false,
      } as any)
    ).toBe(true);
  });

  it("treats explicit text content_type as text", () => {
    expect(
      isTextLikeChunk({
        type: "chunk",
        content: "Hello",
        content_type: "text",
        done: false,
      } as any)
    ).toBe(true);
  });

  it("does not treat audio chunks as text", () => {
    expect(
      isTextLikeChunk({
        type: "chunk",
        content: "AAA=",
        content_type: "audio",
        done: false,
      } as any)
    ).toBe(false);
  });
});
