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
|----------|------|-------------|---------|
| table_name | `str` | Table to update | `` |
| values | `dict[str, any]` | New values | `{}` |
| filters | `list[tuple[str, enum, any]]` | Filters to select rows to update | `[]` |
| return_rows | `bool` | Return updated rows (uses select('*')) | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [lib.supabase](../) namespace.
