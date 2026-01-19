import { formatFileSize, getSizeCategory, SIZE_FILTERS, SizeFilterKey } from "../formatUtils";

describe("formatUtils", () => {
  describe("formatFileSize", () => {
    it("formats 0 bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
    });

    it("formats bytes", () => {
      expect(formatFileSize(512)).toBe("512 B");
    });

    it("formats kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
    });

    it("formats megabytes", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1 MB");
      expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
    });

    it("formats gigabytes", () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
      expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
    });

    it("formats terabytes", () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe("1 TB");
    });

    it("handles custom decimal places", () => {
      expect(formatFileSize(1536, 0)).toBe("2 KB");
      expect(formatFileSize(1536, 2)).toBe("1.5 KB");
    });

    it("handles negative decimals as 0", () => {
      expect(formatFileSize(1536, -1)).toBe("2 KB");
    });

    it("handles very large numbers", () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024 * 5)).toBe("5 TB");
    });

    it("handles fractional bytes correctly", () => {
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(500 * 1024)).toBe("500 KB");
    });
  });

  describe("getSizeCategory", () => {
    it("returns empty for 0 bytes", () => {
      expect(getSizeCategory(0)).toBe("empty");
    });

    it("returns small for less than 1MB", () => {
      expect(getSizeCategory(1)).toBe("small");
      expect(getSizeCategory(1023)).toBe("small");
      expect(getSizeCategory(1024 * 1024 - 1)).toBe("small");
    });

    it("returns medium for 1-10MB", () => {
      expect(getSizeCategory(1024 * 1024)).toBe("medium");
      expect(getSizeCategory(5 * 1024 * 1024)).toBe("medium");
      expect(getSizeCategory(10 * 1024 * 1024 - 1)).toBe("medium");
    });

    it("returns large for 10-100MB", () => {
      expect(getSizeCategory(10 * 1024 * 1024)).toBe("large");
      expect(getSizeCategory(50 * 1024 * 1024)).toBe("large");
      expect(getSizeCategory(100 * 1024 * 1024 - 1)).toBe("large");
    });

    it("returns xlarge for greater than 100MB", () => {
      expect(getSizeCategory(100 * 1024 * 1024)).toBe("xlarge");
      expect(getSizeCategory(1024 * 1024 * 1024)).toBe("xlarge");
    });
  });

  describe("SIZE_FILTERS", () => {
    it("has correct number of filters", () => {
      expect(SIZE_FILTERS).toHaveLength(6);
    });

    it("has all filter keys", () => {
      const keys = SIZE_FILTERS.map(f => f.key);
      expect(keys).toContain("all");
      expect(keys).toContain("empty");
      expect(keys).toContain("small");
      expect(keys).toContain("medium");
      expect(keys).toContain("large");
      expect(keys).toContain("xlarge");
    });

    it("has all filter with infinite max", () => {
      const allFilter = SIZE_FILTERS.find(f => f.key === "all");
      expect(allFilter?.max).toBe(Infinity);
    });

    it("has empty filter with min and max of 0", () => {
      const emptyFilter = SIZE_FILTERS.find(f => f.key === "empty");
      expect(emptyFilter?.min).toBe(0);
      expect(emptyFilter?.max).toBe(0);
    });

    it("has xlarge filter with min of 100MB", () => {
      const xlargeFilter = SIZE_FILTERS.find(f => f.key === "xlarge");
      expect(xlargeFilter?.min).toBe(100 * 1024 * 1024);
      expect(xlargeFilter?.max).toBe(Infinity);
    });

    it("type SizeFilterKey is correct", () => {
      const testKey: SizeFilterKey = "medium";
      expect(testKey).toBe("medium");
    });
  });
});
