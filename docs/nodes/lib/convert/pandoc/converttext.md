---
layout: page
title: "Convert Text"
node_type: "lib.convert.pandoc.ConvertText"
namespace: "lib.convert.pandoc"
---

**Type:** `lib.convert.pandoc.ConvertText`

**Namespace:** `lib.convert.pandoc`

## Description

Converts text content between different document formats using pandoc.
    convert, text, format, pandoc

    Use cases:
    - Convert text content between various formats (Markdown, HTML, LaTeX, etc.)
    - Transform content without saving to disk
    - Process text snippets in different formats

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| content | `str` | Text content to convert | `` |
| input_format | `enum` | Input format | `markdown` |
| output_format | `enum` | Output format | `docx` |
| extra_args | `list[str]` | Additional pandoc arguments | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [lib.convert.pandoc](../) namespace.
