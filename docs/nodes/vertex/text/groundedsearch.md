---
layout: page
title: "GroundedSearch"
node_type: "vertex.text.GroundedSearch"
namespace: "vertex.text"
---

**Type:** `vertex.text.GroundedSearch`

**Namespace:** `vertex.text`

## Description

Search the web with Gemini on Vertex AI, grounded in Google Search results, billed to your Google Cloud project.
    {...}, search, grounding, web, sources

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| query | `str` | The search query to execute | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| results | `list[str]` |  |
| sources | `list[source]` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [vertex.text](./) namespace.
