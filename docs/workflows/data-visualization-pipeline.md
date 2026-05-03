---
layout: page
title: "Data Visualization Pipeline"
---

## Overview

Fetches historical GDP data from an HTTP source, converts it to a DataFrame, and generates a line chart showing trends over the century.

## Tags

agents

## Workflow Diagram

{% mermaid %}
graph TD
  getrequest_ccd77a["GetRequest"]
  importcsv_bbf878["ImportCSV"]
  filter_fdbb90["Filter"]
  chartgenerator_d6a24f["ChartGenerator"]
  getrequest_ccd77a --> importcsv_bbf878
  importcsv_bbf878 --> filter_fdbb90
  filter_fdbb90 --> chartgenerator_d6a24f
{% endmermaid %}
