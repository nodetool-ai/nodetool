---
layout: page
title: "Notion Search"
node_type: "lib.notion.Search"
namespace: "lib.notion"
---

**Type:** `lib.notion.Search`

**Namespace:** `lib.notion`

## Description

Search across all pages and databases the Notion integration has access to.
    notion, search, pages, databases, api

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| query | `str` | Search query string | `` |
| filter_type | `str` | Filter by object type: "page", "database", or empty for all | `` |
| sort_direction | `str` | Sort direction: "ascending" or "descending" | `descending` |
| page_size | `int` | Number of results to return (max 100) | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| result | `dict` |  |
| results | `list` |  |

## Related Nodes

Browse other nodes in the [lib.notion](../) namespace.
