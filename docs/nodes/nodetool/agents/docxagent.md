---
layout: page
title: "DOCX Agent"
node_type: "nodetool.agents.DocxAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.DocxAgent`

**Namespace:** `nodetool.agents`

## Description

Create Word (.docx) documents from a plain-language description.
    agent, docx, word, document

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for DOCX creation planning and execution. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | Prompt describing what DOCX to create. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `300` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `220000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| document | `document` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](./) namespace.
