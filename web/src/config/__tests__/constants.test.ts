/**
 * @jest-environment node
 */
import {
  IMAGE_SIZE_PRESETS,
  VERSION,
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY,
  NOTIFICATION_TIMEOUT_DEFAULT,
  NOTIFICATION_TIMEOUT_MIN,
  NOTIFICATION_TIMEOUT_MAX,
  MIN_ZOOM,
  MAX_ZOOM,
  DUPLICATE_SPACING,
  HEADER_HEIGHT,
  TOOLBAR_WIDTH
} from "../constants";
import type { PresetOption } from "../constants";

describe("IMAGE_SIZE_PRESETS", () => {
  it("is a non-empty array", () => {
    expect(IMAGE_SIZE_PRESETS.length).toBeGreaterThan(0);
  });

  it("every preset has positive width and height", () => {
    for (const p of IMAGE_SIZE_PRESETS) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
  });

  it("every preset has a non-empty label, aspectRatio, and category", () => {
    for (const p of IMAGE_SIZE_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.aspectRatio.length).toBeGreaterThan(0);
      expect(p.category.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate labels", () => {
    const labels = IMAGE_SIZE_PRESETS.map((p: PresetOption) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("includes standard resolutions", () => {
    const labels = IMAGE_SIZE_PRESETS.map((p: PresetOption) => p.label);
    expect(labels).toContain("1080p Full HD");
    expect(labels).toContain("4K UHD");
    expect(labels).toContain("Instagram Post");
  });

  it("Instagram Post is square", () => {
    const instagram = IMAGE_SIZE_PRESETS.find(
      (p: PresetOption) => p.label === "Instagram Post"
    );
    expect(instagram).toBeDefined();
    expect(instagram!.width).toBe(instagram!.height);
  });
});

describe("numeric constants", () => {
  it("VERSION matches semver pattern", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("tooltip delays are positive and enterNext < enter", () => {
    expect(TOOLTIP_ENTER_DELAY).toBeGreaterThan(0);
    expect(TOOLTIP_ENTER_NEXT_DELAY).toBeGreaterThan(0);
    expect(TOOLTIP_ENTER_NEXT_DELAY).toBeLessThan(TOOLTIP_ENTER_DELAY);
  });

  it("notification timeout min < default < max", () => {
    expect(NOTIFICATION_TIMEOUT_MIN).toBeLessThan(NOTIFICATION_TIMEOUT_DEFAULT);
    expect(NOTIFICATION_TIMEOUT_DEFAULT).toBeLessThan(NOTIFICATION_TIMEOUT_MAX);
  });

  it("zoom range is valid", () => {
    expect(MIN_ZOOM).toBeGreaterThan(0);
    expect(MIN_ZOOM).toBeLessThan(1);
    expect(MAX_ZOOM).toBeGreaterThan(1);
  });

  it("layout constants are positive", () => {
    expect(DUPLICATE_SPACING).toBeGreaterThan(0);
    expect(HEADER_HEIGHT).toBeGreaterThan(0);
    expect(TOOLBAR_WIDTH).toBeGreaterThan(0);
  });
});
