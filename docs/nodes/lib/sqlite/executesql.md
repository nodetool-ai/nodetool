---
layout: page
title: "Execute SQL"
node_type: "lib.sqlite.ExecuteSQL"
namespace: "lib.sqlite"
---

**Type:** `lib.sqlite.ExecuteSQL`

**Namespace:** `lib.sqlite`

## Description

Execute arbitrary SQL statements for advanced operations.
    sqlite, database, sql, execute, custom

    Use cases:
    - Complex queries with joins
    - Aggregate functions (COUNT, SUM, AVG)
    - Custom SQL operations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| database_name | `str` | Name of the SQLite database file | `memory.db` |
| sql | `str` | SQL statement to execute | `SELECT * FROM flashcards` |
| parameters | `List[any]` | Parameters for parameterized queries (use ? in SQL) | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.sqlite](../) namespace.

