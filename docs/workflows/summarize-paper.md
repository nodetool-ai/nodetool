---
layout: page
title: "Summarize Paper"
---

## Overview

Downloads a PDF from a URL, extracts text from selected pages, and generates a concise summary.

- Change the URL in the String Input node to process a different PDF.
- Adjust Start Page / End Page to select which pages to summarize.
- Modify Max Tokens in Summarizer for longer or shorter summaries.

**Example:** Summarizing "Attention is All You Need" (arXiv:1706.03762) with gemma3:1b, max 200 tokens.

## Tags

start

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
