---
layout: page
title: "Upsert"
node_type: "lib.supabase.Upsert"
namespace: "lib.supabase"
---

**Type:** `lib.supabase.Upsert`

**Namespace:** `lib.supabase`

## Description

Insert or update (upsert) records in a Supabase table.
    supabase, database, upsert, merge

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| table_name | `str` | Table to upsert into | `` |
| records | `union[list[dict[str, any]], dict[str, any]]` | One or multiple rows to upsert | `[]` |
| return_rows | `bool` | Return upserted rows (uses select('*')) | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [lib.supabase](../) namespace.
