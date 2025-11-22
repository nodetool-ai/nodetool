---
layout: page
title: "Filter"
node_type: "nodetool.data.Filter"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.Filter`

**Namespace:** `nodetool.data`

## Description

Filter dataframe based on condition.
    filter, query, condition

    Example conditions:
    age > 30
    age > 30 and salary < 50000
    name == 'John Doe'
    100 <= price <= 200
    status in ['Active', 'Pending']
    not (age < 18)

    Use cases:
    - Extract subset of data meeting specific criteria
    - Remove outliers or invalid data points
    - Focus analysis on relevant data segments

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| df | `dataframe` | The DataFrame to filter. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| condition | `str` | The filtering condition to be applied to the DataFrame, e.g. column_name > 5. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dataframe` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

