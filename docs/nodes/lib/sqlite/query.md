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
| database_name | `any` | Name of the SQLite database file | `memory.db` |
| table_name | `any` | Name of the table to query | `flashcards` |
| where | `any` | WHERE clause (without 'WHERE' keyword), e.g., 'id = 1' | `` |
| columns | `any` | Columns to select | `{'type': 'record_type', 'columns': []}` |
| order_by | `any` | ORDER BY clause (without 'ORDER BY' keyword) | `` |
| limit | `any` | Maximum number of rows to return (0 = no limit) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.sqlite](../) namespace.

