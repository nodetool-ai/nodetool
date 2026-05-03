---
layout: page
title: "HTTP POST"
node_type: "lib.http.Post"
namespace: "lib.http"
---

**Type:** `lib.http.Post`

**Namespace:** `lib.http`

## Description

Send a POST request with JSON body.
    http, post, request, api, send

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| url | `str` | URL to send to | `` |
| body | `any` | Request body (will be JSON-encoded) | null |
| headers | `str` | Optional JSON object of request headers | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |
| status | `int` |  |

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.
