import {
  DEVICE_WIDTHS,
  EFFECT_LABELS,
  AUDIO_EFFECT_TYPES,
  VIDEO_EFFECT_TYPES
} from "../trackEffectsConstants";

describe("trackEffectsConstants", () => {
  const allTypes = [...AUDIO_EFFECT_TYPES, ...VIDEO_EFFECT_TYPES];

  it("audio and video effect types do not overlap", () => {
    const audioSet = new Set(AUDIO_EFFECT_TYPES);
    for (const vt of VIDEO_EFFECT_TYPES) {
      expect(audioSet.has(vt)).toBe(false);
    }
  });

  it("every effect type has a device width", () => {
    for (const t of allTypes) {
      expect(DEVICE_WIDTHS[t]).toBeGreaterThan(0);
    }
  });

  it("every effect type has a human label", () => {
    for (const t of allTypes) {
      expect(typeof EFFECT_LABELS[t]).toBe("string");
      expect(EFFECT_LABELS[t].length).toBeGreaterThan(0);
    }
  });

  it("DEVICE_WIDTHS and EFFECT_LABELS cover the same keys", () => {
    const widthKeys = Object.keys(DEVICE_WIDTHS).sort();
    const labelKeys = Object.keys(EFFECT_LABELS).sort();
    expect(widthKeys).toEqual(labelKeys);
  });

  it("all map keys appear in either AUDIO or VIDEO arrays", () => {
    const allSet = new Set(allTypes);
    for (const key of Object.keys(DEVICE_WIDTHS)) {
      expect(allSet.has(key as (typeof allTypes)[number])).toBe(true);
    }
  });

  it("AUDIO_EFFECT_TYPES contains expected audio effects", () => {
    expect(AUDIO_EFFECT_TYPES).toContain("gain");
    expect(AUDIO_EFFECT_TYPES).toContain("eq3");
  });

  it("VIDEO_EFFECT_TYPES contains expected video effects", () => {
    expect(VIDEO_EFFECT_TYPES).toContain("colorCorrection");
    expect(VIDEO_EFFECT_TYPES).toContain("videoBlur");
  });
});
