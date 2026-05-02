---
layout: page
title: "Data Generator"
node_type: "nodetool.generators.DataGenerator"
namespace: "nodetool.generators"
---

**Type:** `nodetool.generators.DataGenerator`

**Namespace:** `nodetool.generators`

## Description

LLM Agent to create a dataframe based on a user prompt.
    llm, dataframe creation, data structuring

    Use cases:
    - Generating structured data from natural language descriptions
    - Creating sample datasets for testing or demonstration
    - Converting unstructured text into tabular format

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | The model to use for data generation. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | The user prompt | `` |
| input_text | `str` | The input text to be analyzed by the agent. | `` |
| max_tokens | `int` | The maximum number of tokens to generate. | `4096` |
| columns | `record_type` | The columns to use in the dataframe. | `{"type":"record_type","columns":[]}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| record | `dict` |  |
| dataframe | `dataframe` |  |
| index | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.generators](../) namespace.
