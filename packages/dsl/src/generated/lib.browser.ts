// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Web Fetch — lib.browser.WebFetch
export interface WebFetchInputs {
  url?: Connectable<string>;
  selector?: Connectable<string>;
}

export interface WebFetchOutputs {
  output: string;
}

export function webFetch(inputs: WebFetchInputs): DslNode<WebFetchOutputs, "output"> {
  return createNode("lib.browser.WebFetch", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Download File — lib.browser.DownloadFile
export interface DownloadFileInputs {
  url?: Connectable<string>;
}

export interface DownloadFileOutputs {
  output: unknown;
}

export function downloadFile(inputs: DownloadFileInputs): DslNode<DownloadFileOutputs, "output"> {
  return createNode("lib.browser.DownloadFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Browser — lib.browser.Browser
export interface BrowserInputs {
  url?: Connectable<string>;
  timeout?: Connectable<number>;
}

export interface BrowserOutputs {
  success: boolean;
  content: string;
  metadata: Record<string, unknown>;
}

export function browser(inputs: BrowserInputs): DslNode<BrowserOutputs> {
  return createNode("lib.browser.Browser", inputs as Record<string, unknown>, { outputNames: ["success", "content", "metadata"] });
}

// Screenshot — lib.browser.Screenshot
export interface ScreenshotInputs {
  url?: Connectable<string>;
  selector?: Connectable<string>;
  output_file?: Connectable<string>;
  timeout?: Connectable<number>;
}

export interface ScreenshotOutputs {
  output: Record<string, unknown>;
}

export function screenshot(inputs: ScreenshotInputs): DslNode<ScreenshotOutputs, "output"> {
  return createNode("lib.browser.Screenshot", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Browser Navigation — lib.browser.BrowserNavigation
export interface BrowserNavigationInputs {
  url?: Connectable<string>;
  action?: Connectable<"click" | "goto" | "back" | "forward" | "reload" | "extract">;
  selector?: Connectable<string>;
  timeout?: Connectable<number>;
  wait_for?: Connectable<string>;
  extract_type?: Connectable<"text" | "html" | "value" | "attribute">;
  attribute?: Connectable<string>;
}

export interface BrowserNavigationOutputs {
  output: Record<string, unknown>;
}

export function browserNavigation(inputs: BrowserNavigationInputs): DslNode<BrowserNavigationOutputs, "output"> {
  return createNode("lib.browser.BrowserNavigation", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Spider Crawl — lib.browser.SpiderCrawl
export interface SpiderCrawlInputs {
  start_url?: Connectable<string>;
  max_depth?: Connectable<number>;
  max_pages?: Connectable<number>;
  same_domain_only?: Connectable<boolean>;
  include_html?: Connectable<boolean>;
  respect_robots_txt?: Connectable<boolean>;
  delay_ms?: Connectable<number>;
  timeout?: Connectable<number>;
  url_pattern?: Connectable<string>;
  exclude_pattern?: Connectable<string>;
}

export interface SpiderCrawlOutputs {
  url: string;
  depth: number;
  html: string;
  title: string;
  status_code: number;
  pages: unknown[];
}

export function spiderCrawl(inputs: SpiderCrawlInputs): DslNode<SpiderCrawlOutputs> {
  return createNode("lib.browser.SpiderCrawl", inputs as Record<string, unknown>, { outputNames: ["url", "depth", "html", "title", "status_code", "pages"], streaming: true });
}
