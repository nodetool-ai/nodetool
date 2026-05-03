---
layout: page
title: "Convert File"
node_type: "lib.convert.pandoc.ConvertFile"
namespace: "lib.convert.pandoc"
---

**Type:** `lib.convert.pandoc.ConvertFile`

**Namespace:** `lib.convert.pandoc`

## Description

Converts between different document formats using pandoc.
    convert, document, format, pandoc

    Use cases:
    - Convert between various document formats (Markdown, HTML, LaTeX, etc.)
    - Generate documentation in different formats
    - Create publication-ready documents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_path | `file_path` | Path to the input file | `{"type":"file_path","path":""}` |
| input_format | `enum` | Input format | `markdown` |
| output_format | `enum` | Output format | `pdf` |
| extra_args | `list[str]` | Additional pandoc arguments | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [lib.convert.pandoc](../) namespace.
