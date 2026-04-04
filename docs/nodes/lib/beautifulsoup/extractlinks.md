---
layout: page
title: "Extract Links"
node_type: "lib.html.ExtractLinks"
namespace: "lib.html"
---

**Type:** `lib.html.ExtractLinks`

**Namespace:** `lib.html`

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

Browse other nodes in the [lib.html](../) namespace.

