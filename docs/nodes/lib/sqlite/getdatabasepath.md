---
layout: page
title: "Get Database Path"
node_type: "lib.sqlite.GetDatabasePath"
namespace: "lib.sqlite"
---

**Type:** `lib.sqlite.GetDatabasePath`

**Namespace:** `lib.sqlite`

## Description

Get the full path to a SQLite database file.
    sqlite, database, path, location

    Use cases:
    - Reference database location
    - Verify database exists
    - Pass path to external tools

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| database_name | `any` | Name of the SQLite database file | `memory.db` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.sqlite](../) namespace.

