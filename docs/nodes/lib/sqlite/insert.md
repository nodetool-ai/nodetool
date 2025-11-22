---
layout: page
title: "Insert"
node_type: "lib.sqlite.Insert"
namespace: "lib.sqlite"
---

**Type:** `lib.sqlite.Insert`

**Namespace:** `lib.sqlite`

## Description

Insert a record into a SQLite table.
    sqlite, database, insert, add, record

    Use cases:
    - Add new flashcards to database
    - Store agent observations
    - Persist workflow results

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| database_name | `str` | Name of the SQLite database file | `memory.db` |
| table_name | `str` | Name of the table to insert into | `flashcards` |
| data | `Dict[str, any]` | Data to insert as dict (column: value) | `{'content': 'example'}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.sqlite](../) namespace.

