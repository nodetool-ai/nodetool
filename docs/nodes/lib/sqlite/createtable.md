---
layout: page
title: "Create Table"
node_type: "lib.sqlite.CreateTable"
namespace: "lib.sqlite"
---

**Type:** `lib.sqlite.CreateTable`

**Namespace:** `lib.sqlite`

## Description

Create a new SQLite table with specified columns.
    sqlite, database, table, create, schema

    Use cases:
    - Initialize database schema for flashcards
    - Set up tables for persistent storage
    - Create memory structures for agents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| database_name | `str` | Name of the SQLite database file | `memory.db` |
| table_name | `str` | Name of the table to create | `flashcards` |
| columns | `record_type` | Column definitions | `{'type': 'record_type', 'columns': []}` |
| add_primary_key | `bool` | Automatically make first integer column PRIMARY KEY AUTOINCREMENT | `True` |
| if_not_exists | `bool` | Only create table if it doesn't exist | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| database_name | `str` |  |
| table_name | `str` |  |
| columns | `record_type` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.sqlite](../) namespace.

