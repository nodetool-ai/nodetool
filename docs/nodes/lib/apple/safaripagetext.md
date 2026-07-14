---
layout: page
title: "Safari Page Text"
node_type: "lib.apple.SafariPageText"
namespace: "lib.apple"
---

**Type:** `lib.apple.SafariPageText`

**Namespace:** `lib.apple`

## Description

Extract visible text from Safari's front document via injected JavaScript (requires 'Allow JavaScript from Apple Events' in Safari's Develop menu).
    safari, page, text, extract

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| max_chars | `int` | Truncate output to this many characters | `50000` |
| prefer_article | `bool` | Use <article> innerText when present | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [lib.apple](./) namespace.
