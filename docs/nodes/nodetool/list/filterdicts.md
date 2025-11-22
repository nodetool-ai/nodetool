---
layout: page
title: "Filter Dicts"
node_type: "nodetool.list.FilterDicts"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.FilterDicts`

**Namespace:** `nodetool.list`

## Description

Filter a list of dictionaries based on a condition.
    list, filter, query, condition

    Basic Operators:
    - Comparison: >, <, >=, <=, ==, !=
    - Logical: and, or, not
    - Membership: in, not in

    Example Conditions:
    # Basic comparisons
    age > 30
    price <= 100
    status == 'active'

    # Multiple conditions
    age > 30 and salary < 50000
    (price >= 100) and (price <= 200)
    department in ['Sales', 'Marketing']

    # String operations
    name.str.startswith('J')
    email.str.contains('@company.com')

    # Datetime conditions
    date > '2024-01-01'
    date.dt.year == 2024
    date.dt.month >= 6
    date.dt.day_name() == 'Monday'

    # Date ranges
    date.between('2024-01-01', '2024-12-31')
    date >= '2024-01-01' and date < '2025-01-01'

    # Complex datetime
    date.dt.hour < 12
    date.dt.dayofweek <= 4  # Weekdays only

    # Numeric operations
    price.between(100, 200)
    quantity % 2 == 0  # Even numbers

    # Special values
    value.isna()  # Check for NULL/NaN
    value.notna()  # Check for non-NULL/non-NaN

    Note: Dates should be in ISO format (YYYY-MM-DD) or include time (YYYY-MM-DD HH:MM:SS)

    Use cases:
    - Filter list of dictionary objects based on criteria
    - Extract subset of data meeting specific conditions
    - Clean data by removing unwanted entries

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `any` |  | `[]` |
| condition | `any` | 
        The filtering condition using pandas query syntax.

        Basic Operators:
        - Comparison: >, <, >=, <=, ==, !=
        - Logical: and, or, not
        - Membership: in, not in
        
        Example Conditions:
        # Basic comparisons
        age > 30
        price <= 100
        status == 'active'
        
        See node documentation for more examples.
         | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

