import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { withPage } from "../lib/cdp-page.js";

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

    const cheerio = await import("cheerio");
    const TurndownService = (await import("turndown")).default;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
    const responseText = await response.text();

    const contentType = String(
      response.headers.get("content-type") ?? ""
    ).toLowerCase();
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      return { output: responseText };
    }

    const $ = cheerio.load(responseText);
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = Buffer.from(await response.arrayBuffer()).toString("base64");
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

    const TurndownService = (await import("turndown")).default;
    return withPage({ headless: true }, async (page) => {
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
    });
  }
}

export class ScreenshotLibNode extends BaseNode {
  static readonly nodeType = "lib.browser.Screenshot";
  static readonly title = "Screenshot";
  static readonly description =
    "Takes a screenshot of a web page or specific element.\n    browser, screenshot, capture, image\n\n    Use cases:\n    - Capture visual representation of web pages\n    - Document specific UI elements\n    - Create visual records of web content";
  static readonly metadataOutputTypes = {
    output: "image"
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

    return withPage({ headless: true }, async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });

      let buffer: Buffer;
      if (selector) {
        await page.waitForSelector(selector, { timeout });
        buffer = await page.screenshotOfElement(selector);
      } else {
        buffer = await page.screenshot();
      }

      return {
        output: {
          type: "image",
          data: buffer.toString("base64"),
          mime_type: "image/png"
        }
      };
    });
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
    status_code: "int",
    pages: "list"
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
    const allPages: Array<Record<string, unknown>> = [];
    for await (const page of this._crawlPages()) {
      allPages.push(page);
    }
    const first = allPages[0] ?? {
      url: "",
      depth: 0,
      html: null,
      title: null,
      status_code: 0
    };
    return {
      url: first.url,
      depth: first.depth,
      html: first.html,
      title: first.title,
      status_code: first.status_code,
      pages: allPages
    };
  }

  private async *_crawlPages(): AsyncGenerator<Record<string, unknown>> {
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
        const robotsController = new AbortController();
        const robotsTimeoutId = setTimeout(
          () => robotsController.abort(),
          10000
        );
        let res: Response;
        try {
          res = await fetch(`${origin}/robots.txt`, {
            headers: { "User-Agent": USER_AGENT },
            signal: robotsController.signal
          });
        } finally {
          clearTimeout(robotsTimeoutId);
        }
        const resText = await res.text();
        if (res.ok && typeof resText === "string") {
          // Parse robots.txt — look for User-agent: * sections
          const lines = resText.split("\n");
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
        const crawlController = new AbortController();
        const crawlTimeoutId = setTimeout(
          () => crawlController.abort(),
          timeout
        );
        let response: Response;
        try {
          response = await fetch(currentUrl, {
            headers: { "User-Agent": USER_AGENT },
            signal: crawlController.signal
          });
        } finally {
          clearTimeout(crawlTimeoutId);
        }

        const statusCode = response.status;
        const htmlContent = await response.text();
        const $ = cheerio.load(htmlContent);
        const title = $("title").text() || null;

        yield {
          url: currentUrl,
          depth,
          html: includeHtml ? htmlContent : null,
          title,
          status_code: statusCode
        };
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
        yield {
          url: currentUrl,
          depth,
          html: null,
          title: null,
          status_code: 0
        };
      }
    }
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const allPages: Array<Record<string, unknown>> = [];
    for await (const page of this._crawlPages()) {
      allPages.push(page);
      yield page;
    }
    // Emit collected list as final output
    yield { pages: allPages };
  }
}

export const LIB_BROWSER_NODES: readonly NodeClass[] = [
  WebFetchLibNode,
  DownloadFileLibNode,
  BrowserLibNode,
  ScreenshotLibNode,
  SpiderCrawlLibNode
] as const;
