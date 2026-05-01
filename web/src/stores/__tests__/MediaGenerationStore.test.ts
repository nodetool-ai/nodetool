/**
 * @jest-environment node
 */
import {
  resolveImageSize,
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
    DEFAULT_TTS_VOICES.forEach((v) => expect(typeof v).toBe("string"));
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
