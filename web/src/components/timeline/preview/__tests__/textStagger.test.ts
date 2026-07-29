/**
 * Per-word staggered text animation: rasterizer draw + cache policy, and the
 * scene model's stagger context / redraw-gate behavior.
 */
import type { ClipTextStyle, TimelineClip } from "@nodetool-ai/timeline";
import { compileClipAnimations } from "@nodetool-ai/timeline";

import { TextRasterizer } from "../textRender";
import {
  createAnimationCompileCache,
  hasActiveAnimation,
  resolveAnimatedLayerProps,
  resolveTextStaggerContext,
  type ActiveLayer
} from "../sceneModel";

const CANVAS = { width: 1920, height: 1080 };

const STYLE: ClipTextStyle = {
  text: "Hello brave world",
  fontSizePx: 72,
  color: "#ffffff",
  align: "center"
};

// fade-in over 400ms, 100ms per-word offset → word i window [i*100, i*100+400].
function compiledStagger(offsetMs = 100) {
  return compileClipAnimations(
    [
      {
        id: "a1",
        role: "in",
        preset: "fade",
        durationMs: 400,
        easing: "linear",
        stagger: { unit: "word", offsetMs }
      }
    ],
    5000,
    CANVAS,
    { staggerCount: 3 }
  );
}

function textClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "clip-1",
    trackId: "track-1",
    name: "Title",
    mediaType: "text",
    startMs: 1000,
    durationMs: 5000,
    status: "placeholder",
    textStyle: STYLE,
    animations: [
      {
        id: "a1",
        role: "in",
        preset: "fade",
        durationMs: 400,
        easing: "linear",
        stagger: { unit: "word", offsetMs: 100 }
      }
    ],
    ...overrides
  } as TimelineClip;
}

describe("TextRasterizer stagger", () => {
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  interface DrawnWord {
    text: string;
    alpha: number;
    translate: { x: number; y: number };
    scale: number;
  }
  let drawn: DrawnWord[];
  let bitmapCount: number;

  function makeContext() {
    let alpha = 1;
    let tx = 0;
    let ty = 0;
    let scale = 1;
    const stack: Array<{ alpha: number; tx: number; ty: number; scale: number }> =
      [];
    return {
      font: "",
      fillStyle: "",
      textAlign: "start",
      textBaseline: "alphabetic",
      set globalAlpha(v: number) {
        alpha = v;
      },
      get globalAlpha() {
        return alpha;
      },
      measureText: (text: string) => ({ width: text.length * 10 }),
      save: () => stack.push({ alpha, tx, ty, scale }),
      restore: () => {
        const s = stack.pop();
        if (s) ({ alpha, tx, ty, scale } = s);
      },
      translate: (x: number, y: number) => {
        tx += x;
        ty += y;
      },
      rotate: () => undefined,
      scale: (s: number) => {
        scale *= s;
      },
      fillText: (text: string) => {
        drawn.push({ text, alpha, translate: { x: tx, y: ty }, scale });
      }
    };
  }

  beforeEach(() => {
    drawn = [];
    bitmapCount = 0;
    class FakeOffscreenCanvas {
      getContext() {
        return makeContext();
      }

      transferToImageBitmap() {
        bitmapCount += 1;
        return { close: jest.fn() } as unknown as ImageBitmap;
      }
    }
    globalThis.OffscreenCanvas =
      FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
  });

  afterAll(() => {
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  });

  it("draws each word with its own sample mid-stagger", () => {
    const rasterizer = new TextRasterizer();
    // localMs 200: word0 t=0.5, word1 t=0.25, word2 t=0 (invisible, skipped).
    rasterizer.rasterize(STYLE, 1920, 1080, {
      compiled: compiledStagger(),
      localMs: 200
    });

    expect(drawn.map((w) => w.text)).toEqual(["Hello", "brave"]);
    expect(drawn[0].alpha).toBeCloseTo(0.5, 6);
    expect(drawn[1].alpha).toBeCloseTo(0.25, 6);

    // Word centers on one line: "Hello brave world" is 170px at 10px/char
    // (3×50 + 2×10 spaces), centered → left edge (1920-170)/2 = 875; word 0
    // center 875+25, word 1 starts at 875+50+10 with center +25.
    expect(drawn[0].translate).toEqual({ x: 900, y: 540 });
    expect(drawn[1].translate).toEqual({ x: 960, y: 540 });
    rasterizer.dispose();
  });

  it("draws all words at full opacity after the stagger completes", () => {
    const rasterizer = new TextRasterizer();
    rasterizer.rasterize(STYLE, 1920, 1080, {
      compiled: compiledStagger(),
      localMs: 4000
    });
    expect(drawn.map((w) => w.alpha)).toEqual([1, 1, 1]);
    rasterizer.dispose();
  });

  it("bypasses the cache during the window and caches held frames outside it", () => {
    const rasterizer = new TextRasterizer();
    const compiled = compiledStagger();

    // Active window (span [0, 600]): every new time re-rasterizes, but a
    // paused playhead re-requesting the same time reuses the frame.
    const mid = rasterizer.rasterize(STYLE, 1920, 1080, {
      compiled,
      localMs: 200
    });
    expect(
      rasterizer.rasterize(STYLE, 1920, 1080, { compiled, localMs: 200 })
    ).toBe(mid);
    expect(bitmapCount).toBe(1);
    rasterizer.rasterize(STYLE, 1920, 1080, { compiled, localMs: 216 });
    expect(bitmapCount).toBe(2);

    // After the span: static frame, cached.
    const a = rasterizer.rasterize(STYLE, 1920, 1080, { compiled, localMs: 700 });
    const b = rasterizer.rasterize(STYLE, 1920, 1080, { compiled, localMs: 900 });
    expect(b).toBe(a);
    expect(bitmapCount).toBe(3);

    // Un-staggered draws keep their own cache entry.
    const plain = rasterizer.rasterize(STYLE, 1920, 1080);
    expect(rasterizer.rasterize(STYLE, 1920, 1080)).toBe(plain);
    expect(plain).not.toBe(a);
    rasterizer.dispose();
  });
});

