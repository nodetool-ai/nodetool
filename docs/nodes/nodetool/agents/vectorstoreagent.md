---
layout: page
title: "Vector Store Agent"
node_type: "nodetool.agents.VectorStoreAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.VectorStoreAgent`

**Namespace:** `nodetool.agents`

## Description

Index documents and run similarity search for RAG from a prompt.
    agent, vectorstore, embeddings, rag, retrieval

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for task planning and execution reasoning. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | Prompt describing the requested task. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `180` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `200000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](./) namespace.
