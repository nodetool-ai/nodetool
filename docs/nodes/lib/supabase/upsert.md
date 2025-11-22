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
|----------|------|-------------|----------|
| table_name | `any` | Table to upsert into | `` |
| records | `any` | One or multiple rows to upsert | - |
| on_conflict | `any` | Optional column or comma-separated columns for ON CONFLICT | - |
| return_rows | `any` | Return upserted rows (uses select('*')) | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.supabase](../) namespace.

