---
layout: page
title: "Update"
node_type: "lib.sqlite.Update"
namespace: "lib.sqlite"
---

**Type:** `lib.sqlite.Update`

**Namespace:** `lib.sqlite`

## Description

Update records in a SQLite table.
    sqlite, database, update, modify, change

    Use cases:
    - Update flashcard content
    - Modify stored records
    - Change agent memory

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| database_name | `str` | Name of the SQLite database file | `memory.db` |
| table_name | `str` | Name of the table to update | `flashcards` |
| data | `Dict[str, any]` | Data to update as dict (column: new_value) | `{'content': 'updated'}` |
| where | `str` | WHERE clause (without 'WHERE' keyword), e.g., 'id = 1' | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.sqlite](../) namespace.

