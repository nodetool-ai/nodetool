---
layout: page
title: "PPTX Agent"
node_type: "nodetool.agents.PptxAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.PptxAgent`

**Namespace:** `nodetool.agents`

## Description

Prompt-driven PowerPoint generation skill with PptxGenJS.
    skills, pptx, powerpoint, pptxgenjs, slides

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for PPTX planning and generation reasoning. | `{"type":"language_model","provider":"empty","id...` |
| document | `document` | Optional source PPTX/document input. | `{"type":"document","uri":"","asset_id":null,"da...` |
| prompt | `str` | Prompt describing PPTX task. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `300` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `220000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| document | `document` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
