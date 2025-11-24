---
layout: page
title: "Add Paragraph"
node_type: "lib.docx.AddParagraph"
namespace: "lib.docx"
---

**Type:** `lib.docx.AddParagraph`

**Namespace:** `lib.docx`

## Description

Adds a paragraph of text to the document
    document, docx, text, format

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| document | `document` | The document to add the paragraph to | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| text | `str` | The paragraph text | `` |
| alignment | `Enum['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY']` | Text alignment | `LEFT` |
| bold | `bool` | Make text bold | `False` |
| italic | `bool` | Make text italic | `False` |
| font_size | `int` | Font size in points | `12` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `document` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.docx](../) namespace.

