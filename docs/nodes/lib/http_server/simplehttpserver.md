---
layout: page
title: "Simple Http Server"
node_type: "lib.http_server.SimpleHttpServer"
namespace: "lib.http_server"
---

**Type:** `lib.http_server.SimpleHttpServer`

**Namespace:** `lib.http_server`

## Description

Starts a simple HTTP server inside Docker and streams logs.
    http, server, web

    Emits the reachable endpoint URL on the "endpoint" output when ready,
    then streams stdout/stderr lines on the corresponding outputs.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `str` | Docker image to run the server in | `python:3.11-slim` |
| container_port | `int` | Port the server listens on inside the container | `8000` |
| command | `str` | Startup command. If empty, uses 'python -m http.server <container_port> --bind 0.0.0.0' | `` |
| timeout_seconds | `int` | Max lifetime of the server container (seconds) | `600` |
| ready_timeout_seconds | `int` | Seconds to wait for server readiness | `15` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| endpoint | `str` |  |
| stdout | `str` |  |
| stderr | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http_server](../) namespace.

