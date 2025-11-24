---
layout: page
title: "POST JSON"
node_type: "lib.http.JSONPostRequest"
namespace: "lib.http"
---

**Type:** `lib.http.JSONPostRequest`

**Namespace:** `lib.http`

## Description

Send JSON data to a server using an HTTP POST request.
    http, post, request, url, json, api

    Use cases:
    - Send structured data to REST APIs
    - Create resources with JSON payloads
    - Interface with modern web services

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `str` | The URL to make the request to. | `` |
| data | `Dict[Any, Any]` | The JSON data to send in the POST request. | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[Any, Any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

