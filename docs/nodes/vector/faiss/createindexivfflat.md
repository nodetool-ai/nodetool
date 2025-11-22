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
| dim | `any` | Embedding dimensionality | `768` |
| nlist | `any` | Number of Voronoi cells | `1024` |
| metric | `any` | Distance metric | `L2` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.faiss](../) namespace.

