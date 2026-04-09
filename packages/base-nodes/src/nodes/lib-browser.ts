import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export class WebFetchLibNode extends BaseNode {
  static readonly nodeType = "lib.browser.WebFetch";
  static readonly title = "Web Fetch";
  static readonly description =
    "Fetches HTML content from a URL and converts it to text.\n    web, fetch, html, markdown, http\n\n    Use cases:\n    - Extract text content from web pages\n    - Process web content for analysis\n    - Save web content to files";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL to fetch content from"
  })
  declare url: any;

  @prop({
    type: "str",
    default: "body",
    title: "Selector",
    description: "CSS selector to extract specific elements"
  })
  declare selector: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const selector = String(this.selector ?? "body");
    if (!url) throw new Error("URL is required");

    const axios = (await import("axios")).default;
    const cheerio = await import("cheerio");
    const TurndownService = (await import("turndown")).default;

    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      responseType: "text",
      timeout: 30000
    });

    const contentType = String(
      response.headers["content-type"] ?? ""
    ).toLowerCase();
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      return { output: String(response.data) };
    }

    const $ = cheerio.load(String(response.data));
    const elements = $(selector);
    if (elements.length === 0) {
      throw new Error(`No elements found matching selector: ${selector}`);
    }

    let html = "";
    elements.each((_i, el) => {
      html += $.html(el) ?? "";
    });

    const turndown = new TurndownService();
    const markdown = turndown.turndown(html);
    return { output: markdown };
  }
}

export class DownloadFileLibNode extends BaseNode {
  static readonly nodeType = "lib.browser.DownloadFile";
  static readonly title = "Download File";
  static readonly description =
    "Downloads a file from a URL and saves it to disk.\n    download, file, web, save\n\n    Use cases:\n    - Download documents, images, or other files from the web\n    - Save data for further processing\n    - Retrieve file assets for analysis";
  static readonly metadataOutputTypes = {
    output: "bytes"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL of the file to download"
  })
  declare url: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    if (!url) throw new Error("URL is required");

    const axios = (await import("axios")).default;
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      responseType: "arraybuffer",
      timeout: 60000
    });

    const data = Buffer.from(response.data).toString("base64");
    return { output: { __bytes__: data } };
  }
}

export class BrowserLibNode extends BaseNode {
  static readonly nodeType = "lib.browser.Browser";
  static readonly title = "Browser";
  static readonly description =
    "Fetches content from a web page using a headless browser.\n    browser, web, scraping, content, fetch\n\n    Use cases:\n    - Extract content from JavaScript-heavy websites\n    - Retrieve text content from web pages\n    - Get metadata from web pages\n    - Save extracted content to files";
  static readonly metadataOutputTypes = {
    success: "bool",
    content: "str",
    metadata: "dict[str, any]"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL to navigate to"
  })
  declare url: any;

  @prop({
    type: "int",
    default: 20000,
    title: "Timeout",
    description: "Timeout in milliseconds for page navigation"
  })
  declare timeout: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const timeout = Number(this.timeout ?? 20000);
    if (!url) throw new Error("URL is required");

    const { chromium } = await import("playwright");
    const TurndownService = (await import("turndown")).default;
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ bypassCSP: true });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout });
      const html = await page.content();

      const turndown = new TurndownService();
      const content = turndown.turndown(html);

      const title = await page.title();
      return {
        success: true,
        content,
        metadata: { title }
      };
    } finally {
      await browser.close();
    }
  }
}

export class ScreenshotLibNode extends BaseNode {
  static readonly nodeType = "lib.browser.Screenshot";
  static readonly title = "Screenshot";
  static readonly description =
    "Takes a screenshot of a web page or specific element.\n    browser, screenshot, capture, image\n\n    Use cases:\n    - Capture visual representation of web pages\n    - Document specific UI elements\n    - Create visual records of web content";
  static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL to navigate to before taking screenshot"
  })
  declare url: any;

  @prop({
    type: "str",
    default: "",
    title: "Selector",
    description: "Optional CSS selector for capturing a specific element"
  })
  declare selector: any;

  @prop({
    type: "str",
    default: "screenshot.png",
    title: "Output File",
    description: "Path to save the screenshot (relative to workspace)"
  })
  declare output_file: any;

  @prop({
    type: "int",
    default: 30000,
    title: "Timeout",
    description: "Timeout in milliseconds for page navigation"
  })
  declare timeout: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const selector = String(this.selector ?? "");
    const timeout = Number(this.timeout ?? 30000);
    if (!url) throw new Error("URL is required");

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ bypassCSP: true });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });

      let buffer: Buffer;
      if (selector) {
        const el = await page.waitForSelector(selector, { timeout });
        if (!el)
          throw new Error(`No element found matching selector: ${selector}`);
        buffer = await el.screenshot();
      } else {
        buffer = await page.screenshot();
      }

      const data = buffer.toString("base64");
      return {
        success: true,
        output: { type: "image", data },
        url
      };
    } finally {
      await browser.close();
    }
  }
}

