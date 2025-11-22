---
layout: page
title: "Summarize Paper"
---

## Overview



This workflow takes a PDF document from a given URL, extracts text, and generates a concise summary.

---

### 🔹 Steps

String Input → Provides the PDF URL (example: arXiv paper).  GET Document → Downloads the PDF from the given URL.  Extract Text → Reads the PDF pages (here: pages 0–4).  Summarizer → Uses the gemma3:1b model to produce a summary of the extracted text (max 200 tokens).

---

### 🔹 Usage

Change the URL in the String Input node to process a different PDF.  Adjust Start Page / End Page to select which pages to summarize.  Modify Max Tokens in Summarizer for longer or shorter summaries.

---

### 🔹 Example

Summarizing “Attention is All You Need” (arXiv:1706.03762) to get a clear, concise overview of the Transformer architecture.

## Tags

audio, start

## Workflow Diagram

{% mermaid %}
graph TD
  extracttext_4["ExtractText"]
  getrequestdocument_5["GetRequestDocument"]
  summarizer_6["Summarizer"]
  url_f78b00["url"]
  getrequestdocument_5 --> extracttext_4
  extracttext_4 --> summarizer_6
  url_f78b00 --> getrequestdocument_5
{% endmermaid %}

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
