---
layout: page
title: "JSON Template"
node_type: "lib.json.JSONTemplate"
namespace: "lib.json"
---

**Type:** `lib.json.JSONTemplate`

**Namespace:** `lib.json`

## Description

Template JSON strings with variable substitution.
    json, template, substitute, variables

    Example:
    template: '{"name": "$user", "age": $age}'
    values: {"user": "John", "age": 30}
    result: '{"name": "John", "age": 30}'

    Use cases:
    - Create dynamic JSON payloads
    - Generate JSON with variable data
    - Build API request templates

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| template | `any` | JSON template string with $variable placeholders | `` |
| values | `any` | Dictionary of values to substitute into the template | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.json](../) namespace.

