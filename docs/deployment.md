---
layout: page
title: "Deployment Guide"
description: "Choose between self-hosting the NodeTool server with Docker and renting GPU workers (RunPod, Vast, Verda) for graphs that need a GPU."
---

NodeTool deploys two kinds of machine. A **server** runs the app that people open in a browser. A **worker** is a rented GPU that your NodeTool connects to for Python nodes.

|  | **Server** | **Worker** |
|---|---|---|
| Who connects | people and the web UI connect in | your NodeTool connects out to it |
| Lifetime | long-lived, always on | short-lived: start, attach, stop |
| What you hand out | a URL | nothing, NodeTool stores its address and token |
| Cost | your own host | **bills while it exists, so stop or terminate it** |
| Guide | [Self-Hosted Deployment](self-hosted-deployment.md) | [Worker Deployment](worker-deployment.md) |

Server deployment is Docker only. Docker Compose, a plain `docker run` or `podman run`, `nodetool deploy` over SSH, and running without a container are all on [Self-Hosted Deployment](self-hosted-deployment.md).

## What do you want to do?

| I want to... | Go to |
|--------------|-------|
| **Run the NodeTool server on my own machine or host** | [Self-Hosted Deployment](self-hosted-deployment.md) |
| **Install the CLI, run from source, or set up Python nodes and GPU drivers** | [Advanced Installs](advanced-install.md) |
| **Rent a GPU to run Python nodes (RunPod, Vast, Verda)** | [Worker Deployment](worker-deployment.md) |
| **Cap memory, CPU, and GPU for the server container** | [Docker Resource Management](docker-resource-management.md) |
| **Use Supabase for login and asset storage** | [Supabase Deployment Integration](supabase-deployment.md) |
| **Set up TLS/HTTPS** | [Serving the Web UI and TLS](server-configuration.md#serving-the-web-ui-and-tls) |
| **Connect Claude Code or another MCP client to a deployed server** | [MCP on a Production Server](mcp-production.md) |
| **See how api.nodetool.ai itself is deployed** | [Production Deploy (Docker)](docker-production-deploy.md) |
| **Fix a deployment that fails to start** | [Troubleshooting](troubleshooting.md#a-deployment-fails-or-the-service-wont-start) |
