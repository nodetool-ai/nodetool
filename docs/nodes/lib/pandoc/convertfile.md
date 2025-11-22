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
| input_path | `file_path` | Path to the input file | `{'type': 'file_path', 'path': ''}` |
| input_format | `Enum['biblatex', 'bibtex', 'bits', 'commonmark', 'commonmark_x', 'creole', 'csljson', 'csv', 'djot', 'docbook', 'docx', 'dokuwiki', 'endnotexml', 'epub', 'fb2', 'gfm', 'haddock', 'html', 'ipynb', 'jats', 'jira', 'json', 'latex', 'man', 'markdown', 'markdown_github', 'markdown_mmd', 'markdown_phpextra', 'markdown_strict', 'mdoc', 'mediawiki', 'muse', 'native', 'odt', 'opml', 'org', 'ris', 'rst', 'rtf', 't2t', 'textile', 'tikiwiki', 'tsv', 'twiki', 'typst', 'vimwiki']` | Input format | `markdown` |
| output_format | `Enum['asciidoc', 'asciidoctor', 'beamer', 'context', 'docbook4', 'docbook5', 'docx', 'epub2', 'epub3', 'pdf', 'plain', 'pptx', 'slideous', 'slidy', 'dzslides', 'revealjs', 's5', 'tei', 'texinfo', 'zimwiki']` | Output format | `pdf` |
| extra_args | `List[str]` | Additional pandoc arguments | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pandoc](../) namespace.

