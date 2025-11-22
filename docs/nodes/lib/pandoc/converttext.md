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
| content | `str` | Text content to convert | - |
| input_format | `Enum['biblatex', 'bibtex', 'bits', 'commonmark', 'commonmark_x', 'creole', 'csljson', 'csv', 'djot', 'docbook', 'docx', 'dokuwiki', 'endnotexml', 'epub', 'fb2', 'gfm', 'haddock', 'html', 'ipynb', 'jats', 'jira', 'json', 'latex', 'man', 'markdown', 'markdown_github', 'markdown_mmd', 'markdown_phpextra', 'markdown_strict', 'mdoc', 'mediawiki', 'muse', 'native', 'odt', 'opml', 'org', 'ris', 'rst', 'rtf', 't2t', 'textile', 'tikiwiki', 'tsv', 'twiki', 'typst', 'vimwiki']` | Input format | - |
| output_format | `Enum['asciidoc', 'asciidoctor', 'beamer', 'context', 'docbook4', 'docbook5', 'docx', 'epub2', 'epub3', 'pdf', 'plain', 'pptx', 'slideous', 'slidy', 'dzslides', 'revealjs', 's5', 'tei', 'texinfo', 'zimwiki']` | Output format | - |
| extra_args | `List[str]` | Additional pandoc arguments | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pandoc](../) namespace.

