import { CaptionRasterizer, captionSignature } from "../captionRender";
import type { ResolvedCaption } from "@nodetool-ai/timeline/render";
import { BitmapFrameScope } from "../BitmapFrameScope";
import { installGlobal, stub } from "../../../../test-utils/doubles";

describe("captionRender", () => {
  it("keeps every caption bitmap alive until a crowded frame is composited", () => {
    const original = globalThis.OffscreenCanvas;
    const bitmaps: ImageBitmap[] = [];
    class FakeOffscreenCanvas {
      getContext() {
        return {
          measureText: (text: string) => ({ width: text.length * 8 }),
          strokeText: () => undefined,
          fillText: () => undefined
        };
      }
      transferToImageBitmap() {
        const bitmap = stub<ImageBitmap>({ width: 640, height: 360, close: jest.fn() });
        bitmaps.push(bitmap);
        return bitmap;
      }
    }
    installGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const rasterizer = new CaptionRasterizer();
    const frame = new BitmapFrameScope();
    try {
      for (let index = 0; index < 65; index++) {
        rasterizer.rasterize({ words: [{ text: `Caption ${index}`, active: true }] }, 640, 360, frame);
      }
      expect(bitmaps).toHaveLength(65);
      expect(bitmaps[0]!.close).not.toHaveBeenCalled();
      frame.release();
      expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
    } finally {
      rasterizer.dispose();
      frame.release();
      globalThis.OffscreenCanvas = original;
    }
  });

  describe("captionSignature", () => {
    it("includes dimensions in the signature", () => {
      const caption: ResolvedCaption = { words: [{ text: "hello", active: false }] };
      const sig = captionSignature(caption, 1920, 1080);
      expect(sig).toContain("1920x1080");
    });

    it("marks active words with an asterisk prefix", () => {
      const caption: ResolvedCaption = {
        words: [
          { text: "hello", active: false },
          { text: "world", active: true },
        ],
      };
      const sig = captionSignature(caption, 800, 600);
      expect(sig).toContain("hello");
      expect(sig).toContain("*world");
      expect(sig).not.toContain("*hello");
    });

    it("produces identical signatures for identical content", () => {
      const caption: ResolvedCaption = {
        words: [
          { text: "the", active: false },
          { text: "quick", active: true },
          { text: "fox", active: false },
        ],
      };
      const sig1 = captionSignature(caption, 1280, 720);
      const sig2 = captionSignature(caption, 1280, 720);
      expect(sig1).toBe(sig2);
    });

    it("produces different signatures for different active words", () => {
      const caption1: ResolvedCaption = {
        words: [
          { text: "hello", active: true },
          { text: "world", active: false },
        ],
      };
      const caption2: ResolvedCaption = {
        words: [
          { text: "hello", active: false },
          { text: "world", active: true },
        ],
      };
      const sig1 = captionSignature(caption1, 800, 600);
      const sig2 = captionSignature(caption2, 800, 600);
      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different dimensions", () => {
      const caption: ResolvedCaption = { words: [{ text: "test", active: false }] };
      const sig1 = captionSignature(caption, 1920, 1080);
      const sig2 = captionSignature(caption, 1280, 720);
      expect(sig1).not.toBe(sig2);
    });

    it("handles empty words array", () => {
      const caption: ResolvedCaption = { words: [] };
      const sig = captionSignature(caption, 800, 600);
      expect(sig).toContain("800x600");
    });

    it("handles single word", () => {
      const caption: ResolvedCaption = { words: [{ text: "solo", active: true }] };
      const sig = captionSignature(caption, 640, 480);
      expect(sig).toContain("*solo");
    });
  });
});
