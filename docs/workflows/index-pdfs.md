---
layout: page
title: "Index PDFs"
---

## Overview

Index PDFs from a folder into a SQLite-vec collection for vector search.

> This tutorial does not ship as an importable template. Build it manually by following the steps below.

## Tags

rag, start

## Workflow Diagram

{% mermaid %}
graph TD
  listfiles_8eb41c["ListFiles"]
  papers2_49cc8e["papers2"]
  loaddocumentfile_4e1c87["LoadDocumentFile"]
  extracttext_2124c9["ExtractText"]
  indextextchunk_38b8d1["IndexTextChunk"]
  splitrecursively_be7780["SplitRecursively"]
  pathtostring_7fdb62["PathToString"]
  extracttext_2124c9 --> splitrecursively_be7780
  loaddocumentfile_4e1c87 --> extracttext_2124c9
  splitrecursively_be7780 --> indextextchunk_38b8d1
  papers2_49cc8e --> indextextchunk_38b8d1
  listfiles_8eb41c --> loaddocumentfile_4e1c87
  listfiles_8eb41c --> pathtostring_7fdb62
  pathtostring_7fdb62 --> splitrecursively_be7780
{% endmermaid %}
