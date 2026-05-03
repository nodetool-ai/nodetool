---
layout: page
title: "Embedding Model Input"
node_type: "nodetool.input.EmbeddingModelInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.EmbeddingModelInput`

**Namespace:** `nodetool.input`

## Description

Accepts an embedding model as a parameter for workflows.
    input, parameter, model, embedding, vector

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `embedding_model` | The embedding model to use as input. | `{"type":"embedding_model","provider":"empty","i...` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `embedding_model` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
