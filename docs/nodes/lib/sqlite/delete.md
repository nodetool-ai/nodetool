---
layout: page
title: "Delete"
node_type: "lib.sqlite.Delete"
namespace: "lib.sqlite"
---

**Type:** `lib.sqlite.Delete`

**Namespace:** `lib.sqlite`

## Description

Delete records from a SQLite table.
    sqlite, database, delete, remove, drop

    Use cases:
    - Remove flashcards
    - Delete agent memory
    - Clean up old data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| database_name | `any` | Name of the SQLite database file | `memory.db` |
| table_name | `any` | Name of the table to delete from | `flashcards` |
| where | `any` | WHERE clause (without 'WHERE' keyword), e.g., 'id = 1'. REQUIRED for safety. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.sqlite](../) namespace.

