---
layout: page
title: "Delete"
node_type: "lib.supabase.Delete"
namespace: "lib.supabase"
---

**Type:** `lib.supabase.Delete`

**Namespace:** `lib.supabase`

## Description

Delete records from a Supabase table.
    supabase, database, delete, remove

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| table_name | `str` | Table to delete from | `` |
| filters | `list[tuple[str, enum, any]]` | Filters to select rows to delete (required for safety) | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict[str, any]` |  |

## Related Nodes

Browse other nodes in the [lib.supabase](../) namespace.
