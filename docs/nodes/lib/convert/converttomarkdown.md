---
layout: page
title: "Convert To Markdown"
node_type: "lib.convert.ConvertToMarkdown"
namespace: "lib.convert"
---

**Type:** `lib.convert.ConvertToMarkdown`

**Namespace:** `lib.convert`

## Description

Converts PDF, DOCX, or HTML to markdown text.
    markdown, convert, document, pdf, docx, html, bytes

    Connect one input — document ref, raw bytes, or HTML string.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| document | `document` | A document ref (PDF, DOCX, or text file) | `{"type":"document","uri":"","asset_id":null,"da...` |
| bytes | `bytes` | Raw PDF or DOCX bytes (e.g. from HTTP GET Bytes) | null |
| html | `str` | HTML string to convert to markdown | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [lib.convert](../) namespace.
