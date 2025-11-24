---
layout: page
title: "Insert"
node_type: "lib.supabase.Insert"
namespace: "lib.supabase"
---

**Type:** `lib.supabase.Insert`

**Namespace:** `lib.supabase`

## Description

Insert record(s) into a Supabase table.
    supabase, database, insert, add, record

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| table_name | `str` | Table to insert into | `` |
| records | `(List[Dict[str, any]] | Dict[str, any])` | One or multiple rows to insert | - |
| return_rows | `bool` | Return inserted rows (uses select('*')) | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.supabase](../) namespace.

