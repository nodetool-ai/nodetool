---
layout: page
title: "Web Search"
node_type: "xai.text.WebSearch"
namespace: "xai.text"
---

**Type:** `xai.text.WebSearch`

**Namespace:** `xai.text`

## Description

Answer questions using Grok with xAI Live Search over the web and X.
    xai, grok, search, web, live, realtime, citations

    Uses xAI's Live Search (search_parameters) so Grok can pull in
    real-time information from the web and X to answer the query.
    Requires an xAI API key.

    Use cases:
    - Answer questions about current events
    - Research with up-to-date sources
    - Summarize recent news

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | The Grok model to use for the search query. | `grok-4` |
| query | `str` | The question to research using live web/X search. | `` |
| search_mode | `enum` | auto lets Grok decide when to search, on forces search, off disables it. | `auto` |
| max_results | `int` | Maximum number of search results to consider. | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| citations | `list[str]` |  |

## Related Nodes

Browse other nodes in the [xai.text](./) namespace.