describe("scene model stagger integration", () => {
  it("resolveTextStaggerContext returns compiled animations and clip-local time", () => {
    const clip = textClip();
    const ctx = resolveTextStaggerContext(clip, 1200, CANVAS);
    expect(ctx).not.toBeNull();
    expect(ctx?.localMs).toBe(200);
    expect(ctx?.compiled.some((a) => a.stagger)).toBe(true);
  });

  it("returns null for non-text clips and un-staggered text", () => {
    expect(
      resolveTextStaggerContext(
        textClip({ mediaType: "video" } as Partial<TimelineClip>),
        1200,
        CANVAS
      )
    ).toBeNull();
    const plain = textClip();
    plain.animations = [
      { id: "a1", role: "in", preset: "fade", durationMs: 400 }
    ];
    expect(resolveTextStaggerContext(plain, 1200, CANVAS)).toBeNull();
  });

  it("block-level resolve leaves a staggered animation's opacity to the raster", () => {
    const clip = textClip();
    const resolved = resolveAnimatedLayerProps(
      { clip, transform: undefined, opacity: 1 },
      1200,
      CANVAS
    );
    // The staggered fade must not dim the whole block.
    expect(resolved.opacity).toBe(1);
  });

  it("hasActiveAnimation stays true through the stretched stagger span", () => {
    const clip = textClip();
    const layer = {
      kind: "text",
      clip,
      clipId: clip.id,
      trackIndex: 0,
      blendMode: "normal",
      opacity: 1,
      assetId: undefined,
      textStyle: STYLE
    } as ActiveLayer;
    const cache = createAnimationCompileCache();
    // Span is 400 + 2*100 = 600ms from clip start (1000ms absolute).
    expect(hasActiveAnimation([layer], 1500, CANVAS, cache)).toBe(true);
    expect(hasActiveAnimation([layer], 1700, CANVAS, cache)).toBe(false);
  });
});
