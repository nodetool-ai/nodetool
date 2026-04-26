import { isAudioChunkLike, isTextLikeChunk } from "../outputChunkUtils";

describe("OutputRenderer chunk classification", () => {
  it("detects Whisper-style audio chunks", () => {
    expect(
      isAudioChunkLike({
        timestamp: [0, 1.25],
        text: "hello world"
      })
    ).toBe(true);
  });

  it("rejects malformed Whisper-style audio chunks", () => {
    expect(
      isAudioChunkLike({
        timestamp: [0],
        text: "hello world"
      })
    ).toBe(false);
  });

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
