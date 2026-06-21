---
layout: page
title: "PDF Rasterize (pdftoppm)"
node_type: "lib.pdf.Pdftoppm"
namespace: "lib.pdf"
---

**Type:** `lib.pdf.Pdftoppm`

**Namespace:** `lib.pdf`

## Description

Rasterize PDF pages with poppler's pdftoppm. Higher fidelity than the PDFium-based Screenshot node for some PDFs and supports anti-aliasing controls.
    pdf, pdftoppm, poppler, rasterize, render, image, pages

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| start_page | `int` | First page to render (0-based) | `0` |
| end_page | `int` | Last page to render (-1 for all) | `-1` |
| dpi | `int` | Rendering resolution in dots per inch | `150` |
| format | `enum` | Output image format | `png` |
| scale_to | `int` | If > 0, scale the longest side to this many pixels (overrides DPI) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[image]` |  |

## Related Nodes

Browse other nodes in the [lib.pdf](./) namespace.
