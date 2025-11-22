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
| database_name | `any` | Name of the SQLite database file | `memory.db` |
| table_name | `any` | Name of the table to create | `flashcards` |
| columns | `any` | Column definitions | `{'type': 'record_type', 'columns': []}` |
| add_primary_key | `any` | Automatically make first integer column PRIMARY KEY AUTOINCREMENT | `True` |
| if_not_exists | `any` | Only create table if it doesn't exist | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| database_name | `any` |  |
| table_name | `any` |  |
| columns | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.sqlite](../) namespace.

