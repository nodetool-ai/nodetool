---
layout: page
title: "Query"
node_type: "lib.sqlite.Query"
namespace: "lib.sqlite"
---

**Type:** `lib.sqlite.Query`

**Namespace:** `lib.sqlite`

## Description

Query records from a SQLite table.
    sqlite, database, query, select, search, retrieve

    Use cases:
    - Retrieve flashcards for review
    - Search agent memory
    - Fetch stored data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| database_name | `str` | Name of the SQLite database file | `memory.db` |
| table_name | `str` | Name of the table to query | `flashcards` |
| where | `str` | WHERE clause (without 'WHERE' keyword), e.g., 'id = 1' | `` |
| columns | `record_type` | Columns to select | `{'type': 'record_type', 'columns': []}` |
| order_by | `str` | ORDER BY clause (without 'ORDER BY' keyword) | `` |
| limit | `int` | Maximum number of rows to return (0 = no limit) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Dict[str, any]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.sqlite](../) namespace.

