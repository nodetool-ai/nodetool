---
layout: page
title: "Apify You Tube Scraper"
node_type: "apify.scraping.ApifyYouTubeScraper"
namespace: "apify.scraping"
---

**Type:** `apify.scraping.ApifyYouTubeScraper`

**Namespace:** `apify.scraping`

## Description

Scrape YouTube videos, channels, and playlists.
    Extract video metadata, comments, channel info, and statistics.
    apify, youtube, video, scraping, social, media, channels

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| search_queries | `list[str]` | List of search queries to execute on YouTube | null |
| video_urls | `list[str]` | List of YouTube video URLs to scrape | null |
| channel_urls | `list[str]` | List of YouTube channel URLs to scrape | null |
| max_results | `int` | Maximum number of videos to scrape | `50` |
| scrape_comments | `bool` | Whether to scrape video comments | `false` |
| wait_for_finish | `int` | Maximum time to wait for scraping to complete (seconds) | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict[str, any]]` |  |

## Related Nodes

Browse other nodes in the [apify.scraping](../) namespace.
