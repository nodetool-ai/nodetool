---
layout: page
title: "Fetch Page"
node_type: "lib.http.FetchPage"
namespace: "lib.http"
---

**Type:** `lib.http.FetchPage`

**Namespace:** `lib.http`

## Description

Fetch a web page using Selenium and return its content.
    selenium, fetch, webpage, http

    Use cases:
    - Retrieve content from dynamic websites
    - Capture JavaScript-rendered content
    - Interact with web applications

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `any` | The URL to fetch the page from. | `` |
| wait_time | `any` | Maximum time to wait for page load (in seconds). | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| html | `any` |  |
| success | `any` |  |
| error_message | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

