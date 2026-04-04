---
layout: page
title: "Convert HTML to Text"
node_type: "lib.html.HTMLToText"
namespace: "lib.html"
---

**Type:** `lib.html.HTMLToText`

**Namespace:** `lib.html`

## Description

Converts HTML to plain text by removing tags and decoding entities using BeautifulSoup.
    html, text, convert

    Use cases:
    - Cleaning HTML content for text analysis
    - Extracting readable content from web pages
    - Preparing HTML data for natural language processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` |  | `` |
| preserve_linebreaks | `bool` | Convert block-level elements to newlines | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.html](../) namespace.

