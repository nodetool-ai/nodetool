import {
  formatFileSize,
  getSizeCategory,
  SIZE_FILTERS
} from "./formatUtils";

describe("formatUtils", () => {
  describe("formatFileSize", () => {
    it("formats 0 bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
    });

    it("formats bytes", () => {
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("formats kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
      expect(formatFileSize(1024 * 10)).toBe("10 KB");
    });

    it("formats megabytes", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1 MB");
      expect(formatFileSize(1024 * 1024 * 5.5)).toBe("5.5 MB");
    });

    it("formats gigabytes", () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
      expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe("2.5 GB");
    });

    it("formats terabytes", () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe("1 TB");
    });

    it("respects decimal parameter", () => {
      expect(formatFileSize(1536, 0)).toBe("2 KB");
      expect(formatFileSize(1536, 2)).toMatch(/1\.5 KB/);
    });

    it("handles negative decimals by using 0", () => {
      expect(formatFileSize(1536, -1)).toBe("2 KB");
    });
  });

  describe("getSizeCategory", () => {
    it("returns 'empty' for 0 bytes", () => {
      expect(getSizeCategory(0)).toBe("empty");
    });

    it("returns 'small' for < 1MB", () => {
      expect(getSizeCategory(500)).toBe("small");
      expect(getSizeCategory(1024 * 512)).toBe("small");
      expect(getSizeCategory(1024 * 1024 - 1)).toBe("small");
    });

    it("returns 'medium' for 1-10MB", () => {
      expect(getSizeCategory(1024 * 1024)).toBe("medium");
      expect(getSizeCategory(1024 * 1024 * 5)).toBe("medium");
      expect(getSizeCategory(1024 * 1024 * 10 - 1)).toBe("medium");
    });

    it("returns 'large' for 10-100MB", () => {
      expect(getSizeCategory(1024 * 1024 * 10)).toBe("large");
      expect(getSizeCategory(1024 * 1024 * 50)).toBe("large");
      expect(getSizeCategory(1024 * 1024 * 100 - 1)).toBe("large");
    });

    it("returns 'xlarge' for > 100MB", () => {
      expect(getSizeCategory(1024 * 1024 * 100)).toBe("xlarge");
      expect(getSizeCategory(1024 * 1024 * 1024)).toBe("xlarge");
    });
  });

  describe("SIZE_FILTERS", () => {
    it("contains all expected filter keys", () => {
      const keys = SIZE_FILTERS.map(f => f.key);
      expect(keys).toContain("all");
      expect(keys).toContain("empty");
      expect(keys).toContain("small");
      expect(keys).toContain("medium");
      expect(keys).toContain("large");
      expect(keys).toContain("xlarge");
    });

    it("has correct labels", () => {
      const allFilter = SIZE_FILTERS.find(f => f.key === "all");
      expect(allFilter?.label).toBe("All");

      const smallFilter = SIZE_FILTERS.find(f => f.key === "small");
      expect(smallFilter?.label).toBe("< 1 MB");
    });

    it("all filters have min and max defined", () => {
      SIZE_FILTERS.forEach(filter => {
        expect(typeof filter.min).toBe("number");
        expect(typeof filter.max).toBe("number");
      });
    });
  });
});
