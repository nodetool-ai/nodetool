import { sanitizeText } from "../sanitize";

describe("sanitizeText", () => {
  describe("basic HTML entity replacement", () => {
    it("should replace < with &lt;", () => {
      expect(sanitizeText("hello < world")).toBe("hello &lt; world");
    });

    it("should replace > with &gt;", () => {
      expect(sanitizeText("hello > world")).toBe("hello &gt; world");
    });

    it('should replace " with &quot;', () => {
      expect(sanitizeText('hello " world')).toBe("hello &quot; world");
    });

    it("should replace ' with &#39;", () => {
      expect(sanitizeText("hello ' world")).toBe("hello &#39; world");
    });

    it("should replace & with &amp;", () => {
      expect(sanitizeText("hello & world")).toBe("hello &amp; world");
    });
  });

  describe("multiple character replacement", () => {
    it("should replace all dangerous characters in a string", () => {
      const input = "<script>alert('XSS & more > problems')</script>";
      const expected =
        "&lt;script&gt;alert(&#39;XSS &amp; more &gt; problems&#39;)&lt;/script&gt;";

      expect(sanitizeText(input)).toBe(expected);
    });

    it("should handle mixed dangerous characters", () => {
      expect(sanitizeText("<>\"'&")).toBe("&lt;&gt;&quot;&#39;&amp;");
    });

    it("should handle repeated characters", () => {
      expect(sanitizeText("<<<>>>")).toBe("&lt;&lt;&lt;&gt;&gt;&gt;");
    });
  });

  describe("edge cases", () => {
    it("should return empty string unchanged", () => {
      expect(sanitizeText("")).toBe("");
    });

    it("should return string without dangerous characters unchanged", () => {
      const safeString = "Hello World 123!@#$%^&*()";
      expect(sanitizeText(safeString)).toBe(safeString);
    });

    it("should handle strings with only dangerous characters", () => {
      expect(sanitizeText("<>\"'&")).toBe("&lt;&gt;&quot;&#39;&amp;");
    });

    it("should handle strings with spaces and tabs", () => {
      expect(sanitizeText("  < > \" ' &  ")).toBe(
        "  &lt; &gt; &quot; &#39; &amp;  "
      );
    });

    it("should handle newlines and special whitespace", () => {
      expect(sanitizeText("<\n>\t\"\r'")).toBe("&lt;\n&gt;\t&quot;\r&#39;");
    });
  });

  describe("unicode and special characters", () => {
    it("should preserve unicode characters", () => {
      const unicodeString = "Hello 世界 🌟 <script>";
      expect(sanitizeText(unicodeString)).toBe("Hello 世界 🌟 &lt;script&gt;");
    });

    it("should handle emojis with dangerous characters", () => {
      expect(sanitizeText("🚀 < > 🚀")).toBe("🚀 &lt; &gt; 🚀");
    });

    it("should handle accented characters", () => {
      expect(sanitizeText("café < résumé >")).toBe("café &lt; résumé &gt;");
    });
  });

  describe("performance and large inputs", () => {
    it("should handle very long strings efficiently", () => {
      const longString = "safe text ".repeat(1000) + "<dangerous>";
      const result = sanitizeText(longString);

      expect(result).toContain("&lt;dangerous&gt;");
      expect(result.length).toBeGreaterThan(longString.length);
    });

    it("should handle strings with many dangerous characters", () => {
      const dangerousString = "<>.\"'&".repeat(10);
      const expected = "&lt;&gt;.&quot;&#39;&amp;".repeat(10);
      const result = sanitizeText(dangerousString);

      expect(result).toBe(expected);
    });
  });

  describe("real-world scenarios", () => {
    it("should sanitize user input with HTML tags", () => {
      const userInput = "My name is <b>John</b> & I like 'quotes'";
      expect(sanitizeText(userInput)).toBe(
        "My name is &lt;b&gt;John&lt;/b&gt; &amp; I like &#39;quotes&#39;"
      );
    });

    it("should sanitize SQL-like strings", () => {
      const sqlString = "SELECT * FROM users WHERE name = 'admin' AND role > 0";
      expect(sanitizeText(sqlString)).toBe(
        "SELECT * FROM users WHERE name = &#39;admin&#39; AND role &gt; 0"
      );
    });

    it("should sanitize JSON-like strings", () => {
      const jsonString = '{"name": "John", "age": 30, "active": true}';
      expect(sanitizeText(jsonString)).toBe(
        "{&#39;name&#39;: &#39;John&#39;, &#39;age&#39;: 30, &#39;active&#39;: true}"
      );
    });

    it("should sanitize file paths", () => {
      const filePath = "/usr/local/bin & C:\\Program Files\\<app>";
      expect(sanitizeText(filePath)).toBe(
        "/usr/local/bin &amp; C:\\Program Files\\&lt;app&gt;"
      );
    });

    it("should sanitize URLs", () => {
      const url = "https://example.com?param=<value>&other='test'";
      expect(sanitizeText(url)).toBe(
        "https://example.com?param=&lt;value&gt;&amp;other=&#39;test&#39;"
      );
    });
  });

  describe("regression tests", () => {
    it("should not replace characters that are not in the dangerous set", () => {
      const safeChars = "!@#$%^*()[]{}|;:,./?`~-_+=";
      expect(sanitizeText(safeChars)).toBe(safeChars);
    });

    it("should handle characters that look similar but are different", () => {
      // These are different Unicode characters that look similar
      const similarChars =
        "‹›«»„" + String.fromCharCode(0x2018) + String.fromCharCode(0x2019);
      expect(sanitizeText(similarChars)).toBe(similarChars);
    });

    it("should handle backslashes correctly", () => {
      expect(sanitizeText("\\<not a tag\\>")).toBe("\\&lt;not a tag\\&gt;");
    });

    it("should handle forward slashes correctly", () => {
      expect(sanitizeText("/<not a tag>/")).toBe("/&lt;not a tag&gt;/");
    });
  });

  describe("security considerations", () => {
    it("should prevent basic XSS attempts", () => {
      const xssAttempt = "<script>alert('XSS')</script>";
      expect(sanitizeText(xssAttempt)).toBe(
        "&lt;script&gt;alert(&#39;XSS&#39;)&lt;/script&gt;"
      );
    });

    it("should handle nested quotes and tags", () => {
      const nested = "<div class=\"test\">'content'</div>";
      expect(sanitizeText(nested)).toBe(
        "&lt;div class=&quot;test&quot;&gt;&#39;content&#39;&lt;/div&gt;"
      );
    });

    it("should handle incomplete HTML tags", () => {
      expect(sanitizeText("<incomplete")).toBe("&lt;incomplete");
      expect(sanitizeText("incomplete>")).toBe("incomplete&gt;");
      expect(sanitizeText("no tags")).toBe("no tags");
    });
  });
});
