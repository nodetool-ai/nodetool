---
layout: page
title: "Extract Links"
node_type: "lib.html.ExtractLinks"
namespace: "lib.html"
---

**Type:** `lib.html.ExtractLinks`

**Namespace:** `lib.html`

## Description

Extract all links from HTML content with type classification.
    extract, links, urls, web scraping, html

    Use cases:
    - Analyze website structure and navigation
    - Discover related content and resources
    - Build sitemaps and link graphs
    - Find internal and external references
    - Collect URLs for further processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| html | `str` | The HTML content to extract links from. | `` |
| base_url | `str` | The base URL of the page, used to determine internal/external links. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| href | `str` |  |
| text | `str` |  |
| type | `str` |  |
| links | `list` |  |

## Related Nodes

Browse other nodes in the [lib.html](../) namespace.
