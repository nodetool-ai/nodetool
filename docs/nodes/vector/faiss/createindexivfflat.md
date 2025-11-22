---
layout: page
title: "Create Index IVFFlat"
node_type: "vector.faiss.CreateIndexIVFFlat"
namespace: "vector.faiss"
---

**Type:** `vector.faiss.CreateIndexIVFFlat`

**Namespace:** `vector.faiss`

## Description

Create a FAISS IndexIVFFlat (inverted file index with flat quantizer).
    faiss, index, ivf, create

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dim | `int` | Embedding dimensionality | `768` |
| nlist | `int` | Number of Voronoi cells | `1024` |
| metric | `Enum['L2', 'IP']` | Distance metric | `L2` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `faiss_index` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.faiss](../) namespace.

