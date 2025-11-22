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
|----------|------|-------------|----------|
| table_name | `str` | Table to delete from | `` |
| filters | `List[Tuple[str, Enum['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'like', 'contains'], any]]` | Filters to select rows to delete (required for safety) | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.supabase](../) namespace.

