import {
  NODE_COLOR_LABELS,
  NODE_COLOR_OPTIONS,
  getNodeColorLabel,
  DEFAULT_NODE_COLOR
} from "../../config/nodeColors";

describe("nodeColors", () => {
  describe("NODE_COLOR_LABELS", () => {
    it("should have NONE option with undefined value", () => {
      expect(NODE_COLOR_LABELS.NONE.value).toBeUndefined();
      expect(NODE_COLOR_LABELS.NONE.label).toBe("Default");
    });

    it("should have color options with valid hex values", () => {
      const colorKeys = Object.keys(NODE_COLOR_LABELS);
      colorKeys.forEach((key) => {
        const colorOption = NODE_COLOR_LABELS[key as keyof typeof NODE_COLOR_LABELS];
        if (colorOption.value) {
          expect(colorOption.value).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
      });
    });

    it("should have 9 color options including NONE", () => {
      expect(Object.keys(NODE_COLOR_LABELS).length).toBe(9);
    });
  });

  describe("NODE_COLOR_OPTIONS", () => {
    it("should have same length as NODE_COLOR_LABELS", () => {
      expect(NODE_COLOR_OPTIONS.length).toBe(Object.keys(NODE_COLOR_LABELS).length);
    });

    it("should include key, label, value and description for each option", () => {
      NODE_COLOR_OPTIONS.forEach((option) => {
        expect(option).toHaveProperty("key");
        expect(option).toHaveProperty("label");
        expect(option).toHaveProperty("value");
        expect(option).toHaveProperty("description");
      });
    });

    it("should have NONE as first option", () => {
      expect(NODE_COLOR_OPTIONS[0].key).toBe("NONE");
    });
  });

  describe("getNodeColorLabel", () => {
    it("should return NONE for undefined color", () => {
      expect(getNodeColorLabel(undefined)).toBe("NONE");
    });

    it("should return correct label for each color", () => {
      Object.entries(NODE_COLOR_LABELS).forEach(([key, config]) => {
        if (config.value) {
          expect(getNodeColorLabel(config.value)).toBe(key);
        }
      });
    });

    it("should return NONE for unknown color", () => {
      expect(getNodeColorLabel("#000000")).toBe("NONE");
      expect(getNodeColorLabel("invalid")).toBe("NONE");
    });
  });

  describe("DEFAULT_NODE_COLOR", () => {
    it("should be undefined", () => {
      expect(DEFAULT_NODE_COLOR).toBeUndefined();
    });
  });
});
