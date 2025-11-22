---
layout: page
title: "Chat with Docs"
---

## Overview

An intelligent document retrieval and question-answering system that leverages vector search and local LLMs to provide accurate, context-aware responses based on your document collection.



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

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
