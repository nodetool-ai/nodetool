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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| html | `str` | HTML content to convert | `` |
| base_url | `str` | Base URL for resolving relative links | `` |
| body_width | `int` | Width for text wrapping | `1000` |
| ignore_images | `bool` | Whether to ignore image tags | `true` |
| ignore_mailto_links | `bool` | Whether to ignore mailto links | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
