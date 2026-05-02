---
layout: page
title: "Extractor"
node_type: "nodetool.agents.Extractor"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.Extractor`

**Namespace:** `nodetool.agents`

## Description

Extract structured data from text content using LLM providers.
    data-extraction, structured-data, nlp, parsing

    Specialized for extracting structured information:
    - Converting unstructured text into structured data
    - Identifying and extracting specific fields from documents
    - Parsing text according to predefined schemas
    - Creating structured records from natural language content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| system_prompt | `str` | The system prompt for the data extractor | ` You are a precise structured data extractor.  ...` |
| model | `language_model` | Model to use for data extraction | `{"type":"language_model","provider":"empty","id...` |
| text | `str` | The text to extract data from | `` |
| image | `image` | Optional image to assist extraction | `{"type":"image","uri":"","asset_id":null,"data"...` |
| audio | `audio` | Optional audio to assist extraction | `{"type":"audio","uri":"","asset_id":null,"data"...` |

## Outputs

_(none)_

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
