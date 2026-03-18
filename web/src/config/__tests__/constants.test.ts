import {
  APP_NAME,
  VERSION,
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY,
  DEBUG_RENDER_LOGGING,
  NOTIFICATIONS_LIST_MAX_ITEMS,
  NOTIFICATION_TIMEOUT_DEFAULT,
  NOTIFICATION_TIMEOUT_SHORT,
  NOTIFICATION_TIMEOUT_MEDIUM,
  NOTIFICATION_TIMEOUT_JOB_COMPLETED,
  NOTIFICATION_TIMEOUT_WORKFLOW_SUSPENDED,
  CHAT_HISTORY_AMOUNT,
  DUPLICATE_SPACING,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOMED_OUT,
  DEFAULT_MODEL,
  SEARCH_DEBOUNCE_MS,
  FUSE_THRESHOLD,
  FUSE_MIN_MATCH_FACTOR,
  IMAGE_SIZE_PRESETS,
  PresetOption
} from "../constants";

describe("constants", () => {
  describe("APP", () => {
    it("should have a valid APP_NAME", () => {
      expect(APP_NAME).toBe("nodetool");
    });

    it("should have a valid VERSION string", () => {
      expect(typeof VERSION).toBe("string");
      expect(VERSION.length).toBeGreaterThan(0);
    });
  });

  describe("TOOLTIP constants", () => {
    it("should have valid tooltip delays", () => {
      expect(TOOLTIP_ENTER_DELAY).toBeGreaterThan(0);
      expect(TOOLTIP_LEAVE_DELAY).toBe(0);
      expect(TOOLTIP_ENTER_NEXT_DELAY).toBeGreaterThan(0);
      expect(TOOLTIP_ENTER_NEXT_DELAY).toBeLessThan(TOOLTIP_ENTER_DELAY);
    });
  });

  describe("NOTIFICATION constants", () => {
    it("should have a positive max items limit", () => {
      expect(NOTIFICATIONS_LIST_MAX_ITEMS).toBeGreaterThan(0);
    });

    it("should have timeouts in ascending order", () => {
      expect(NOTIFICATION_TIMEOUT_SHORT).toBeLessThan(
        NOTIFICATION_TIMEOUT_DEFAULT
      );
      expect(NOTIFICATION_TIMEOUT_DEFAULT).toBeLessThan(
        NOTIFICATION_TIMEOUT_MEDIUM
      );
      expect(NOTIFICATION_TIMEOUT_MEDIUM).toBeLessThan(
        NOTIFICATION_TIMEOUT_JOB_COMPLETED
      );
    });

    it("should have a workflow suspended timeout", () => {
      expect(NOTIFICATION_TIMEOUT_WORKFLOW_SUSPENDED).toBeGreaterThan(0);
    });
  });

  describe("EDITOR constants", () => {
    it("should have positive DUPLICATE_SPACING", () => {
      expect(DUPLICATE_SPACING).toBeGreaterThan(0);
    });

    it("should have valid zoom range", () => {
      expect(MIN_ZOOM).toBeGreaterThan(0);
      expect(MIN_ZOOM).toBeLessThan(1);
      expect(MAX_ZOOM).toBeGreaterThan(1);
      expect(ZOOMED_OUT).toBeGreaterThan(MIN_ZOOM);
      expect(ZOOMED_OUT).toBeLessThan(MAX_ZOOM);
    });
  });

  describe("CHAT constants", () => {
    it("should have a positive chat history amount", () => {
      expect(CHAT_HISTORY_AMOUNT).toBeGreaterThan(0);
    });
  });

  describe("MODEL constants", () => {
    it("should have a default model string", () => {
      expect(typeof DEFAULT_MODEL).toBe("string");
      expect(DEFAULT_MODEL.length).toBeGreaterThan(0);
    });
  });

  describe("SEARCH constants", () => {
    it("should have valid search debounce", () => {
      expect(SEARCH_DEBOUNCE_MS).toBeGreaterThan(0);
    });

    it("should have valid fuse thresholds", () => {
      expect(FUSE_THRESHOLD).toBeGreaterThan(0);
      expect(FUSE_THRESHOLD).toBeLessThanOrEqual(1);
      expect(FUSE_MIN_MATCH_FACTOR).toBeGreaterThan(0);
      expect(FUSE_MIN_MATCH_FACTOR).toBeLessThanOrEqual(1);
    });
  });

  describe("IMAGE_SIZE_PRESETS", () => {
    it("should be a non-empty array", () => {
      expect(Array.isArray(IMAGE_SIZE_PRESETS)).toBe(true);
      expect(IMAGE_SIZE_PRESETS.length).toBeGreaterThan(0);
    });

    it("all presets should have required properties", () => {
      IMAGE_SIZE_PRESETS.forEach((preset: PresetOption) => {
        expect(typeof preset.label).toBe("string");
        expect(preset.label.length).toBeGreaterThan(0);
        expect(typeof preset.width).toBe("number");
        expect(preset.width).toBeGreaterThan(0);
        expect(typeof preset.height).toBe("number");
        expect(preset.height).toBeGreaterThan(0);
        expect(typeof preset.aspectRatio).toBe("string");
        expect(preset.aspectRatio.length).toBeGreaterThan(0);
        expect(typeof preset.category).toBe("string");
        expect(preset.category.length).toBeGreaterThan(0);
      });
    });

    it("should have unique labels", () => {
      const labels = IMAGE_SIZE_PRESETS.map((p) => p.label);
      const uniqueLabels = new Set(labels);
      expect(labels.length).toBe(uniqueLabels.size);
    });

    it("should include common categories", () => {
      const categories = new Set(IMAGE_SIZE_PRESETS.map((p) => p.category));
      expect(categories.has("HD")).toBe(true);
      expect(categories.has("Social Media")).toBe(true);
    });
  });
});
