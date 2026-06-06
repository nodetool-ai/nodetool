---
layout: page
title: "Format Text"
node_type: "nodetool.text.FormatText"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.FormatText`

**Namespace:** `nodetool.text`

## Description

Replaces placeholders in a string with dynamic inputs using {{ variable }} or {variable} syntax.
    Supports Jinja2-style filters: {{ var|upper }}, {{ var|lower }}, {{ var|capitalize }},
    {{ var|title }}, {{ var|trim }}, {{ var|truncate(n) }}, {{ var|default(val) }}.
    text, template, formatting, format, variable, replace

    Use cases:
    - Generating personalized messages with dynamic content
    - Creating parameterized queries or commands

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| template | `str` | Template string with {{ variable }} or {variable} placeholders. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
