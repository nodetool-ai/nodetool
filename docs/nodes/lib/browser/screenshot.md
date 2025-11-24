---
layout: page
title: "Screenshot"
node_type: "lib.browser.Screenshot"
namespace: "lib.browser"
---

**Type:** `lib.browser.Screenshot`

**Namespace:** `lib.browser`

## Description

Takes a screenshot of a web page or specific element.
    browser, screenshot, capture, image

    Use cases:
    - Capture visual representation of web pages
    - Document specific UI elements
    - Create visual records of web content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | URL to navigate to before taking screenshot | `` |
| selector | `str` | Optional CSS selector for capturing a specific element | `` |
| output_file | `str` | Path to save the screenshot (relative to workspace) | `screenshot.png` |
| timeout | `int` | Timeout in milliseconds for page navigation | `30000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.browser](../) namespace.

