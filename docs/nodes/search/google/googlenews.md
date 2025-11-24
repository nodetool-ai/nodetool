---
layout: page
title: "Google News"
node_type: "search.google.GoogleNews"
namespace: "search.google"
---

**Type:** `search.google.GoogleNews`

**Namespace:** `search.google`

## Description

Search Google News to retrieve live news articles.
    google, news, serp, articles

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| keyword | `str` | Search query or keyword for news articles | `` |
| num_results | `int` | Maximum number of news results to return | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[news_result]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [search.google](../) namespace.

