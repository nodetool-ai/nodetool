/**
 * Extract HTML content from a chat message response.
 *
 * The agent returns HTML wrapped in ```html ... ``` code blocks.
 * This function extracts the HTML content from those blocks.
 */
export function extractHtmlFromResponse(content: string): string | null {
  if (!content) {
    return null;
  }

  // Try to match ```html ... ``` code block (most common)
  const htmlCodeBlockMatch = content.match(/```html\s*([\s\S]*?)```/i);
  if (htmlCodeBlockMatch) {
    const html = htmlCodeBlockMatch[1].trim();
    if (isValidHtmlDocument(html)) {
      return html;
    }
  }

  // Try to match ``` ... ``` without language specifier
  const genericCodeBlockMatch = content.match(
    /```\s*(<!DOCTYPE[\s\S]*?<\/html>)\s*```/i
  );
  if (genericCodeBlockMatch) {
    return genericCodeBlockMatch[1].trim();
  }

  // Try to match raw <!DOCTYPE html> ... </html>
  const rawHtmlMatch = content.match(/(<!DOCTYPE html>[\s\S]*<\/html>)/i);
  if (rawHtmlMatch) {
    return rawHtmlMatch[1].trim();
  }

  // Try to match <html> ... </html> without DOCTYPE
  const htmlTagMatch = content.match(/(<html[\s\S]*<\/html>)/i);
  if (htmlTagMatch) {
    // Add DOCTYPE if missing
    return `<!DOCTYPE html>\n${htmlTagMatch[1].trim()}`;
  }

  return null;
}

/**
 * Check if a string looks like a valid HTML document.
 */
export function isValidHtmlDocument(html: string): boolean {
  if (!html) {
    return false;
  }

  const hasHtmlTag = /<html[\s>]/i.test(html) && /<\/html>/i.test(html);
  const hasHead = /<head[\s>]/i.test(html) && /<\/head>/i.test(html);
  const hasBody = /<body[\s>]/i.test(html) && /<\/body>/i.test(html);

  // At minimum, should have html tags and either head or body
  return hasHtmlTag && (hasHead || hasBody);
}

/**
 * Inject runtime configuration into HTML document.
 */
export function injectRuntimeConfig(
  html: string,
  config: {
    apiUrl: string;
    wsUrl: string;
    workflowId: string;
  }
): string {
  const configScript = `
<script>
  window.NODETOOL_API_URL = "${config.apiUrl}";
  window.NODETOOL_WS_URL = "${config.wsUrl}";
  window.NODETOOL_WORKFLOW_ID = "${config.workflowId}";
</script>`;

  // Try to inject before </head>
  if (html.includes("</head>")) {
    return html.replace("</head>", `${configScript}\n</head>`);
  }

  // Fallback: inject after <body>
  if (html.includes("<body>")) {
    return html.replace("<body>", `<body>\n${configScript}`);
  }

  // Last resort: inject at the beginning
  return `${configScript}\n${html}`;
}
