---
layout: page
title: "Browser"
node_type: "lib.browser.Browser"
namespace: "lib.browser"
---

**Type:** `lib.browser.Browser`

**Namespace:** `lib.browser`

## Description

Fetches content from a web page using a headless browser.
    browser, web, scraping, content, fetch

    Use cases:
    - Extract content from JavaScript-heavy websites
    - Retrieve text content from web pages
    - Get metadata from web pages
    - Save extracted content to files

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | URL to navigate to | `` |
| timeout | `int` | Timeout in milliseconds for page navigation | `20000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| success | `bool` |  |
| content | `str` |  |
| metadata | `Dict[str, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.browser](../) namespace.