type BrowserAction =
  | "click"
  | "goto"
  | "back"
  | "forward"
  | "reload"
  | "extract";
type ExtractType = "text" | "html" | "value" | "attribute";

export class BrowserNavigationLibNode extends BaseNode {
  static readonly nodeType = "lib.browser.BrowserNavigation";
  static readonly title = "Browser Navigation";
  static readonly description =
    "Navigates and interacts with web pages in a browser session.\n    browser, navigation, interaction, click, extract\n\n    Use cases:\n    - Perform complex web interactions\n    - Navigate through multi-step web processes\n    - Extract content after interaction";
  static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL to navigate to (required for 'goto' action)"
  })
  declare url: any;

  @prop({
    type: "enum",
    default: "goto",
    title: "Action",
    description: "Navigation or extraction action to perform",
    values: ["click", "goto", "back", "forward", "reload", "extract"]
  })
  declare action: any;

  @prop({
    type: "str",
    default: "",
    title: "Selector",
    description: "CSS selector for the element to interact with or extract from"
  })
  declare selector: any;

  @prop({
    type: "int",
    default: 30000,
    title: "Timeout",
    description: "Timeout in milliseconds for the action"
  })
  declare timeout: any;

  @prop({
    type: "str",
    default: "",
    title: "Wait For",
    description: "Optional selector to wait for after performing the action"
  })
  declare wait_for: any;

  @prop({
    type: "enum",
    default: "text",
    title: "Extract Type",
    description: "Type of content to extract (for 'extract' action)",
    values: ["text", "html", "value", "attribute"]
  })
  declare extract_type: any;

  @prop({
    type: "str",
    default: "",
    title: "Attribute",
    description: "Attribute name to extract (when extract_type is 'attribute')"
  })
  declare attribute: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const action = String(this.action ?? "goto") as BrowserAction;
    const selector = String(this.selector ?? "");
    const timeout = Number(this.timeout ?? 30000);
    const waitFor = String(this.wait_for ?? "");
    const extractType = String(this.extract_type ?? "text") as ExtractType;
    const attribute = String(this.attribute ?? "");

    if (action === "goto" && !url)
      throw new Error("URL is required for goto action");

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ bypassCSP: true });
      const page = await ctx.newPage();

      if (action === "goto") {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      } else if (action === "reload") {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout });
        await page.reload({ waitUntil: "domcontentloaded", timeout });
      } else if (action === "click") {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout });
        const el = await page.waitForSelector(selector, { timeout });
        if (!el) throw new Error(`Element not found: ${selector}`);
        await el.click();
      } else if (action === "extract") {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      } else if (action === "back") {
        await page.goBack({ timeout, waitUntil: "domcontentloaded" });
      } else if (action === "forward") {
        await page.goForward({ timeout, waitUntil: "domcontentloaded" });
      }

      if (waitFor) {
        await page.waitForSelector(waitFor, { timeout });
      }

      let extracted: unknown = null;
      if (action === "extract") {
        if (selector) {
          const el = await page.waitForSelector(selector, { timeout });
          if (!el) throw new Error(`Element not found: ${selector}`);
          if (extractType === "html") {
            extracted = await el.evaluate((e: Element) => e.outerHTML);
          } else if (extractType === "value") {
            extracted = await el.evaluate(
              (e: HTMLInputElement) => e.value ?? ""
            );
          } else if (extractType === "attribute") {
            extracted = await el.evaluate(
              (e: Element, a: string) => e.getAttribute(a),
              attribute
            );
          } else {
            extracted = await el.evaluate(
              (e: Element) =>
                (e as HTMLElement).innerText ?? e.textContent ?? ""
            );
          }
        } else {
          if (extractType === "html") {
            extracted = await page.content();
          } else {
            extracted = await page.evaluate(() =>
              document.body ? document.body.innerText : ""
            );
          }
        }
      }

      return { success: true, action, extracted };
    } finally {
      await browser.close();
    }
  }
}

