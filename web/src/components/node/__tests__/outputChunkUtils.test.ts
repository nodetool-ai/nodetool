import { isTextLikeChunk, isAudioChunkLike } from "../outputChunkUtils";
import type { Chunk } from "../../../stores/ApiTypes";

describe("outputChunkUtils", () => {
  describe("isTextLikeChunk", () => {
    it("returns true when content_type is undefined", () => {
      expect(isTextLikeChunk({ content_type: undefined } as Chunk)).toBe(true);
    });

    it("returns true when content_type is null", () => {
      expect(isTextLikeChunk({ content_type: null } as unknown as Chunk)).toBe(
        true
      );
    });

    it('returns true when content_type is empty string', () => {
      expect(isTextLikeChunk({ content_type: "" } as unknown as Chunk)).toBe(true);
    });

    it('returns true when content_type is "text"', () => {
      expect(isTextLikeChunk({ content_type: "text" } as Chunk)).toBe(true);
    });

    it('returns false when content_type is "audio"', () => {
      expect(isTextLikeChunk({ content_type: "audio" } as Chunk)).toBe(false);
    });

    it('returns false when content_type is "image"', () => {
      expect(isTextLikeChunk({ content_type: "image" } as Chunk)).toBe(false);
    });

    it("returns true for null chunk", () => {
      expect(isTextLikeChunk(null)).toBe(true);
    });

    it("returns true for undefined chunk", () => {
      expect(isTextLikeChunk(undefined)).toBe(true);
    });
  });

  describe("isAudioChunkLike", () => {
    it("returns true for valid audio chunk", () => {
      expect(
        isAudioChunkLike({ timestamp: [0, 1.5], text: "hello" })
      ).toBe(true);
    });

    it("returns false for null", () => {
      expect(isAudioChunkLike(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isAudioChunkLike(undefined)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(isAudioChunkLike("string")).toBe(false);
      expect(isAudioChunkLike(42)).toBe(false);
      expect(isAudioChunkLike(true)).toBe(false);
    });

    it("returns false for arrays", () => {
      expect(isAudioChunkLike([1, 2, 3])).toBe(false);
    });

    it("returns false when timestamp is not an array", () => {
      expect(isAudioChunkLike({ timestamp: "0:1", text: "hello" })).toBe(
        false
      );
    });

    it("returns false when timestamp has wrong length", () => {
      expect(isAudioChunkLike({ timestamp: [0], text: "hello" })).toBe(false);
      expect(
        isAudioChunkLike({ timestamp: [0, 1, 2], text: "hello" })
      ).toBe(false);
    });

    it("returns false when timestamp contains non-numbers", () => {
      expect(
        isAudioChunkLike({ timestamp: ["0", "1"], text: "hello" })
      ).toBe(false);
    });

    it("returns false when text is not a string", () => {
      expect(isAudioChunkLike({ timestamp: [0, 1], text: 42 })).toBe(false);
    });

    it("returns false when text is missing", () => {
      expect(isAudioChunkLike({ timestamp: [0, 1] })).toBe(false);
    });

    it("returns false when timestamp is missing", () => {
      expect(isAudioChunkLike({ text: "hello" })).toBe(false);
    });
  });
});
