---
layout: page
title: "Summarize Newsletters"
---

## Overview



1. **Gmail Search** - Searches Gmail inbox for ONE recent email with "AINews" in the subject line, filtering for emails from the past week

2. **Email Fields Extraction** - Extracts the body content from the retrieved email

3. **Summarizer** - Processes the email body through a language model to generate a concise, markdown-formatted summary (max 1000 tokens)

## Tip:

For local execution, use a smaller model like Gemma3:1b to avoid memory issues

## Tags

email, start

## Workflow Diagram

{% mermaid %}
graph TD
  gmailsearch_b69894["GmailSearch"]
  emailfields_a83c2c["EmailFields"]
  summarizer_4e9b5c["Summarizer"]
  gmailsearch_b69894 --> emailfields_a83c2c
  emailfields_a83c2c --> summarizer_4e9b5c
{% endmermaid %}

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
