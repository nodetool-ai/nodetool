---
layout: page
title: "Apify Twitter Scraper"
node_type: "apify.scraping.ApifyTwitterScraper"
namespace: "apify.scraping"
---

**Type:** `apify.scraping.ApifyTwitterScraper`

**Namespace:** `apify.scraping`

## Description

Scrape Twitter/X posts, profiles, and followers.
    Extract tweets, user information, and engagement metrics.
    apify, twitter, x, social, media, scraping, tweets, posts

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| search_terms | `list[str]` | List of search terms to find tweets | null |
| usernames | `list[str]` | List of Twitter usernames to scrape | null |
| tweet_urls | `list[str]` | List of specific tweet URLs to scrape | null |
| max_tweets | `int` | Maximum number of tweets to scrape | `100` |
| wait_for_finish | `int` | Maximum time to wait for scraping to complete (seconds) | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict[str, any]]` |  |

## Related Nodes

Browse other nodes in the [apify.scraping](../) namespace.
