---
layout: page
title: "Summarize RSS"
---

## Overview

Fetches an RSS feed, collects all entries, and generates a summary.

## Demo

<video controls preload="metadata" poster="{{ '/assets/cookbook/summarize-newsletters.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/summarize-newsletters.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

rss, llm

## Workflow Diagram

{% mermaid %}
graph TD
  fetchrssfeed_3fd0dc["FetchRSSFeed"]
  collect_98cc0c["Collect"]
  summarizer_065961["Summarizer"]
  fetchrssfeed_3fd0dc --> collect_98cc0c
  collect_98cc0c --> summarizer_065961
{% endmermaid %}
