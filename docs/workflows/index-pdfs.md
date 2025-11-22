---
layout: page
title: "Index PDFs"
---

## Overview

Workflow to index PDFs in a folder into a Chroma collection



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

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
