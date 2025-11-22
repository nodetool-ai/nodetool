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
| database_name | `any` | Name of the SQLite database file | `memory.db` |
| sql | `any` | SQL statement to execute | `SELECT * FROM flashcards` |
| parameters | `any` | Parameters for parameterized queries (use ? in SQL) | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.sqlite](../) namespace.

