import {
  extractHtmlFromResponse,
  isValidHtmlDocument,
  injectRuntimeConfig
} from "../extractHtml";

describe("isValidHtmlDocument", () => {
  it("returns false for empty string", () => {
    expect(isValidHtmlDocument("")).toBe(false);
  });

  it("returns true for minimal valid HTML with head", () => {
    const html = "<html><head></head><body></body></html>";
    expect(isValidHtmlDocument(html)).toBe(true);
  });

  it("returns true for HTML with only body", () => {
    const html = "<html><body><p>Hello</p></body></html>";
    expect(isValidHtmlDocument(html)).toBe(true);
  });

  it("returns true for HTML with only head", () => {
    const html = "<html><head><title>Test</title></head></html>";
    expect(isValidHtmlDocument(html)).toBe(true);
  });

  it("returns false when missing html tags", () => {
    expect(isValidHtmlDocument("<head></head><body></body>")).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(isValidHtmlDocument("just some text")).toBe(false);
  });

  it("handles html tag with attributes", () => {
    const html = '<html lang="en"><head></head></html>';
    expect(isValidHtmlDocument(html)).toBe(true);
  });
});

describe("extractHtmlFromResponse", () => {
  it("returns null for empty content", () => {
    expect(extractHtmlFromResponse("")).toBe(null);
  });

  it("extracts HTML from html code block", () => {
    const content = 'Here is the page:\n```html\n<html><head></head><body><p>Hi</p></body></html>\n```';
    const result = extractHtmlFromResponse(content);
    expect(result).toContain("<html>");
    expect(result).toContain("<body>");
  });

  it("extracts raw DOCTYPE html without code block", () => {
    const content = "Some text before\n<!DOCTYPE html><html><head></head><body></body></html>\nSome text after";
    const result = extractHtmlFromResponse(content);
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("</html>");
  });

  it("extracts html tag without DOCTYPE and adds it", () => {
    const content = "<html><head></head><body>Content</body></html>";
    const result = extractHtmlFromResponse(content);
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<html>");
  });

  it("extracts from generic code block with DOCTYPE", () => {
    const content = "```\n<!DOCTYPE html><html><head></head><body></body></html>\n```";
    const result = extractHtmlFromResponse(content);
    expect(result).toContain("<!DOCTYPE html>");
  });

  it("returns null for non-HTML content", () => {
    const content = "This is just a regular message with no HTML";
    expect(extractHtmlFromResponse(content)).toBe(null);
  });

  it("returns null for incomplete HTML in code block", () => {
    const content = "```html\n<div>Not a full document</div>\n```";
    expect(extractHtmlFromResponse(content)).toBe(null);
  });
});

describe("injectRuntimeConfig", () => {
  const config = {
    apiUrl: "http://localhost:7777",
    wsUrl: "ws://localhost:7777/ws",
    workflowId: "wf-123"
  };

  it("injects before closing head when present", () => {
    const html = "<html><head><title>Test</title></head><body></body></html>";
    const result = injectRuntimeConfig(html, config);
    expect(result).toContain('window.NODETOOL_API_URL = "http://localhost:7777"');
    expect(result).toContain('window.NODETOOL_WS_URL = "ws://localhost:7777/ws"');
    expect(result).toContain('window.NODETOOL_WORKFLOW_ID = "wf-123"');
    expect(result.indexOf("NODETOOL_API_URL")).toBeLessThan(result.indexOf("</head>"));
  });

  it("injects after body when no closing head", () => {
    const html = "<html><body><p>Content</p></body></html>";
    const result = injectRuntimeConfig(html, config);
    expect(result).toContain("NODETOOL_API_URL");
    expect(result.indexOf("NODETOOL_API_URL")).toBeGreaterThan(result.indexOf("<body>"));
  });

  it("injects at beginning as last resort", () => {
    const html = "<html><p>Minimal</p></html>";
    const result = injectRuntimeConfig(html, config);
    expect(result).toContain("NODETOOL_API_URL");
    expect(result.indexOf("NODETOOL_API_URL")).toBeLessThan(result.indexOf("<html>"));
  });
});
