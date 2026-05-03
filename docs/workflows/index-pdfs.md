---
layout: page
title: "Index PDFs"
---

## Overview

Index PDFs from a folder into a Chroma collection for vector search.

## Tags

rag, start

## Workflow Diagram

{% mermaid %}
graph TD
  listfiles_8eb41c["ListFiles"]
  papers2_49cc8e["papers2"]
  loaddocumentfile_4e1c87["LoadDocumentFile"]
  extracttext_2124c9["ExtractText"]
  indextextchunks_38b8d1["IndexTextChunks"]
  sentencesplitter_be7780["SentenceSplitter"]
  pathtostring_7fdb62["PathToString"]
  extracttext_2124c9 --> sentencesplitter_be7780
  loaddocumentfile_4e1c87 --> extracttext_2124c9
  sentencesplitter_be7780 --> indextextchunks_38b8d1
  papers2_49cc8e --> indextextchunks_38b8d1
  listfiles_8eb41c --> loaddocumentfile_4e1c87
  listfiles_8eb41c --> pathtostring_7fdb62
  pathtostring_7fdb62 --> sentencesplitter_be7780
{% endmermaid %}
