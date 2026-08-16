/**
 * @jest-environment node
 */
import {
  resolveImageSize,
  deriveImageSizePreset,
  IMAGE_ASPECT_RATIOS,
  VIDEO_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  VIDEO_RESOLUTIONS,
  IMAGE_RESOLUTION_TO_PIXELS,
  VIDEO_DURATIONS,
  IMAGE_VARIATIONS,
  DEFAULT_TTS_VOICES,
  AUDIO_SPEEDS,
  AUDIO_FORMATS,
  IMAGE_EDIT_STRENGTHS,
  INFERENCE_STEPS,
} from "../MediaGenerationStore";

describe("resolveImageSize", () => {
  it("returns square dimensions for 1:1 aspect ratio", () => {
    const size = resolveImageSize("1K", "1:1");
    expect(size).toEqual({ width: 1024, height: 1024 });
  });

  it("returns landscape dimensions for 16:9 aspect ratio", () => {
    const size = resolveImageSize("1K", "16:9");
    expect(size.width).toBeGreaterThan(size.height);
    expect(size.height).toBe(1024);
    expect(size.width).toBe(Math.round((1024 * 16) / 9));
  });

  it("returns portrait dimensions for 9:16 aspect ratio", () => {
    const size = resolveImageSize("1K", "9:16");
    expect(size.height).toBeGreaterThan(size.width);
    expect(size.width).toBe(1024);
    expect(size.height).toBe(Math.round((1024 * 16) / 9));
  });

  it("scales with 2K resolution", () => {
    const size = resolveImageSize("2K", "1:1");
    expect(size).toEqual({ width: 2048, height: 2048 });
  });

  it("scales with 4K resolution", () => {
    const size = resolveImageSize("4K", "1:1");
    expect(size).toEqual({ width: 4096, height: 4096 });
  });

  it("falls back to square when aspect ratio is not found", () => {
    const size = resolveImageSize("1K", "unknown");
    expect(size).toEqual({ width: 1024, height: 1024 });
  });

  it("parses an arbitrary W:H ratio outside the preset list", () => {
    // A model may report a ratio the static IMAGE_ASPECT_RATIOS list lacks;
    // the canvas must still match instead of collapsing to a square.
    const landscape = resolveImageSize("1K", "12:5");
    expect(landscape.height).toBe(1024);
    expect(landscape.width).toBe(Math.round((1024 * 12) / 5));

    const portrait = resolveImageSize("1K", "5:12");
    expect(portrait.width).toBe(1024);
    expect(portrait.height).toBe(Math.round((1024 * 12) / 5));
  });

  it("handles all standard aspect ratios without error", () => {
    for (const ar of IMAGE_ASPECT_RATIOS) {
      const size = resolveImageSize("1K", ar.id);
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });

  it("handles 4:3 aspect ratio correctly", () => {
    const size = resolveImageSize("1K", "4:3");
    expect(size.height).toBe(1024);
    expect(size.width).toBe(Math.round((1024 * 4) / 3));
  });

  it("handles 3:4 portrait aspect ratio correctly", () => {
    const size = resolveImageSize("1K", "3:4");
    expect(size.width).toBe(1024);
    expect(size.height).toBe(Math.round((1024 * 4) / 3));
  });
});

describe("deriveImageSizePreset", () => {
  /** The catalog carries both orientations of every entry except 21:9. */
  const transposeOf = new Map(
    IMAGE_ASPECT_RATIOS.flatMap((a) => {
      const mirror = IMAGE_ASPECT_RATIOS.find(
        (b) => b.width === a.height && b.height === a.width
      );
      return mirror ? [[a.id, mirror.id] as const] : [];
    })
  );

  it("inverts resolveImageSize for every catalog pair", () => {
    for (const resolution of IMAGE_RESOLUTIONS) {
      for (const ar of IMAGE_ASPECT_RATIOS) {
        const { width, height } = resolveImageSize(resolution, ar.id);
        expect(deriveImageSizePreset(width, height)).toEqual({
          aspectRatio: ar.id,
          resolution
        });
      }
    }
  });

  it("gives a rotated canvas the mirrored preset", () => {
    // 1148x1024 sits just inside the 1:1 side of the 1:1 / 5:4 boundary, near
    // enough that measuring the gap in raw ratios splits the two orientations.
    expect(deriveImageSizePreset(1148, 1024).aspectRatio).toBe(
      transposeOf.get(deriveImageSizePreset(1024, 1148).aspectRatio)
    );

    for (let width = 200; width <= 4000; width += 1) {
      const landscape = deriveImageSizePreset(width, 1024).aspectRatio;
      const portrait = deriveImageSizePreset(1024, width).aspectRatio;
      // 21:9 has no 9:21 partner, so an ultra-wide box and its rotation cannot
      // mirror — that is the catalog's shape, not the matcher's.
      if (landscape === "21:9" || portrait === "21:9") continue;
      expect({ width, portrait }).toEqual({
        width,
        portrait: transposeOf.get(landscape)
      });
    }
  });

  it("picks the nearer of two neighbouring presets", () => {
    const cases: Array<[number, number, string]> = [
      [1024, 1024, "1:1"],
      [1920, 1080, "16:9"],
      [3840, 2160, "16:9"],
      [1080, 1920, "9:16"],
      [1024, 768, "4:3"],
      [768, 1024, "3:4"],
      [2560, 1080, "21:9"],
      [1200, 1000, "5:4"],
      [1000, 1200, "4:5"],
      // Just inside each side of the 1:1 / 5:4 boundary (geometric mean of
      // 1 and 1.25 is 1.1180).
      [1140, 1024, "1:1"],
      [1150, 1024, "5:4"],
      [1024, 1140, "1:1"],
      [1024, 1150, "4:5"]
    ];
    for (const [width, height, aspectRatio] of cases) {
      expect({
        width,
        height,
        aspectRatio: deriveImageSizePreset(width, height).aspectRatio
      }).toEqual({ width, height, aspectRatio });
    }
  });

  it("rounds the resolution at the midpoint between two bases", () => {
    const cases: Array<[number, string]> = [
      [1, "1K"],
      [1024, "1K"],
      [1535, "1K"],
      [1536, "2K"],
      [2048, "2K"],
      [3071, "2K"],
      [3072, "4K"],
      [4096, "4K"],
      [8192, "4K"]
    ];
    for (const [shortEdge, resolution] of cases) {
      expect(deriveImageSizePreset(shortEdge, shortEdge * 2).resolution).toBe(
        resolution
      );
      expect(deriveImageSizePreset(shortEdge * 2, shortEdge).resolution).toBe(
        resolution
      );
    }
  });

  it("falls back to the square for a box with no shape", () => {
    // `?? 1024` at the call sites only guards null/undefined, so a stored
    // width of 0 reaches here. A zero, negative or non-finite edge has no
    // aspect ratio to be near.
    const degenerate: Array<[number, number]> = [
      [0, 0],
      [0, 1024],
      [1024, 0],
      [-1024, 1024],
      [1024, -1024],
      [NaN, 1024],
      [1024, NaN],
      [Infinity, 1024],
      [1024, Infinity]
    ];
    for (const [width, height] of degenerate) {
      expect({ width, height, ...deriveImageSizePreset(width, height) }).toEqual(
        {
          width,
          height,
          aspectRatio: "1:1",
          resolution: "1K"
        }
      );
    }
  });

  it("only ever returns a catalog aspect id and resolution", () => {
    const ids = new Set(IMAGE_ASPECT_RATIOS.map((a) => a.id));
    for (let width = 1; width <= 5000; width += 7) {
      for (const height of [1, 333, 1024, 2048, 5000]) {
        const preset = deriveImageSizePreset(width, height);
        expect(ids.has(preset.aspectRatio)).toBe(true);
        expect(IMAGE_RESOLUTIONS).toContain(preset.resolution);
      }
    }
  });
});

describe("MediaGenerationStore constants", () => {
  it("IMAGE_ASPECT_RATIOS are well-formed", () => {
    expect(IMAGE_ASPECT_RATIOS.length).toBeGreaterThan(0);
    IMAGE_ASPECT_RATIOS.forEach((ar) => {
      expect(ar.id).toBeTruthy();
      expect(ar.label).toBeTruthy();
      expect(ar.width).toBeGreaterThan(0);
      expect(ar.height).toBeGreaterThan(0);
    });
  });

  it("VIDEO_ASPECT_RATIOS are well-formed", () => {
    expect(VIDEO_ASPECT_RATIOS.length).toBeGreaterThan(0);
    VIDEO_ASPECT_RATIOS.forEach((ar) => {
      expect(ar.id).toBeTruthy();
      expect(ar.width).toBeGreaterThan(0);
      expect(ar.height).toBeGreaterThan(0);
    });
  });

  it("IMAGE_RESOLUTIONS match IMAGE_RESOLUTION_TO_PIXELS keys", () => {
    IMAGE_RESOLUTIONS.forEach((res) => {
      expect(IMAGE_RESOLUTION_TO_PIXELS[res]).toBeDefined();
      expect(IMAGE_RESOLUTION_TO_PIXELS[res]).toBeGreaterThan(0);
    });
  });

  it("VIDEO_RESOLUTIONS has entries", () => {
    expect(VIDEO_RESOLUTIONS.length).toBeGreaterThan(0);
  });

  it("VIDEO_DURATIONS are positive", () => {
    VIDEO_DURATIONS.forEach((d) => expect(d).toBeGreaterThan(0));
  });

  it("IMAGE_VARIATIONS are positive", () => {
    IMAGE_VARIATIONS.forEach((v) => expect(v).toBeGreaterThan(0));
  });

  it("DEFAULT_TTS_VOICES has entries", () => {
    expect(DEFAULT_TTS_VOICES.length).toBeGreaterThan(0);
    DEFAULT_TTS_VOICES.forEach((v) => expect(v).toEqual(expect.any(String)));
  });

  it("AUDIO_SPEEDS are positive", () => {
    AUDIO_SPEEDS.forEach((s) => expect(s).toBeGreaterThan(0));
  });

  it("AUDIO_FORMATS has entries", () => {
    expect(AUDIO_FORMATS.length).toBeGreaterThan(0);
  });

  it("IMAGE_EDIT_STRENGTHS are between 0 and 1", () => {
    IMAGE_EDIT_STRENGTHS.forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });
  });

  it("INFERENCE_STEPS are positive integers", () => {
    INFERENCE_STEPS.forEach((s) => {
      expect(s).toBeGreaterThan(0);
      expect(Number.isInteger(s)).toBe(true);
    });
  });
});

