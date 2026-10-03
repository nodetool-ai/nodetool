import {
  CAPTION_BITMAP_CACHE_BUDGET_BYTES,
  CaptionRasterizer,
  captionSignature
} from "../captionRender";
import type { ResolvedCaption } from "@nodetool-ai/timeline/render";
import { BitmapFrameScope } from "../BitmapFrameScope";
import { installGlobal, stub } from "../../../../test-utils/doubles";

describe("captionRender", () => {
  it("keeps every caption bitmap alive until a crowded frame is composited", () => {
    const original = globalThis.OffscreenCanvas;
    const bitmaps: ImageBitmap[] = [];
    class FakeOffscreenCanvas {
      constructor(
        private readonly w: number,
        private readonly h: number
      ) {}
      getContext() {
        return {
          measureText: (text: string) => ({ width: text.length * 8 }),
          strokeText: () => undefined,
          fillText: () => undefined
        };
      }
      transferToImageBitmap() {
        const bitmap = stub<ImageBitmap>({ width: this.w, height: this.h, close: jest.fn() });
        bitmaps.push(bitmap);
        return bitmap;
      }
    }
    installGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const rasterizer = new CaptionRasterizer();
    const frame = new BitmapFrameScope();
    try {
      for (let index = 0; index < 65; index++) {
        rasterizer.rasterize({ words: [{ text: `Caption ${index}`, active: true }] }, 1920, 1080, frame);
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

  it("caps resident bitmaps by bytes, not entry count (F30)", () => {
    const original = globalThis.OffscreenCanvas;
    const bitmaps: ImageBitmap[] = [];
    class FakeOffscreenCanvas {
      constructor(
        private readonly w: number,
        private readonly h: number
      ) {}
      getContext() {
        return {
          measureText: (text: string) => ({ width: text.length * 8 }),
          strokeText: () => undefined,
          fillText: () => undefined
        };
      }
      transferToImageBitmap() {
        const bitmap = stub<ImageBitmap>({ width: this.w, height: this.h, close: jest.fn() });
        bitmaps.push(bitmap);
        return bitmap;
      }
    }
    installGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const rasterizer = new CaptionRasterizer();
    try {
      // 4K frames are 33 MB each: the budget holds two, so 10 distinct
      // captions must leave only the newest two resident.
      for (let index = 0; index < 10; index++) {
        const frame = new BitmapFrameScope();
        rasterizer.rasterize({ words: [{ text: `Caption ${index}`, active: true }] }, 3840, 2160, frame);
        frame.release();
      }
      expect(rasterizer.residentBytes).toBeLessThanOrEqual(
        CAPTION_BITMAP_CACHE_BUDGET_BYTES
      );
      expect(bitmaps.filter((b) => (b.close as jest.Mock).mock.calls.length === 0)).toHaveLength(2);
      expect(bitmaps[9]!.close).not.toHaveBeenCalled();
    } finally {
      rasterizer.dispose();
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
