---
layout: page
title: "Apify Web Scraper"
node_type: "apify.scraping.ApifyWebScraper"
namespace: "apify.scraping"
---

**Type:** `apify.scraping.ApifyWebScraper`

**Namespace:** `apify.scraping`

## Description

Scrape websites using Apify's Web Scraper actor.
    Extracts data from web pages using CSS selectors or custom JavaScript.
    apify, scraping, web, data, extraction, crawler

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| start_urls | `list[str]` | List of URLs to scrape | null |
| link_selector | `str` | CSS selector for links to follow | `a[href]` |
| page_function | `str` | JavaScript function to execute on each page | `` |
| max_pages | `int` | Maximum number of pages to scrape | `10` |
| wait_for_finish | `int` | Maximum time to wait for scraping to complete (seconds) | `300` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict[str, any]]` |  |

## Related Nodes

Browse other nodes in the [apify.scraping](../) namespace.
