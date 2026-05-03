---
layout: page
title: "Extract Images"
node_type: "lib.html.ExtractImages"
namespace: "lib.html"
---

**Type:** `lib.html.ExtractImages`

**Namespace:** `lib.html`

## Description

Extract images from HTML content.
    extract, images, src

    Use cases:
    - Collect images from web pages
    - Analyze image usage on websites
    - Create image galleries

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| html | `str` | The HTML content to extract images from. | `` |
| base_url | `str` | The base URL of the page, used to resolve relative image URLs. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `image` |  |
| images | `list` |  |

## Related Nodes

Browse other nodes in the [lib.html](../) namespace.
