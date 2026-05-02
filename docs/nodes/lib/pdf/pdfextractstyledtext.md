---
layout: page
title: "PDF Extract Styled Text"
node_type: "lib.pdf.ExtractStyledText"
namespace: "lib.pdf"
---

**Type:** `lib.pdf.ExtractStyledText`

**Namespace:** `lib.pdf`

## Description

Extract text spans with font name, size, bounding box, and color (always null; liteparse does not expose per-span color).
    pdf, text, style, font, size, formatting, color

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| start_page | `int` | First page (0-based) | `0` |
| end_page | `int` | Last page (-1 for all) | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict]` |  |

## Related Nodes

Browse other nodes in the [lib.pdf](../) namespace.
