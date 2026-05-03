---
layout: page
title: "Select"
node_type: "lib.supabase.Select"
namespace: "lib.supabase"
---

**Type:** `lib.supabase.Select`

**Namespace:** `lib.supabase`

## Description

Query records from a Supabase table.
    supabase, database, query, select

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| table_name | `str` | Table to query | `` |
| columns | `record_type` | Columns to select | `{"type":"record_type","columns":[]}` |
| filters | `list[tuple[str, enum, any]]` | List of typed filters to apply | `[]` |
| order_by | `str` | Column to order by | `` |
| descending | `bool` | Order direction | `false` |
| limit | `int` | Max rows to return (0 = no limit) | `0` |
| to_dataframe | `bool` | Return a DataframeRef instead of list of dicts | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [lib.supabase](../) namespace.
