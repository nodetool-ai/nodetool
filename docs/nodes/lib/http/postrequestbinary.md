---
layout: page
title: "POST Binary"
node_type: "lib.http.PostRequestBinary"
namespace: "lib.http"
---

**Type:** `lib.http.PostRequestBinary`

**Namespace:** `lib.http`

## Description

Send data using an HTTP POST request and return raw binary data.
    http, post, request, url, data, binary

    Use cases:
    - Upload and receive binary files
    - Interact with binary APIs
    - Process image or media uploads
    - Handle binary file transformations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | The URL to make the request to. | `` |
| data | `(str | bytes)` | The data to send in the POST request. Can be string or binary. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bytes` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

