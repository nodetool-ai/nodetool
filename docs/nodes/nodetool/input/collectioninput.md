---
layout: page
title: "Collection Input"
node_type: "nodetool.input.CollectionInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.CollectionInput`

**Namespace:** `nodetool.input`

## Description

Accepts a reference to a specific data collection, typically within a vector database or similar storage system.
    The input is a 'Collection' object, which identifies the target collection for operations like data insertion, querying, or similarity search.
    Keywords: input, parameter, collection, database, vector_store, chroma, index

    Use cases:
    - Select a target vector database collection for indexing new documents.
    - Specify a collection to perform a similarity search or query against.
    - Choose a data source or destination that is represented as a named collection.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `collection` | The collection to use as input. | `{'type': 'collection', 'name': ''}` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `collection` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

