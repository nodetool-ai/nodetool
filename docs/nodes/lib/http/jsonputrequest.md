---
layout: page
title: "PUT JSON"
node_type: "lib.http.JSONPutRequest"
namespace: "lib.http"
---

**Type:** `lib.http.JSONPutRequest`

**Namespace:** `lib.http`

## Description

Update resources with JSON data using an HTTP PUT request.
    http, put, request, url, json, api

    Use cases:
    - Update existing API resources
    - Replace complete objects in REST APIs
    - Set configuration with JSON data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | The URL to make the request to. | `` |
| data | `Dict[Any, Any]` | The JSON data to send in the PUT request. | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[Any, Any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

