---
layout: page
title: "HTTP PUT"
node_type: "lib.http.Put"
namespace: "lib.http"
---

**Type:** `lib.http.Put`

**Namespace:** `lib.http`

## Description

Send a PUT request with JSON body.
    http, put, update, request, api

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| url | `str` | URL to update | `` |
| body | `any` | Request body (will be JSON-encoded) | null |
| headers | `str` | Optional JSON object of request headers | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |
| status | `int` |  |

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.
