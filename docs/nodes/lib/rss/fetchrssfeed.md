---
layout: page
title: "Fetch RSS Feed"
node_type: "lib.rss.FetchRSSFeed"
namespace: "lib.rss"
---

**Type:** `lib.rss.FetchRSSFeed`

**Namespace:** `lib.rss`

## Description

Fetches and parses an RSS feed from a URL.
    rss, feed, network

    Use cases:
    - Monitor news feeds
    - Aggregate content from multiple sources
    - Process blog updates

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | URL of the RSS feed to fetch | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| title | `str` |  |
| link | `str` |  |
| published | `datetime` |  |
| summary | `str` |  |
| author | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.rss](../) namespace.

