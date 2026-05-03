---
layout: page
title: "HTML Agent"
node_type: "nodetool.agents.HtmlAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.HtmlAgent`

**Namespace:** `nodetool.agents`

## Description

Prompt-driven HTML creation skill.
    skills, html, web, template, static-site

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for HTML generation planning/execution. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | Prompt describing HTML to create. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `180` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `180000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| html | `html` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
