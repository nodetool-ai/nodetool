---
layout: page
title: "Fetch Papers"
---

## Overview

Fetches and downloads research papers from the Awesome Transformers GitHub repository. Extracts paper links from the README, filters for actual papers, and downloads them to a specified folder.

## Demo

<video controls preload="metadata" poster="{{ '/assets/workflows/fetch-papers.jpg' | relative_url }}">
  <source src="{{ '/assets/workflows/fetch-papers.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

automation

## Workflow Diagram

{% mermaid %}
graph TD
  fromlist_5["FromList"]
  filter_6["Filter"]
  extractcolumn_25["ExtractColumn"]
  extractlinks_32["ExtractLinks"]
  downloadfiles_21698c["DownloadFiles"]
  getrequest_422102["GetRequest"]
  fromlist_5 --> filter_6
  extractlinks_32 --> fromlist_5
  filter_6 --> extractcolumn_25
  extractcolumn_25 --> downloadfiles_21698c
  getrequest_422102 --> extractlinks_32
{% endmermaid %}
