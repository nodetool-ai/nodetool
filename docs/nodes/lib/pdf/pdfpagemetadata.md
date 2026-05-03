---
layout: page
title: "PDF Page Metadata"
node_type: "lib.pdf.PageMetadata"
namespace: "lib.pdf"
---

**Type:** `lib.pdf.PageMetadata`

**Namespace:** `lib.pdf`

## Description

Get dimensions and bounding box for each page.
    pdf, metadata, pages, size, dimensions

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
