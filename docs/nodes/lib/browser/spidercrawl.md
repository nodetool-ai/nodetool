---
layout: page
title: "Spider Crawl"
node_type: "lib.browser.SpiderCrawl"
namespace: "lib.browser"
---

**Type:** `lib.browser.SpiderCrawl`

**Namespace:** `lib.browser`

## Description

Crawls websites following links and emitting URLs with optional HTML content.
    spider, crawler, web scraping, links, sitemap

    Use cases:
    - Build sitemaps and discover website structure
    - Collect URLs for bulk processing
    - Find all pages on a website
    - Extract content from multiple pages
    - Feed agentic workflows with discovered pages
    - Analyze website content and structure

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| start_url | `str` | The starting URL to begin crawling from | `` |
| max_depth | `int` | Maximum depth to crawl (0 = start page only, 1 = start + linked pages, etc.) | `2` |
| max_pages | `int` | Maximum number of pages to crawl (safety limit) | `50` |
| same_domain_only | `bool` | Only follow links within the same domain as the start URL | `true` |
| include_html | `bool` | Include the HTML content of each page in the output (increases bandwidth) | `false` |
| respect_robots_txt | `bool` | Respect robots.txt rules (follows web crawler best practices) | `true` |
| delay_ms | `int` | Delay in milliseconds between requests (politeness policy) | `1000` |
| timeout | `int` | Timeout in milliseconds for each page load | `30000` |
| url_pattern | `str` | Optional regex pattern to filter URLs (only crawl matching URLs) | `` |
| exclude_pattern | `str` | Optional regex pattern to exclude URLs (skip matching URLs) | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| url | `str` |  |
| depth | `int` |  |
| html | `str` |  |
| title | `str` |  |
| status_code | `int` |  |
| pages | `list` |  |

## Related Nodes

Browse other nodes in the [lib.browser](../) namespace.
