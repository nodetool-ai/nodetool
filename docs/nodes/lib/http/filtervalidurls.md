---
layout: page
title: "Filter Valid URLs"
node_type: "lib.http.FilterValidURLs"
namespace: "lib.http"
---

**Type:** `lib.http.FilterValidURLs`

**Namespace:** `lib.http`

## Description

Filter a list of URLs by checking their validity using HEAD requests.
    url validation, http, head request

    Use cases:
    - Clean URL lists by removing broken links
    - Verify resource availability
    - Validate website URLs before processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | The URL to make the request to. | `` |
| urls | `List[str]` | List of URLs to validate. | `[]` |
| max_concurrent_requests | `int` | Maximum number of concurrent HEAD requests. | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[str]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

