---
layout: page
title: "Document Agent"
node_type: "nodetool.agents.DocumentAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.DocumentAgent`

**Namespace:** `nodetool.agents`

## Description

Read, analyze, and convert documents to Markdown from a prompt.
    agent, document, analysis, conversion, markdown

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for free-form document tasks. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | Prompt describing the document task. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `120` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `150000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| document | `document` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](./) namespace.
