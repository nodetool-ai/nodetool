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
|----------|------|-------------|----------|
| table_name | `any` | Table to query | `` |
| columns | `any` | Columns to select | `{'type': 'record_type', 'columns': []}` |
| filters | `any` | List of typed filters to apply | - |
| order_by | `any` | Column to order by | `` |
| descending | `any` | Order direction | `False` |
| limit | `any` | Max rows to return (0 = no limit) | `0` |
| to_dataframe | `any` | Return a DataframeRef instead of list of dicts | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.supabase](../) namespace.

