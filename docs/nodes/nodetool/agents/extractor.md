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
|----------|------|-------------|----------|
| system_prompt | `str` | The system prompt for the data extractor | `
You are a precise structured data extractor.

Goal
- Extract exactly the fields described in <JSON_SCHEMA> from the content in <TEXT> (and any attached media).

Output format (MANDATORY)
- Output exactly ONE fenced code block labeled json containing ONLY the JSON object:

  ```json
  { ...single JSON object matching <JSON_SCHEMA>... }
  ```

- No additional prose before or after the block.

Extraction rules
- Use only information found in <TEXT> or attached media. Do not invent facts.
- Preserve source values; normalize internal whitespace and trim leading/trailing spaces.
- If a required field is missing or not explicitly stated, return the closest reasonable default consistent with its type:
  - string: ""
  - number: 0
  - boolean: false
  - array/object: empty value of that type (only if allowed by the schema)
- Dates/times: prefer ISO 8601 when the schema type is string and the value represents a date/time.
- If multiple candidates exist, choose the most precise and unambiguous one.

Validation
- Ensure the final JSON validates against <JSON_SCHEMA> exactly.
` |
| model | `language_model` | Model to use for data extraction | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| text | `str` | The text to extract data from | `` |
| image | `image` | Optional image to assist extraction | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| audio | `audio` | Optional audio to assist extraction | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| context_window | `int` |  | `4096` |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.

