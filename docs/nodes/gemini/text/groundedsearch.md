---
layout: page
title: "Grounded Search"
node_type: "gemini.text.GroundedSearch"
namespace: "gemini.text"
---

**Type:** `gemini.text.GroundedSearch`

**Namespace:** `gemini.text`

## Description

Search the web using Google's Gemini API with grounding capabilities.
    google, search, grounded, web, gemini, ai

    This node uses Google's Gemini API to perform web searches and return structured results
    with source information. Requires a Gemini API key.

    Use cases:
    - Research current events and latest information
    - Find reliable sources for fact-checking
    - Gather web-based information with citations
    - Get up-to-date information beyond the model's training data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| query | `any` | The search query to execute | `` |
| model | `any` | The Gemini model to use for search | `gemini-2.0-flash` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| results | `any` |  |
| sources | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [gemini.text](../) namespace.

