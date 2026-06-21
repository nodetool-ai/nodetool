---
layout: page
title: "Apify Instagram Scraper"
node_type: "apify.scraping.ApifyInstagramScraper"
namespace: "apify.scraping"
---

**Type:** `apify.scraping.ApifyInstagramScraper`

**Namespace:** `apify.scraping`

## Description

Scrape Instagram profiles, posts, comments, and hashtags — user data, post details, and engagement metrics.
    apify, instagram, social, media, scraping, posts, profiles

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| usernames | `list[str]` | List of Instagram usernames to scrape | null |
| hashtags | `list[str]` | List of hashtags to scrape | null |
| results_limit | `int` | Maximum number of posts to scrape per profile/hashtag | `50` |
| scrape_comments | `bool` | Whether to scrape comments on posts | `false` |
| scrape_likes | `bool` | Whether to scrape likes on posts | `false` |
| wait_for_finish | `int` | Maximum time to wait for scraping to complete (seconds) | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict[str, any]]` |  |

## Related Nodes

Browse other nodes in the [apify.scraping](./) namespace.
