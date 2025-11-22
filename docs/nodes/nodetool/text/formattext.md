---
layout: page
title: "Format Text"
node_type: "nodetool.text.FormatText"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.FormatText`

**Namespace:** `nodetool.text`

## Description

Replaces placeholders in a string with dynamic inputs using Jinja2 templating.
    text, template, formatting

    This node is dynamic and can be used to format text with dynamic properties.

    Use cases:
    - Generating personalized messages with dynamic content
    - Creating parameterized queries or commands
    - Formatting and filtering text output based on variable inputs

    Examples:
    - text: "Hello, {{ name }}!"
    - text: "Title: {{ title|truncate(20) }}"
    - text: "Name: {{ name|upper }}"

    Available filters:
    - truncate(length): Truncates text to given length
    - upper: Converts text to uppercase
    - lower: Converts text to lowercase
    - title: Converts text to title case
    - trim: Removes whitespace from start/end
    - replace(old, new): Replaces substring
    - default(value): Sets default if value is undefined
    - first: Gets first character/item
    - last: Gets last character/item
    - length: Gets length of string/list
    - sort: Sorts list
    - join(delimiter): Joins list with delimiter

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| template | `any` | 
    Examples:
    - text: "Hello, {{ name }}!"
    - text: "Title: {{ title|truncate(20) }}"
    - text: "Name: {{ name|upper }}" 

    Available filters:
    - truncate(length): Truncates text to given length
    - upper: Converts text to uppercase
    - lower: Converts text to lowercase
    - title: Converts text to title case
    - trim: Removes whitespace from start/end
    - replace(old, new): Replaces substring
    - default(value): Sets default if value is undefined
    - first: Gets first character/item
    - last: Gets last character/item
    - length: Gets length of string/list
    - sort: Sorts list
    - join(delimiter): Joins list with delimiter
 | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

