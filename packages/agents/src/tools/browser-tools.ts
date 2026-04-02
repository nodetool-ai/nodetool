/**
 * Browser interaction tools.
 *
 * Port of src/nodetool/agents/tools/browser_tools.py (BrowserTool & ScreenshotTool)
 */

import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

// ---------------------------------------------------------------------------
// HTML-to-text helpers
// ---------------------------------------------------------------------------

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " "
};

const ENTITY_RE = new RegExp(Object.keys(ENTITY_MAP).join("|"), "gi");

/**
 * Numeric character references: &#123; or &#x1a;
 */
const NUMERIC_ENTITY_RE = /&#(?:x([0-9a-fA-F]+)|(\d+));/g;

/**
 * Convert raw HTML to readable plain text.
 *
 * - Strips `<script>` and `<style>` blocks
 * - Removes remaining HTML tags
 * - Decodes common HTML entities and numeric character references
 * - Collapses whitespace
 * - Truncates to `maxLength` characters
 */
export function htmlToText(html: string, maxLength = 50_000): string {
  let text = html;

  // Remove script and style blocks (including content)
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Replace <br>, <p>, <div>, <li>, <tr> boundaries with newlines for readability
  text = text.replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n");

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode named entities
  text = text.replace(
    ENTITY_RE,
    (match) => ENTITY_MAP[match.toLowerCase()] ?? match
  );

  // Decode numeric entities
  text = text.replace(NUMERIC_ENTITY_RE, (_match, hex, dec) => {
    const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    return String.fromCharCode(code);
  });

  // Collapse whitespace (preserve single newlines)
  text = text.replace(/[^\S\n]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

  return text;
}

// ---------------------------------------------------------------------------
// Search-engine host list (block direct browsing of SERPs)
// ---------------------------------------------------------------------------

const SEARCH_ENGINE_HOSTS = [
  "google.",
  "bing.",
  "search.yahoo",
  "duckduckgo",
  "yandex",
  "baidu",
  "ask.",
  "jina.ai"
];

function isSearchEngine(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return SEARCH_ENGINE_HOSTS.some((h) => lower.includes(h));
}

// ---------------------------------------------------------------------------
// BrowserTool
// ---------------------------------------------------------------------------

export class BrowserTool extends Tool {
  readonly name = "browser";
  readonly description = "Fetch content from a web page";
  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to navigate to"
      }
    },
    required: ["url"]
  };

  userMessage(params: Record<string, unknown>): string {
    const url = (params.url as string) ?? "a specific URL";
    const msg = `Browsing ${url}...`;
    return msg.length > 160 ? "Browsing a specified URL..." : msg;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const url = params.url as string | undefined;
    if (!url) {
      return { error: "URL is required" };
    }

    // Block search-engine result pages
    try {
      const hostname = new URL(url).hostname;
      if (isSearchEngine(hostname)) {
        return {
          error:
            "Direct browsing of search engine result pages is disabled. Use a SERP tool (e.g., google_search) instead.",
          url
        };
      }
    } catch {
      return { error: `Invalid URL: ${url}` };
    }

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5"
        },
        signal: AbortSignal.timeout(30_000)
      });

      if (!response.ok) {
        return {
          error: `HTTP ${response.status}: ${response.statusText}`,
          url
        };
      }

      const html = await response.text();
      const content = htmlToText(html);

      return {
        success: true,
        url,
        content
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Error fetching page: ${message}` };
    }
  }
}

// ---------------------------------------------------------------------------
// ScreenshotTool
// ---------------------------------------------------------------------------

export class ScreenshotTool extends Tool {
  readonly name = "take_screenshot";
  readonly description =
    "Take a screenshot of a web page. Requires a remote browser service (BROWSER_URL).";
  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to navigate to before taking screenshot"
      },
      output_file: {
        type: "string",
        description: "Workspace relative path to save the screenshot",
        default: "screenshot.png"
      }
    },
    required: ["url", "output_file"]
  };

  userMessage(params: Record<string, unknown>): string {
    const url = (params.url as string) ?? "a page";
    const output = (params.output_file as string) ?? "screenshot.png";
    const msg = `Taking screenshot of ${url} and saving to ${output}.`;
    return msg.length > 160
      ? `Taking screenshot of a page and saving to ${output}.`
      : msg;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const url = params.url as string | undefined;
    if (!url) {
      return { error: "URL is required for taking a screenshot" };
    }

    const browserUrl = process.env.BROWSER_URL;
    if (!browserUrl) {
      return {
        error:
          "Screenshots require a remote browser service. Set the BROWSER_URL environment variable to the browser service endpoint.",
        url
      };
    }

    // If a BROWSER_URL is configured, attempt to call it as a screenshot API.
    try {
      const outputFile = (params.output_file as string) ?? "screenshot.png";
      const response = await fetch(browserUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, output_file: outputFile }),
        signal: AbortSignal.timeout(30_000)
      });

      if (!response.ok) {
        return {
          error: `Browser service returned HTTP ${response.status}: ${response.statusText}`,
          url
        };
      }

      const result = await response.json();
      return { success: true, ...result };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Error taking screenshot: ${message}` };
    }
  }
}
