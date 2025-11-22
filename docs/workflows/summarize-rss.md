---
layout: page
title: "Summarize RSS"
---

## Overview





## Tags

N/A

## Workflow Diagram

{% mermaid %}
graph TD
  fetchrssfeed_3fd0dc["FetchRSSFeed"]
  collect_98cc0c["Collect"]
  summarizer_065961["Summarizer"]
  fetchrssfeed_3fd0dc --> collect_98cc0c
  collect_98cc0c --> summarizer_065961
{% endmermaid %}

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
