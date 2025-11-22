---
layout: page
title: "Extract Links"
node_type: "lib.beautifulsoup.ExtractLinks"
namespace: "lib.beautifulsoup"
---

**Type:** `lib.beautifulsoup.ExtractLinks`

**Namespace:** `lib.beautifulsoup`

## Description

Extract links from HTML content.
    extract, links, urls

    Use cases:
    - Analyze website structure
    - Discover related content
    - Build sitemaps

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| html | `str` | The HTML content to extract links from. | `` |
| base_url | `str` | The base URL of the page, used to determine internal/external links. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| href | `str` |  |
| text | `str` |  |
| type | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.beautifulsoup](../) namespace.

