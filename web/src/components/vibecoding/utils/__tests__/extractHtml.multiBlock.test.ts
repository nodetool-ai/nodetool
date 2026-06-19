import {
  extractHtmlFromResponse,
  isValidHtmlDocument,
  injectRuntimeConfig
} from "../extractHtml";

describe("extractHtmlFromResponse — multi-block and edge cases", () => {
  it("extracts the first valid HTML block when multiple code blocks exist", () => {
    const content = [
      "Here is some JS:",
      "```javascript",
      "console.log('hi');",
      "```",
      "",
      "And the HTML:",
      "```html",
      "<html><head><title>Test</title></head><body><p>Hello</p></body></html>",
      "```"
    ].join("\n");
    const result = extractHtmlFromResponse(content);
    expect(result).toContain("<html>");
    expect(result).toContain("<body>");
  });

  it("is case-insensitive for html code block language tag", () => {
    const content = "```HTML\n<html><head></head><body></body></html>\n```";
    const result = extractHtmlFromResponse(content);
    expect(result).toContain("<html>");
  });

  it("handles DOCTYPE with uppercase HTML", () => {
    const content = "<!DOCTYPE HTML><html><head></head><body></body></html>";
    const result = extractHtmlFromResponse(content);
    expect(result).not.toBeNull();
    expect(result).toContain("<!DOCTYPE HTML>");
  });

  it("handles html tag with multiple attributes", () => {
    const content =
      '```html\n<html lang="en" dir="ltr"><head><meta charset="utf-8"></head><body>Content</body></html>\n```';
    const result = extractHtmlFromResponse(content);
    expect(result).toContain('lang="en"');
  });

  it("returns null for code block with fragment HTML", () => {
    const content = "```html\n<div><p>Fragment only</p></div>\n```";
    expect(extractHtmlFromResponse(content)).toBeNull();
  });

  it("returns null for empty code block", () => {
    const content = "```html\n\n```";
    expect(extractHtmlFromResponse(content)).toBeNull();
  });

  it("handles content with only whitespace before HTML", () => {
    const content =
      "   \n\n```html\n<html><head></head><body></body></html>\n```";
    const result = extractHtmlFromResponse(content);
    expect(result).toContain("<html>");
  });
});

describe("isValidHtmlDocument — additional edge cases", () => {
  it("returns false for null-like values cast to string", () => {
    expect(isValidHtmlDocument("null")).toBe(false);
    expect(isValidHtmlDocument("undefined")).toBe(false);
  });

  it("returns true for HTML with extra whitespace", () => {
    const html = "  <html>  \n  <head></head>  \n  <body></body>  \n  </html>  ";
    expect(isValidHtmlDocument(html)).toBe(true);
  });

  it("returns false for HTML with only closing tags", () => {
    expect(isValidHtmlDocument("</html></head></body>")).toBe(false);
  });

  it("returns true for HTML with nested content in body", () => {
    const html =
      '<html><body><div><section><article><p>Deep nesting</p></article></section></div></body></html>';
    expect(isValidHtmlDocument(html)).toBe(true);
  });

  it("returns true for HTML with DOCTYPE", () => {
    const html =
      "<!DOCTYPE html><html><head></head><body></body></html>";
    expect(isValidHtmlDocument(html)).toBe(true);
  });
});

describe("injectRuntimeConfig — edge cases", () => {
  const config = {
    apiUrl: "http://localhost:8080",
    wsUrl: "ws://localhost:8080/ws",
    workflowId: "test-workflow-456"
  };

  it("handles HTML with multiple head closing tags (uses first)", () => {
    const html =
      "<html><head></head><head></head><body></body></html>";
    const result = injectRuntimeConfig(html, config);
    const firstHead = result.indexOf("</head>");
    const configPos = result.indexOf("NODETOOL_API_URL");
    expect(configPos).toBeLessThan(firstHead);
  });

  it("preserves existing head content when injecting", () => {
    const html =
      '<html><head><meta charset="utf-8"><title>App</title></head><body></body></html>';
    const result = injectRuntimeConfig(html, config);
    expect(result).toContain('<meta charset="utf-8">');
    expect(result).toContain("<title>App</title>");
    expect(result).toContain("NODETOOL_API_URL");
  });

  it("includes all three config values", () => {
    const html = "<html><head></head><body></body></html>";
    const result = injectRuntimeConfig(html, config);
    expect(result).toContain("http://localhost:8080");
    expect(result).toContain("ws://localhost:8080/ws");
    expect(result).toContain("test-workflow-456");
  });

  it("wraps config in a script tag", () => {
    const html = "<html><head></head><body></body></html>";
    const result = injectRuntimeConfig(html, config);
    expect(result).toContain("<script>");
    expect(result).toContain("</script>");
  });

  it("handles body tag with attributes for fallback injection", () => {
    const html = '<html><body class="app"></body></html>';
    const result = injectRuntimeConfig(html, config);
    expect(result).toContain("NODETOOL_API_URL");
  });
});
