---
layout: page
title: "Convert Text"
node_type: "lib.pandoc.ConvertText"
namespace: "lib.pandoc"
---

**Type:** `lib.pandoc.ConvertText`

**Namespace:** `lib.pandoc`

## Description

Converts text content between different document formats using pandoc.
    convert, text, format, pandoc

    Use cases:
    - Convert text content between various formats (Markdown, HTML, LaTeX, etc.)
    - Transform content without saving to disk
    - Process text snippets in different formats

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| content | `any` | Text content to convert | - |
| input_format | `any` | Input format | - |
| output_format | `any` | Output format | - |
| extra_args | `any` | Additional pandoc arguments | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pandoc](../) namespace.

