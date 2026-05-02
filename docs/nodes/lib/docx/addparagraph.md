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
|----------|------|-------------|---------|
| document | `document` | The document to add the paragraph to | `{"type":"document","uri":"","asset_id":null,"da...` |
| text | `str` | The paragraph text | `` |
| alignment | `enum` | Text alignment | `LEFT` |
| bold | `bool` | Make text bold | `false` |
| italic | `bool` | Make text italic | `false` |
| font_size | `int` | Font size in points | `12` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `document` |  |

## Related Nodes

Browse other nodes in the [lib.docx](../) namespace.
