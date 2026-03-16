// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// Web Fetch — lib.browser.WebFetch
export interface WebFetchInputs {
  url?: Connectable<string>;
  selector?: Connectable<string>;
}

export function webFetch(inputs: WebFetchInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.browser.WebFetch", inputs as Record<string, unknown>);
}

// Download File — lib.browser.DownloadFile
export interface DownloadFileInputs {
  url?: Connectable<string>;
}

export function downloadFile(inputs: DownloadFileInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.browser.DownloadFile", inputs as Record<string, unknown>);
}

// Browser — lib.browser.Browser
export interface BrowserInputs {
  url?: Connectable<string>;
  timeout?: Connectable<number>;
}

export interface BrowserOutputs {
  success: OutputHandle<boolean>;
  content: OutputHandle<string>;
  metadata: OutputHandle<Record<string, unknown>>;
}

export function browser(inputs: BrowserInputs): DslNode<BrowserOutputs> {
  return createNode("lib.browser.Browser", inputs as Record<string, unknown>, { multiOutput: true });
}

// Screenshot — lib.browser.Screenshot
export interface ScreenshotInputs {
  url?: Connectable<string>;
  selector?: Connectable<string>;
  output_file?: Connectable<string>;
  timeout?: Connectable<number>;
}

export function screenshot(inputs: ScreenshotInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.browser.Screenshot", inputs as Record<string, unknown>);
}

// Browser Navigation — lib.browser.BrowserNavigation
export interface BrowserNavigationInputs {
  url?: Connectable<string>;
  action?: Connectable<unknown>;
  selector?: Connectable<string>;
  timeout?: Connectable<number>;
  wait_for?: Connectable<string>;
  extract_type?: Connectable<unknown>;
  attribute?: Connectable<string>;
}

export function browserNavigation(inputs: BrowserNavigationInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.browser.BrowserNavigation", inputs as Record<string, unknown>);
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
  url: OutputHandle<string>;
  depth: OutputHandle<number>;
  html: OutputHandle<string>;
  title: OutputHandle<string>;
  status_code: OutputHandle<number>;
}

export function spiderCrawl(inputs: SpiderCrawlInputs): DslNode<SpiderCrawlOutputs> {
  return createNode("lib.browser.SpiderCrawl", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Browser Use — lib.browser.BrowserUse
export interface BrowserUseInputs {
  model?: Connectable<unknown>;
  task?: Connectable<string>;
  timeout?: Connectable<number>;
  use_remote_browser?: Connectable<boolean>;
}

export interface BrowserUseOutputs {
  success: OutputHandle<boolean>;
  task: OutputHandle<string>;
  result: OutputHandle<unknown>;
  error: OutputHandle<string>;
}

export function browserUse(inputs: BrowserUseInputs): DslNode<BrowserUseOutputs> {
  return createNode("lib.browser.BrowserUse", inputs as Record<string, unknown>, { multiOutput: true });
}
