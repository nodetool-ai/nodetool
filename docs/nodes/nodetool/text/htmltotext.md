---
layout: page
title: "HTML to Text"
node_type: "nodetool.text.HtmlToText"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.HtmlToText`

**Namespace:** `nodetool.text`

## Description

Converts HTML content to plain text using html2text.
    html, convert, text, parse, extract

    Use cases:
    - Converting HTML documents to readable plain text
    - Extracting text content from web pages
    - Cleaning HTML markup from text data
    - Processing HTML emails or documents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| html | `any` | HTML content to convert | `` |
| base_url | `any` | Base URL for resolving relative links | `` |
| body_width | `any` | Width for text wrapping | `1000` |
| ignore_images | `any` | Whether to ignore image tags | `True` |
| ignore_mailto_links | `any` | Whether to ignore mailto links | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

