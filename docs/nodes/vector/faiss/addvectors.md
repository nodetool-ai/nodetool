---
layout: page
title: "Add Vectors"
node_type: "vector.faiss.AddVectors"
namespace: "vector.faiss"
---

**Type:** `vector.faiss.AddVectors`

**Namespace:** `vector.faiss`

## Description

Add vectors to a FAISS index.
    faiss, add, vectors

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| index | `faiss_index` | FAISS index | `{'type': 'faiss_index', 'index': None}` |
| vectors | `np_array` | Vectors to add (n, d) | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `faiss_index` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.faiss](../) namespace.

