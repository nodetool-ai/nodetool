---
layout: page
title: "Data Visualization Pipeline"
---

## Overview

Transform natural language descriptions into data visualizations with AI-powered data and chart generation. This workflow demonstrates how to create customized charts from text prompts without manual data preparation.

**Historical GDP Data Visualization Workflow**

This workflow pulls historical GDP data from an HTTP source.

The file is converted to a Dataframe and then passed to the Chart Generator node.

The Chart Generator configures the data into a line chart format.

The model is instructed to create a line chart showing GDP trends over the century.

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

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
