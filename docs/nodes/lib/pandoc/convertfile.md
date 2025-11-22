---
layout: page
title: "Convert File"
node_type: "lib.pandoc.ConvertFile"
namespace: "lib.pandoc"
---

**Type:** `lib.pandoc.ConvertFile`

**Namespace:** `lib.pandoc`

## Description

Converts between different document formats using pandoc.
    convert, document, format, pandoc

    Use cases:
    - Convert between various document formats (Markdown, HTML, LaTeX, etc.)
    - Generate documentation in different formats
    - Create publication-ready documents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| input_path | `any` | Path to the input file | `{'type': 'file_path', 'path': ''}` |
| input_format | `any` | Input format | `markdown` |
| output_format | `any` | Output format | `pdf` |
| extra_args | `any` | Additional pandoc arguments | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pandoc](../) namespace.

