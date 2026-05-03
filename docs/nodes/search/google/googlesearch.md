---
layout: page
title: "Google Search"
node_type: "search.google.GoogleSearch"
namespace: "search.google"
---

**Type:** `search.google.GoogleSearch`

**Namespace:** `search.google`

## Description

Search Google to retrieve organic search results from the web.
    google, search, serp, web, query

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| keyword | `str` | Search query or keyword to search for | `` |
| num_results | `int` | Maximum number of results to return | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| results | `list[organic_result]` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [search.google](../) namespace.
