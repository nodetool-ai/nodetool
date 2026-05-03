---
layout: page
title: "Categorize Mails"
---

## Overview

Classifies emails into predefined categories (Newsletter, Work, Family, Friends) using an LLM and applies matching Gmail labels.

## Workflow Steps

1. **Gmail Search** - Fetches up to 10 recent emails using the specified filters (date, subject, sender).
2. **Template** - Formats each email into a structured prompt with subject, sender, and body snippet.
3. **Classifier** - Uses an LLM to classify the email into one or more categories.
4. **Add Label** - Applies the determined label(s) to each email in Gmail.

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