describe("MediaGenerationStore Zustand store", () => {
  it("can be imported and has default state", async () => {
    const mod = await import("../MediaGenerationStore");
    const store = mod.default;
    const state = store.getState();
    expect(state.mode).toBe("chat");
    expect(state.image).toBeDefined();
    expect(state.video).toBeDefined();
    expect(state.audio).toBeDefined();
    expect(state.imageEdit).toBeDefined();
    expect(state.imageToVideo).toBeDefined();
  });

  it("setMode changes the mode", async () => {
    const mod = await import("../MediaGenerationStore");
    const store = mod.default;
    store.getState().setMode("image");
    expect(store.getState().mode).toBe("image");
    store.getState().setMode("chat");
  });

  it("setImageParams merges partial params", async () => {
    const mod = await import("../MediaGenerationStore");
    const store = mod.default;
    const original = store.getState().image;
    store.getState().setImageParams({ resolution: "2K" });
    expect(store.getState().image.resolution).toBe("2K");
    expect(store.getState().image.aspectRatio).toBe(original.aspectRatio);
    store.getState().setImageParams({ resolution: "1K" });
  });

  it("setVideoParams merges partial params", async () => {
    const mod = await import("../MediaGenerationStore");
    const store = mod.default;
    store.getState().setVideoParams({ duration: 5 });
    expect(store.getState().video.duration).toBe(5);
    store.getState().setVideoParams({ duration: 8 });
  });

  it("setAudioParams merges partial params", async () => {
    const mod = await import("../MediaGenerationStore");
    const store = mod.default;
    store.getState().setAudioParams({ voice: "nova" });
    expect(store.getState().audio.voice).toBe("nova");
    store.getState().setAudioParams({ voice: "alloy" });
  });

  it("setImageEditParams merges partial params", async () => {
    const mod = await import("../MediaGenerationStore");
    const store = mod.default;
    store.getState().setImageEditParams({ strength: 0.5 });
    expect(store.getState().imageEdit.strength).toBe(0.5);
    store.getState().setImageEditParams({ strength: 0.65 });
  });

  it("setImageToVideoParams merges partial params", async () => {
    const mod = await import("../MediaGenerationStore");
    const store = mod.default;
    store.getState().setImageToVideoParams({ duration: 6 });
    expect(store.getState().imageToVideo.duration).toBe(6);
    store.getState().setImageToVideoParams({ duration: 4 });
  });
});
