---
layout: page
title: "PDF-lib Agent"
node_type: "nodetool.agents.PdfLibAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.PdfLibAgent`

**Namespace:** `nodetool.agents`

## Description

Prompt-driven PDF processing skill with pdf-lib and complementary tooling.
    skills, pdf, pdf-lib, qpdf, poppler, pdfjs, pypdfium2

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for PDF task planning and execution reasoning. | `{"type":"language_model","provider":"empty","id...` |
| document | `document` | Optional PDF/document input for transformation or analysis. | `{"type":"document","uri":"","asset_id":null,"da...` |
| prompt | `str` | Prompt describing the PDF processing task. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `300` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `220000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| document | `document` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
