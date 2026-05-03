---
layout: page
title: "Apify Google Search Scraper"
node_type: "apify.scraping.ApifyGoogleSearchScraper"
namespace: "apify.scraping"
---

**Type:** `apify.scraping.ApifyGoogleSearchScraper`

**Namespace:** `apify.scraping`

## Description

Scrape Google Search results using Apify's Google Search Scraper.
    Extract organic results, ads, related searches, and more.
    apify, google, search, serp, scraping, seo

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| queries | `list[str]` | List of search queries to execute | null |
| country_code | `str` | Country code for Google search (e.g., 'us', 'uk', 'de') | `us` |
| language_code | `str` | Language code for results (e.g., 'en', 'es', 'fr') | `en` |
| max_pages | `int` | Maximum number of result pages per query | `1` |
| results_per_page | `int` | Number of results per page (10-100) | `100` |
| wait_for_finish | `int` | Maximum time to wait for scraping to complete (seconds) | `300` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict[str, any]]` |  |

## Related Nodes

Browse other nodes in the [apify.scraping](../) namespace.
