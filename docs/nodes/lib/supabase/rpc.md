---
layout: page
title: "RPC"
node_type: "lib.supabase.RPC"
namespace: "lib.supabase"
---

**Type:** `lib.supabase.RPC`

**Namespace:** `lib.supabase`

## Description

Call a PostgreSQL function via Supabase RPC.
    supabase, database, rpc, function

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| function | `str` | RPC function name | `` |
| params | `Dict[str, any]` | Function params | - |
| to_dataframe | `bool` | Return DataframeRef if result is a list of records | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.supabase](../) namespace.

