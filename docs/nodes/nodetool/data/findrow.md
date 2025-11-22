---
layout: page
title: "Find Row"
node_type: "nodetool.data.FindRow"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.FindRow`

**Namespace:** `nodetool.data`

## Description

Find the first row in a dataframe that matches a given condition.
    filter, query, condition, single row

    Example conditions:
    age > 30
    age > 30 and salary < 50000
    name == 'John Doe'
    100 <= price <= 200
    status in ['Active', 'Pending']
    not (age < 18)

    Use cases:
    - Retrieve specific record based on criteria
    - Find first occurrence of a particular condition
    - Extract single data point for further analysis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| df | `any` | The DataFrame to search. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| condition | `any` | The condition to filter the DataFrame, e.g. 'column_name == value'. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

