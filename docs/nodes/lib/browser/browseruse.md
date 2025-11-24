---
layout: page
title: "Browser Use"
node_type: "lib.browser.BrowserUse"
namespace: "lib.browser"
---

**Type:** `lib.browser.BrowserUse`

**Namespace:** `lib.browser`

## Description

Browser agent tool that uses browser_use under the hood.

    This module provides a tool for running browser-based agents using the browser_use library.
    The agent can perform complex web automation tasks like form filling, navigation, data extraction,
    and multi-step workflows using natural language instructions.

    Use cases:
    - Perform complex web automation tasks based on natural language.
    - Automate form filling and data entry.
    - Scrape data after complex navigation or interaction sequences.
    - Automate multi-step web workflows.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `Enum['gpt-4o', 'claude-3-5-sonnet']` | The model to use for the browser agent. | `gpt-4o` |
| task | `str` | Natural language description of the browser task to perform. Can include complex multi-step instructions like 'Compare prices between websites', 'Fill out forms', or 'Extract specific data'. | `` |
| timeout | `int` | Maximum time in seconds to allow for task completion. Complex tasks may require longer timeouts. | `300` |
| use_remote_browser | `bool` | Use a remote browser instead of a local one | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| success | `bool` |  |
| task | `str` |  |
| result | `any` |  |
| error | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.browser](../) namespace.

