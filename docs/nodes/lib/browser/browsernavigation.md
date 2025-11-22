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
| url | `any` | URL to navigate to (required for 'goto' action) | `` |
| action | `any` | Navigation or extraction action to perform | `goto` |
| selector | `any` | CSS selector for the element to interact with or extract from | `` |
| timeout | `any` | Timeout in milliseconds for the action | `30000` |
| wait_for | `any` | Optional selector to wait for after performing the action | `` |
| extract_type | `any` | Type of content to extract (for 'extract' action) | `text` |
| attribute | `any` | Attribute name to extract (when extract_type is 'attribute') | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.browser](../) namespace.

