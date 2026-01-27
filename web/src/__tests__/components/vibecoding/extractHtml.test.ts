import {
  extractHtmlFromResponse,
  isValidHtmlDocument,
  injectRuntimeConfig
} from "../../../components/vibecoding/utils/extractHtml";

describe("extractHtmlFromResponse", () => {
  it("extracts HTML from ```html code block", () => {
    const response =
      "Here's your app:\n```html\n<!DOCTYPE html><html><head></head><body>Test</body></html>\n```";
    const html = extractHtmlFromResponse(response);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<body>Test</body>");
  });

  it("extracts HTML from generic code block", () => {
    const response =
      "```\n<!DOCTYPE html><html><head></head><body>Test</body></html>\n```";
    const html = extractHtmlFromResponse(response);
    expect(html).toBeTruthy();
  });

  it("extracts raw HTML without code block", () => {
    const response =
      "<!DOCTYPE html><html><head></head><body>Test</body></html>";
    const html = extractHtmlFromResponse(response);
    expect(html).toBeTruthy();
  });

  it("returns null for non-HTML content", () => {
    const response = "I can help you with that. What would you like?";
    expect(extractHtmlFromResponse(response)).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(extractHtmlFromResponse("")).toBeNull();
  });

  it("adds DOCTYPE when missing from <html> tag only", () => {
    const response = "<html><head></head><body>No doctype</body></html>";
    const html = extractHtmlFromResponse(response);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<body>No doctype</body>");
  });

  it("handles HTML with surrounding text", () => {
    const response =
      "Here is the code:\n```html\n<!DOCTYPE html><html><head><title>Test</title></head><body>Content</body></html>\n```\n\nLet me know if you need changes.";
    const html = extractHtmlFromResponse(response);
    expect(html).toBeTruthy();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<body>Content</body>");
  });

  it("handles multiline HTML in code block", () => {
    const response = `\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
</head>
<body>
  <h1>Hello</h1>
</body>
</html>
\`\`\``;
    const html = extractHtmlFromResponse(response);
    expect(html).toBeTruthy();
    expect(html).toContain("<h1>Hello</h1>");
  });
});

describe("isValidHtmlDocument", () => {
  it("returns true for valid HTML with head and body", () => {
    const html =
      "<!DOCTYPE html><html><head></head><body>Test</body></html>";
    expect(isValidHtmlDocument(html)).toBe(true);
  });

  it("returns true for HTML with just body", () => {
    const html = "<html><body>Test</body></html>";
    expect(isValidHtmlDocument(html)).toBe(true);
  });

  it("returns true for HTML with just head", () => {
    const html = "<html><head><title>Test</title></head></html>";
    expect(isValidHtmlDocument(html)).toBe(true);
  });

  it("returns false for HTML without body or head", () => {
    const html = "<html></html>";
    expect(isValidHtmlDocument(html)).toBe(false);
  });

  it("returns false for incomplete HTML", () => {
    const html = "<html><head>";
    expect(isValidHtmlDocument(html)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidHtmlDocument("")).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(isValidHtmlDocument("Just some text")).toBe(false);
  });

  it("returns false for HTML fragment", () => {
    expect(isValidHtmlDocument("<div>Fragment</div>")).toBe(false);
  });
});

describe("injectRuntimeConfig", () => {
  const config = {
    apiUrl: "http://localhost:7777",
    wsUrl: "ws://localhost:7777/ws",
    workflowId: "test-workflow-123"
  };

  it("injects config before </head>", () => {
    const html = "<!DOCTYPE html><html><head></head><body></body></html>";
    const result = injectRuntimeConfig(html, config);

    expect(result).toContain("window.NODETOOL_API_URL");
    expect(result).toContain("window.NODETOOL_WS_URL");
    expect(result).toContain("window.NODETOOL_WORKFLOW_ID");
    expect(result).toContain("http://localhost:7777");
    expect(result).toContain("ws://localhost:7777/ws");
    expect(result).toContain("test-workflow-123");
  });

  it("injects config before </head> tag", () => {
    const html =
      "<!DOCTYPE html><html><head><title>Test</title></head><body></body></html>";
    const result = injectRuntimeConfig(html, config);

    // Script should be before </head>
    const scriptIndex = result.indexOf("window.NODETOOL_API_URL");
    const headEndIndex = result.indexOf("</head>");
    expect(scriptIndex).toBeLessThan(headEndIndex);
  });

  it("injects after <body> when no </head> tag", () => {
    const html = "<html><body>Content</body></html>";
    const result = injectRuntimeConfig(html, config);

    expect(result).toContain("window.NODETOOL_API_URL");
    const scriptIndex = result.indexOf("window.NODETOOL_API_URL");
    const bodyIndex = result.indexOf("<body>");
    expect(scriptIndex).toBeGreaterThan(bodyIndex);
  });

  it("injects at beginning as fallback", () => {
    const html = "<div>Some content</div>";
    const result = injectRuntimeConfig(html, config);

    expect(result).toContain("window.NODETOOL_API_URL");
    expect(result.indexOf("<script>")).toBe(1); // After newline at beginning
  });

  it("preserves original HTML content", () => {
    const html =
      "<!DOCTYPE html><html><head><title>My App</title></head><body><h1>Hello</h1></body></html>";
    const result = injectRuntimeConfig(html, config);

    expect(result).toContain("<title>My App</title>");
    expect(result).toContain("<h1>Hello</h1>");
  });
});
