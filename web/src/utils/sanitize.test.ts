import { sanitizeText } from "./sanitize";

describe("sanitize", () => {
  describe("sanitizeText", () => {
    it("escapes HTML special characters", () => {
      expect(sanitizeText("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
      );
    });

    it("escapes ampersand", () => {
      expect(sanitizeText("AT&T")).toBe("AT&amp;T");
    });

    it("escapes double quotes", () => {
      expect(sanitizeText('Say "hello"')).toBe("Say &quot;hello&quot;");
    });

    it("escapes single quotes", () => {
      expect(sanitizeText("It's a test")).toBe("It&#39;s a test");
    });

    it("escapes greater than sign", () => {
      expect(sanitizeText("5 > 3")).toBe("5 &gt; 3");
    });

    it("escapes less than sign", () => {
      expect(sanitizeText("3 < 5")).toBe("3 &lt; 5");
    });

    it("handles empty string", () => {
      expect(sanitizeText("")).toBe("");
    });

    it("handles string with no special characters", () => {
      expect(sanitizeText("Hello World")).toBe("Hello World");
    });

    it("handles string with multiple special characters", () => {
      expect(sanitizeText('<a href="test.html">Link & Text</a>')).toBe(
        "&lt;a href=&quot;test.html&quot;&gt;Link &amp; Text&lt;/a&gt;"
      );
    });

    it("does not escape most special characters", () => {
      const input = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !@#$%^()_+-={}[]|\\:,./~`";
      const result = sanitizeText(input);
      expect(result).toContain("!@#$%^()_+-={}[]|\\:,./~`");
    });
  });
});
