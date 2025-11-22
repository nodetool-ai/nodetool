---
layout: page
title: "Add With Ids"
node_type: "vector.faiss.AddWithIds"
namespace: "vector.faiss"
---

**Type:** `vector.faiss.AddWithIds`

**Namespace:** `vector.faiss`

## Description

Add vectors with explicit integer IDs to a FAISS index.
    faiss, add, ids, vectors

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| index | `any` | FAISS index | `{'type': 'faiss_index', 'index': None}` |
| vectors | `any` | Vectors to add (n, d) | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| ids | `any` | 1-D int64 IDs (n,) | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.faiss](../) namespace.

