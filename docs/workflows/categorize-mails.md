---
layout: page
title: "Categorize Mails"
---

## Overview

Classifies emails into categories (Newsletter, Work, Family, Friends) with an LLM and applies the matching Gmail label.

> This tutorial does not ship as an importable template. Build it manually by following the steps below. It needs the Google Workspace integration, which is available only on installs with a login (Supabase auth mode) or with `NODETOOL_GOOGLE_WORKSPACE=1`, and a connected Google account. See [Google Workspace and Email](../google-workspace.md).

## Demo

<video controls preload="metadata" poster="{{ '/assets/workflows/categorize-mails.jpg' | relative_url }}">
  <source src="{{ '/assets/workflows/categorize-mails.mp4' | relative_url }}" type="video/mp4">
</video>

## Workflow Steps

1. **Gmail Search** (`nodetool.code.Code`) - Imports `gmail_search` from `@nodetool-ai/sandbox-nodetool/google`. It takes a Gmail `query` (for example `is:unread newer_than:7d`) and `max_results` (1 to 50, default 10), and returns `messages` with subject, sender, date, and body.
2. **Prompt** (`nodetool.text.Prompt`) - Formats each email into a prompt with subject, sender, and body.
3. **Classifier** (`nodetool.agents.Classifier`) - Picks one of the `categories` you list. It takes `text` and a model.
4. **Add Label** (`nodetool.code.Code`) - Imports `gmail_modify_labels` and calls it with the message's `message_id` and `add_label_ids`. Label ids come from `gmail_list_labels`.

## Tags

email, start

## Workflow Diagram

{% mermaid %}
graph TD
  search["Code (gmail_search)"]
  prompt["Prompt"]
  classifier["Classifier"]
  label["Code (gmail_modify_labels)"]
  search --> prompt
  prompt --> classifier
  classifier --> label
  search -->|message_id| label
{% endmermaid %}
