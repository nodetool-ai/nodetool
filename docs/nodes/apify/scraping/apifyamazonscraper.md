---
layout: page
title: "Apify Amazon Scraper"
node_type: "apify.scraping.ApifyAmazonScraper"
namespace: "apify.scraping"
---

**Type:** `apify.scraping.ApifyAmazonScraper`

**Namespace:** `apify.scraping`

## Description

Scrape Amazon product data including prices, reviews, and ratings.
    Extract product details, seller information, and customer reviews.
    apify, amazon, ecommerce, products, scraping, prices, reviews

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| search_queries | `list[str]` | List of search queries to execute on Amazon | null |
| product_urls | `list[str]` | List of Amazon product URLs to scrape | null |
| country_code | `str` | Amazon country code (US, UK, DE, FR, ES, IT, etc.) | `US` |
| max_items | `int` | Maximum number of products to scrape per search | `20` |
| scrape_reviews | `bool` | Whether to scrape product reviews | `false` |
| wait_for_finish | `int` | Maximum time to wait for scraping to complete (seconds) | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict[str, any]]` |  |

## Related Nodes

Browse other nodes in the [apify.scraping](../) namespace.
