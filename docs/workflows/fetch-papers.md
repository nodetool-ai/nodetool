---
layout: page
title: "Fetch Papers"
---

## Overview

Fetches the README of a GitHub list of research papers, keeps the links that point at PDFs, and downloads each PDF into the run workspace.

> This tutorial does not ship as an importable template. Build it manually by following the steps below. NodeTool has no HTTP request or download node, so both network steps are `Code` nodes that call the sandbox `fetch`.

## Demo

<video controls preload="metadata" poster="{{ '/assets/workflows/fetch-papers.jpg' | relative_url }}">
  <source src="{{ '/assets/workflows/fetch-papers.mp4' | relative_url }}" type="video/mp4">
</video>

## Workflow Steps

1. **Get README** (`nodetool.code.Code`) - Calls `fetch(url)` on the raw README URL and reads `text()`. The same body pulls the link targets that end in `.pdf` and returns them as a list. Use the `@nodetool-ai/sandbox-html` pack's `extractLinks` instead when the source is an HTML page.
2. **For Each** (`nodetool.control.ForEach`) - Emits one URL at a time from `input_list`.
3. **Download** (`nodetool.code.Code`) - Fetches each URL and saves it with `workspace.writeBytes(name, await res.bytes())`.
4. **Collect** (`nodetool.control.Collect`) - Gathers the saved file names into a list for a `Preview` node.

`fetch` refuses loopback, link-local, and private addresses. See the [JavaScript Sandbox]({{ '/javascript-sandbox' | relative_url }}) reference for its limits.

## Tags

automation

## Workflow Diagram

{% mermaid %}
graph TD
  readme["Code (get README, keep PDF links)"]
  each["ForEach"]
  download["Code (download)"]
  collect["Collect"]
  preview["Preview"]
  readme --> each
  each -->|output| download
  download --> collect
  collect --> preview
{% endmermaid %}
