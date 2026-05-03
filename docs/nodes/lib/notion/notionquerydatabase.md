---
layout: page
title: "Notion Query Database"
node_type: "lib.notion.QueryDatabase"
namespace: "lib.notion"
---

**Type:** `lib.notion.QueryDatabase`

**Namespace:** `lib.notion`

## Description

Query a Notion database with optional filter and sort.
    notion, database, query, filter, sort, api

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| database_id | `str` | The ID of the Notion database to query | `` |
| filter_json | `str` | Optional Notion filter object as JSON | `` |
| sort_json | `str` | Optional Notion sorts array as JSON (array of sort objects) | `` |
| page_size | `int` | Number of results to return (max 100) | `100` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| result | `dict` |  |
| results | `list` |  |

## Related Nodes

Browse other nodes in the [lib.notion](../) namespace.
