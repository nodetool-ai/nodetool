---
layout: page
title: "Apify Linked In Scraper"
node_type: "apify.scraping.ApifyLinkedInScraper"
namespace: "apify.scraping"
---

**Type:** `apify.scraping.ApifyLinkedInScraper`

**Namespace:** `apify.scraping`

## Description

Scrape LinkedIn profiles, company pages, and job postings.
    Extract professional information, connections, and company data.
    apify, linkedin, professional, social, scraping, profiles, jobs

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| profile_urls | `list[str]` | List of LinkedIn profile URLs to scrape | null |
| company_urls | `list[str]` | List of LinkedIn company page URLs to scrape | null |
| job_search_urls | `list[str]` | List of LinkedIn job search URLs | null |
| max_results | `int` | Maximum number of results to scrape | `50` |
| wait_for_finish | `int` | Maximum time to wait for scraping to complete (seconds) | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict[str, any]]` |  |

## Related Nodes

Browse other nodes in the [apify.scraping](../) namespace.
