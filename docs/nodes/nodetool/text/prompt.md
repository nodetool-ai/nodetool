---
layout: page
title: "Prompt"
node_type: "nodetool.text.Prompt"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.Prompt`

**Namespace:** `nodetool.text`

## Description

Compose a prompt string with named variables. Add variables via the Add Variable button; reference them in the prompt as {{ variable }} (or {variable}). Supports filters: {{ var|upper }}, {{ var|lower }}, {{ var|capitalize }}, {{ var|title }}, {{ var|trim }}, {{ var|truncate(n) }}, {{ var|default(val) }}.
    prompt, text, template, variable, llm, agent

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | Prompt text. Reference variables with {{ name }} or {name}. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](./) namespace.