export class SpiderCrawlLibNode extends BaseNode {
  static readonly nodeType = "lib.browser.SpiderCrawl";
  static readonly title = "Spider Crawl";
  static readonly description =
    "Crawls websites following links and emitting URLs with optional HTML content.\n    spider, crawler, web scraping, links, sitemap\n\n    Use cases:\n    - Build sitemaps and discover website structure\n    - Collect URLs for bulk processing\n    - Find all pages on a website\n    - Extract content from multiple pages\n    - Feed agentic workflows with discovered pages\n    - Analyze website content and structure";
  static readonly metadataOutputTypes = {
    url: "str",
    depth: "int",
    html: "str",
    title: "str",
    status_code: "int"
  };
  static readonly exposeAsTool = true;

  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default: "",
    title: "Start Url",
    description: "The starting URL to begin crawling from"
  })
  declare start_url: any;

  @prop({
    type: "int",
    default: 2,
    title: "Max Depth",
    description:
      "Maximum depth to crawl (0 = start page only, 1 = start + linked pages, etc.)",
    min: 0,
    max: 10
  })
  declare max_depth: any;

  @prop({
    type: "int",
    default: 50,
    title: "Max Pages",
    description: "Maximum number of pages to crawl (safety limit)",
    min: 1,
    max: 1000
  })
  declare max_pages: any;

  @prop({
    type: "bool",
    default: true,
    title: "Same Domain Only",
    description: "Only follow links within the same domain as the start URL"
  })
  declare same_domain_only: any;

  @prop({
    type: "bool",
    default: false,
    title: "Include Html",
    description:
      "Include the HTML content of each page in the output (increases bandwidth)"
  })
  declare include_html: any;

  @prop({
    type: "bool",
    default: true,
    title: "Respect Robots Txt",
    description: "Respect robots.txt rules (follows web crawler best practices)"
  })
  declare respect_robots_txt: any;

  @prop({
    type: "int",
    default: 1000,
    title: "Delay Ms",
    description: "Delay in milliseconds between requests (politeness policy)",
    min: 0,
    max: 10000
  })
  declare delay_ms: any;

  @prop({
    type: "int",
    default: 30000,
    title: "Timeout",
    description: "Timeout in milliseconds for each page load",
    min: 1000,
    max: 120000
  })
  declare timeout: any;

  @prop({
    type: "str",
    default: "",
    title: "Url Pattern",
    description:
      "Optional regex pattern to filter URLs (only crawl matching URLs)"
  })
  declare url_pattern: any;

  @prop({
    type: "str",
    default: "",
    title: "Exclude Pattern",
    description: "Optional regex pattern to exclude URLs (skip matching URLs)"
  })
  declare exclude_pattern: any;

  async process(): Promise<Record<string, unknown>> {
    const startUrl = String(this.start_url ?? "");
    const maxDepth = Number(this.max_depth ?? 2);
    const maxPages = Number(this.max_pages ?? 50);
    const sameDomainOnly = Boolean(this.same_domain_only ?? true);
    const includeHtml = Boolean(this.include_html ?? false);
    const respectRobotsTxt = Boolean(this.respect_robots_txt ?? true);
    const delayMs = Number(this.delay_ms ?? 1000);
    const timeout = Number(this.timeout ?? 30000);
    const urlPattern = String(this.url_pattern ?? "");
    const excludePattern = String(this.exclude_pattern ?? "");

    if (!startUrl) throw new Error("start_url is required");

    const axios = (await import("axios")).default;
    const cheerio = await import("cheerio");

    const startParsed = new URL(startUrl);
    const startDomain = `${startParsed.protocol}//${startParsed.host}`;

    const urlPatternRe = urlPattern ? new RegExp(urlPattern) : null;
    const excludePatternRe = excludePattern ? new RegExp(excludePattern) : null;

    // robots.txt cache and parser
    const robotsCache = new Map<string, string[]>(); // origin -> disallowed paths

    const fetchRobotsTxt = async (origin: string): Promise<string[]> => {
      if (robotsCache.has(origin)) return robotsCache.get(origin)!;
      const disallowed: string[] = [];
      try {
        const res = await axios.get(`${origin}/robots.txt`, {
          headers: { "User-Agent": USER_AGENT },
          timeout: 10000,
          responseType: "text",
          validateStatus: () => true
        });
        if (res.status === 200 && typeof res.data === "string") {
          // Parse robots.txt — look for User-agent: * sections
          const lines = res.data.split("\n");
          let inWildcard = false;
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (/^user-agent\s*:/i.test(line)) {
              const agent = line.replace(/^user-agent\s*:\s*/i, "").trim();
              inWildcard = agent === "*";
            } else if (inWildcard && /^disallow\s*:/i.test(line)) {
              const path = line.replace(/^disallow\s*:\s*/i, "").trim();
              if (path) disallowed.push(path);
            }
          }
        }
      } catch {
        // robots.txt not available — allow all
      }
      robotsCache.set(origin, disallowed);
      return disallowed;
    };

    const isAllowedByRobots = async (urlStr: string): Promise<boolean> => {
      if (!respectRobotsTxt) return true;
      try {
        const parsed = new URL(urlStr);
        const origin = `${parsed.protocol}//${parsed.host}`;
        const disallowed = await fetchRobotsTxt(origin);
        const path = parsed.pathname;
        for (const rule of disallowed) {
          // Handle wildcard rules with trailing *
          if (rule.endsWith("*")) {
            if (path.startsWith(rule.slice(0, -1))) return false;
          } else if (path.startsWith(rule)) {
            return false;
          }
        }
        return true;
      } catch {
        return true;
      }
    };

    const visited = new Set<string>();
    const toVisit: Array<{ url: string; depth: number }> = [
      { url: startUrl, depth: 0 }
    ];
    const results: Array<Record<string, unknown>> = [];
    let pagesCrawled = 0;

    while (toVisit.length > 0 && pagesCrawled < maxPages) {
      const item = toVisit.shift()!;
      const { url: currentUrl, depth } = item;

      if (visited.has(currentUrl)) continue;
      if (depth > maxDepth) continue;
      if (urlPatternRe && !urlPatternRe.test(currentUrl)) continue;
      if (excludePatternRe && excludePatternRe.test(currentUrl)) continue;

      // Check robots.txt before crawling
      if (!(await isAllowedByRobots(currentUrl))) {
        visited.add(currentUrl);
        continue;
      }

      visited.add(currentUrl);

      try {
        const response = await axios.get(currentUrl, {
          headers: { "User-Agent": USER_AGENT },
          timeout,
          responseType: "text",
          validateStatus: () => true
        });

        const statusCode = response.status;
        const htmlContent = String(response.data);
        const $ = cheerio.load(htmlContent);
        const title = $("title").text() || null;

        results.push({
          url: currentUrl,
          depth,
          html: includeHtml ? htmlContent : null,
          title,
          status_code: statusCode
        });
        pagesCrawled++;

        if (depth < maxDepth) {
          $("a[href]").each((_i, el) => {
            try {
              const href = $(el).attr("href") ?? "";
              if (
                !href ||
                href.startsWith("javascript:") ||
                href.startsWith("mailto:") ||
                href.startsWith("tel:")
              )
                return;
              const resolved = new URL(href, currentUrl).href.split("#")[0];
              if (visited.has(resolved)) return;

              if (sameDomainOnly) {
                const linkParsed = new URL(resolved);
                const linkDomain = `${linkParsed.protocol}//${linkParsed.host}`;
                if (linkDomain !== startDomain) return;
              }

              if (!toVisit.some((v) => v.url === resolved)) {
                toVisit.push({ url: resolved, depth: depth + 1 });
              }
            } catch {
              // invalid URL, skip
            }
          });
        }

        if (delayMs > 0 && toVisit.length > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch {
        results.push({
          url: currentUrl,
          depth,
          html: null,
          title: null,
          status_code: 0
        });
      }
    }

    return { output: results };
  }
}

export const LIB_BROWSER_NODES: readonly NodeClass[] = [
  WebFetchLibNode,
  DownloadFileLibNode,
  BrowserLibNode,
  ScreenshotLibNode,
  BrowserNavigationLibNode,
  SpiderCrawlLibNode
] as const;
