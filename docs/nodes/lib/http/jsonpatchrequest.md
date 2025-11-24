---
layout: page
title: "PATCH JSON"
node_type: "lib.http.JSONPatchRequest"
namespace: "lib.http"
---

**Type:** `lib.http.JSONPatchRequest`

**Namespace:** `lib.http`

## Description

Partially update resources with JSON data using an HTTP PATCH request.
    http, patch, request, url, json, api

    Use cases:
    - Partial updates to API resources
    - Modify specific fields without full replacement
    - Efficient updates for large objects

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | The URL to make the request to. | `` |
| data | `Dict[Any, Any]` | The JSON data to send in the PATCH request. | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[Any, Any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

