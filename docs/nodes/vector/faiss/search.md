---
layout: page
title: "Search"
node_type: "vector.faiss.Search"
namespace: "vector.faiss"
---

**Type:** `vector.faiss.Search`

**Namespace:** `vector.faiss`

## Description

Search a FAISS index with query vectors, returning distances and indices.
    faiss, search, query, knn

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| index | `faiss_index` | FAISS index | `{'type': 'faiss_index', 'index': None}` |
| query | `np_array` | Query vectors (m, d) or (d,) | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| k | `int` | Number of nearest neighbors | `5` |
| nprobe | `Optional[int]` | nprobe for IVF indices | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| distances | `np_array` |  |
| indices | `np_array` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.faiss](../) namespace.

