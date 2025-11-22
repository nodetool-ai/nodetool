---
layout: page
title: "Categorize Mails"
---

## Overview

Automatically categorize and organize emails using AI

This workflow classifies emails into predefined categories (e.g., Newsletter, Work, Family, Friends) using a large language model and applies the matching Gmail labels.

## Workflow Steps:

2. **Gmail Search** - Fetches up to 10 recent emails using the specified filters (e.g., date, subject, sender).

2. **Template** - Formats each email into a structured prompt including subject, sender, and a truncated body snippet.

3. **Classifier** - Uses an LLM to classify the email into one or more of the categories: newsletter, work, family, friends.

4. **Add Label** - Applies the determined label(s) to each email message in Gmail.

## Tags

email, start

## Workflow Diagram

{% mermaid %}
graph TD
  template_29a39f["Template"]
  classifier_a6df08["Classifier"]
  addlabel_663354["AddLabel"]
  gmailsearch_b776a8["GmailSearch"]
  template_29a39f --> classifier_a6df08
  classifier_a6df08 --> addlabel_663354
  gmailsearch_b776a8 --> addlabel_663354
  gmailsearch_b776a8 --> template_29a39f
{% endmermaid %}

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
