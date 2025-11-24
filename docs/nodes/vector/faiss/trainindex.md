---
layout: page
title: "Train Index"
node_type: "vector.faiss.TrainIndex"
namespace: "vector.faiss"
---

**Type:** `vector.faiss.TrainIndex`

**Namespace:** `vector.faiss`

## Description

Train a FAISS index with training vectors (required for IVF indices).
    faiss, train, index

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| index | `faiss_index` | FAISS index | `{'type': 'faiss_index', 'index': None}` |
| vectors | `np_array` | Training vectors (n, d) | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `faiss_index` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.faiss](../) namespace.

