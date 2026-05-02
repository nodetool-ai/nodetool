---
layout: page
title: "Chat with Docs"
---

## Overview

Document retrieval and question-answering using vector search and local LLMs.

## Tags

chat, rag

## Workflow Diagram

{% mermaid %}
graph TD
  formattext_9["FormatText"]
  hybridsearch_8e9b81["HybridSearch"]
  query_2cff53["Query"]
  agent_d83380["Agent"]
  query_2cff53 --> hybridsearch_8e9b81
  hybridsearch_8e9b81 --> formattext_9
  query_2cff53 --> formattext_9
  formattext_9 --> agent_d83380
{% endmermaid %}
