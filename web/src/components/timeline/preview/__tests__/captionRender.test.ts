import { captionSignature } from "../captionRender";

describe("captionRender", () => {
  describe("captionSignature", () => {
    it("includes dimensions in the signature", () => {
      const caption = { words: [{ text: "hello", active: false }] };
      const sig = captionSignature(caption as any, 1920, 1080);
      expect(sig).toContain("1920x1080");
    });

    it("marks active words with an asterisk prefix", () => {
      const caption = {
        words: [
          { text: "hello", active: false },
          { text: "world", active: true },
        ],
      };
      const sig = captionSignature(caption as any, 800, 600);
      expect(sig).toContain("hello");
      expect(sig).toContain("*world");
      expect(sig).not.toContain("*hello");
    });

    it("produces identical signatures for identical content", () => {
      const caption = {
        words: [
          { text: "the", active: false },
          { text: "quick", active: true },
          { text: "fox", active: false },
        ],
      };
      const sig1 = captionSignature(caption as any, 1280, 720);
      const sig2 = captionSignature(caption as any, 1280, 720);
      expect(sig1).toBe(sig2);
    });

    it("produces different signatures for different active words", () => {
      const caption1 = {
        words: [
          { text: "hello", active: true },
          { text: "world", active: false },
        ],
      };
      const caption2 = {
        words: [
          { text: "hello", active: false },
          { text: "world", active: true },
        ],
      };
      const sig1 = captionSignature(caption1 as any, 800, 600);
      const sig2 = captionSignature(caption2 as any, 800, 600);
      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different dimensions", () => {
      const caption = { words: [{ text: "test", active: false }] };
      const sig1 = captionSignature(caption as any, 1920, 1080);
      const sig2 = captionSignature(caption as any, 1280, 720);
      expect(sig1).not.toBe(sig2);
    });

    it("handles empty words array", () => {
      const caption = { words: [] };
      const sig = captionSignature(caption as any, 800, 600);
      expect(sig).toContain("800x600");
    });

    it("handles single word", () => {
      const caption = { words: [{ text: "solo", active: true }] };
      const sig = captionSignature(caption as any, 640, 480);
      expect(sig).toContain("*solo");
    });
  });
});
