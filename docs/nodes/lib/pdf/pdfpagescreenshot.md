---
layout: page
title: "PDF Page Screenshot"
node_type: "lib.pdf.Screenshot"
namespace: "lib.pdf"
---

**Type:** `lib.pdf.Screenshot`

**Namespace:** `lib.pdf`

## Description

Render PDF pages as PNG images.
    pdf, screenshot, render, image, pages, png

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| start_page | `int` | First page to render (0-based) | `0` |
| end_page | `int` | Last page to render (-1 for all) | `-1` |
| dpi | `int` | Rendering resolution in dots per inch | `150` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[image]` |  |

## Related Nodes

Browse other nodes in the [lib.pdf](../) namespace.
