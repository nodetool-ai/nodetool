---
layout: page
title: "Summarize RSS"
---

## Overview

Fetches an RSS feed, gathers its entries into one text, and summarizes it.

> This tutorial does not ship as an importable template. Build it manually by following the steps below. NodeTool has no RSS node, so the fetch is a `Code` node.

## Demo

<video controls preload="metadata" poster="{{ '/assets/cookbook/summarize-newsletters.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/summarize-newsletters.mp4' | relative_url }}" type="video/mp4">
</video>

## Workflow Steps

1. **Fetch feed** (`nodetool.code.Code`) - Calls `fetch(url)` on the feed URL and parses the XML with `parse` from `@nodetool-ai/sandbox-xml`. Read the entries from `feed.rss.channel.item` and wrap a single entry with `[].concat(x ?? [])`, because the parser returns one object for a one-item feed. Emit each entry's title and description as one string.
2. **Collect** (`nodetool.control.Collect`) - Gathers the streamed entries into a list.
3. **Join** (`nodetool.code.Code`) - Joins the list into one string, because the Summarizer's `text` input takes a string.
4. **Summarizer** (`nodetool.agents.Summarizer`) - Condenses the text with the language model you select.

## Tags

rss, llm

## Workflow Diagram

{% mermaid %}
graph TD
  fetch["Code (fetch and parse feed)"]
  collect["Collect"]
  join["Code (join)"]
  summarizer["Summarizer"]
  fetch --> collect
  collect --> join
  join --> summarizer
{% endmermaid %}
