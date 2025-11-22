---
layout: page
title: "GET Binary"
node_type: "lib.http.GetRequestBinary"
namespace: "lib.http"
---

**Type:** `lib.http.GetRequestBinary`

**Namespace:** `lib.http`

## Description

Perform an HTTP GET request and return raw binary data.
    http, get, request, url, binary, download

    Use cases:
    - Download binary files
    - Fetch images or media
    - Retrieve PDF documents
    - Download any non-text content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | The URL to make the request to. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bytes` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

