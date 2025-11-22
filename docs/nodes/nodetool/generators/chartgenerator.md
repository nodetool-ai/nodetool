---
layout: page
title: "Chart Generator"
node_type: "nodetool.generators.ChartGenerator"
namespace: "nodetool.generators"
---

**Type:** `nodetool.generators.ChartGenerator`

**Namespace:** `nodetool.generators`

## Description

LLM Agent to create Plotly Express charts based on natural language descriptions.
    llm, data visualization, charts

    Use cases:
    - Generating interactive charts from natural language descriptions
    - Creating data visualizations with minimal configuration
    - Converting data analysis requirements into visual representations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model to use for chart generation. | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| prompt | `any` | Natural language description of the desired chart | `` |
| data | `any` | The data to visualize | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| max_tokens | `any` | The maximum number of tokens to generate. | `4096` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.generators](../) namespace.

