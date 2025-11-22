---
layout: page
title: "Reduce Dictionaries"
node_type: "nodetool.dictionary.ReduceDictionaries"
namespace: "nodetool.dictionary"
---

**Type:** `nodetool.dictionary.ReduceDictionaries`

**Namespace:** `nodetool.dictionary`

## Description

Reduces a list of dictionaries into one dictionary based on a specified key field.
    dictionary, reduce, aggregate

    Use cases:
    - Aggregate data by a specific field
    - Create summary dictionaries from list of records
    - Combine multiple data points into a single structure

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dictionaries | `List[Dict[str, any]]` | List of dictionaries to be reduced | `[]` |
| key_field | `str` | The field to use as the key in the resulting dictionary | `` |
| value_field | `Optional[str]` | Optional field to use as the value. If not specified, the entire dictionary (minus the key field) will be used as the value. | - |
| conflict_resolution | `Enum['first', 'last', 'error']` | How to handle conflicts when the same key appears multiple times | `first` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[any, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.dictionary](../) namespace.

