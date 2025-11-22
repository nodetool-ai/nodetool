---
layout: page
title: "Update"
node_type: "lib.supabase.Update"
namespace: "lib.supabase"
---

**Type:** `lib.supabase.Update`

**Namespace:** `lib.supabase`

## Description

Update records in a Supabase table.
    supabase, database, update, modify, change

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| table_name | `str` | Table to update | `` |
| values | `Dict[str, any]` | New values | - |
| filters | `List[Tuple[str, Enum['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'like', 'contains'], any]]` | Filters to select rows to update | - |
| return_rows | `bool` | Return updated rows (uses select('*')) | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.supabase](../) namespace.

