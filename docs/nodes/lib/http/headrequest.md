---
layout: page
title: "HEAD Request"
node_type: "lib.http.HeadRequest"
namespace: "lib.http"
---

**Type:** `lib.http.HeadRequest`

**Namespace:** `lib.http`

## Description

Retrieve headers from a resource using an HTTP HEAD request.
    http, head, request, url

    Use cases:
    - Check resource existence
    - Get metadata without downloading content
    - Verify authentication or permissions

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | The URL to make the request to. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, str]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

