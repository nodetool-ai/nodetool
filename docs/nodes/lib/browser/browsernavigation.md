---
layout: page
title: "Browser Navigation"
node_type: "lib.browser.BrowserNavigation"
namespace: "lib.browser"
---

**Type:** `lib.browser.BrowserNavigation`

**Namespace:** `lib.browser`

## Description

Navigates and interacts with web pages in a browser session.
    browser, navigation, interaction, click, extract

    Use cases:
    - Perform complex web interactions
    - Navigate through multi-step web processes
    - Extract content after interaction

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | URL to navigate to (required for 'goto' action) | `` |
| action | `Enum['click', 'goto', 'back', 'forward', 'reload', 'extract']` | Navigation or extraction action to perform | `goto` |
| selector | `str` | CSS selector for the element to interact with or extract from | `` |
| timeout | `int` | Timeout in milliseconds for the action | `30000` |
| wait_for | `str` | Optional selector to wait for after performing the action | `` |
| extract_type | `Enum['text', 'html', 'value', 'attribute']` | Type of content to extract (for 'extract' action) | `text` |
| attribute | `str` | Attribute name to extract (when extract_type is 'attribute') | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.browser](../) namespace.

