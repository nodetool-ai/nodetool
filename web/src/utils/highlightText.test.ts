import { escapeHtml, hexToRgb, formatBulletList } from "./highlightText";

describe("highlightText", () => {
  describe("escapeHtml", () => {
    it("escapes HTML special characters", () => {
      expect(escapeHtml("<div>Hello</div>")).toBe("&lt;div&gt;Hello&lt;/div&gt;");
    });

    it("escapes ampersands", () => {
      expect(escapeHtml("A & B")).toBe("A &amp; B");
    });

    it("handles empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("handles strings without special characters", () => {
      expect(escapeHtml("Plain text")).toBe("Plain text");
    });
  });

  describe("hexToRgb", () => {
    it("converts valid hex to RGB", () => {
      expect(hexToRgb("#ff0000")).toBe("255, 0, 0");
      expect(hexToRgb("#00ff00")).toBe("0, 255, 0");
      expect(hexToRgb("#0000ff")).toBe("0, 0, 255");
    });

    it("converts hex without hash to RGB", () => {
      expect(hexToRgb("ff0000")).toBe("255, 0, 0");
    });

    it("handles whitespace in hex", () => {
      expect(hexToRgb(" #ff0000 ")).toBe("255, 0, 0");
    });

    it("returns null for invalid hex", () => {
      expect(hexToRgb("invalid")).toBeNull();
      expect(hexToRgb("#xyz")).toBeNull();
      expect(hexToRgb("#")).toBeNull();
      expect(hexToRgb("")).toBeNull();
    });

    it("handles valid hex colors", () => {
      expect(hexToRgb("#ffffff")).toBe("255, 255, 255");
      expect(hexToRgb("#000000")).toBe("0, 0, 0");
      expect(hexToRgb("#ff0000")).toBe("255, 0, 0");
    });
  });

  describe("formatBulletList", () => {
    it("formats text as bullet list", () => {
      const result = formatBulletList("Item 1\nItem 2\nItem 3");
      expect(result).toContain("<ul>");
      expect(result).toContain("<li>Item 1</li>");
      expect(result).toContain("<li>Item 2</li>");
      expect(result).toContain("<li>Item 3</li>");
      expect(result).toContain("</ul>");
    });

    it("filters out empty lines", () => {
      const result = formatBulletList("Item 1\n\nItem 2\n  \nItem 3");
      expect(result).not.toContain("<li></li>");
      expect(result).toContain("<li>Item 1</li>");
      expect(result).toContain("<li>Item 2</li>");
      expect(result).toContain("<li>Item 3</li>");
    });

    it("handles single item", () => {
      const result = formatBulletList("Single Item");
      expect(result).toContain("<li>Single Item</li>");
    });

    it("handles empty string", () => {
      const result = formatBulletList("");
      expect(result).toBe("<ul></ul>");
    });

    it("handles whitespace-only lines", () => {
      const result = formatBulletList("Item 1\n   \nItem 2");
      expect(result).toContain("<li>Item 1</li>");
      expect(result).toContain("<li>Item 2</li>");
    });
  });
});
