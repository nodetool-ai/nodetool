---
layout: page
title: "PDF Extract Text Blocks"
node_type: "lib.pdf.ExtractTextBlocks"
namespace: "lib.pdf"
---

**Type:** `lib.pdf.ExtractTextBlocks`

**Namespace:** `lib.pdf`

## Description

Extract text blocks with bounding boxes, useful for layout analysis.
    pdf, text, blocks, layout, bbox, position

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
