---
layout: page
title: "Structured Output Generator"
node_type: "nodetool.generators.StructuredOutputGenerator"
namespace: "nodetool.generators"
---

**Type:** `nodetool.generators.StructuredOutputGenerator`

**Namespace:** `nodetool.generators`

## Description

Generate structured JSON objects from instructions using LLM providers.
    data-generation, structured-data, json, synthesis

    Specialized for creating structured information:
    - Generating JSON that follows dynamic schemas
    - Fabricating records from requirements and guidance
    - Simulating sample data for downstream workflows
    - Producing consistent structured outputs for testing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| system_prompt | `str` | The system prompt guiding JSON generation. | `
You are a structured data generator focused on JSON outputs.

Goal
- Produce a high-quality JSON object that matches <JSON_SCHEMA> using the guidance in <INSTRUCTIONS> and any supplemental <CONTEXT>.

Output format (MANDATORY)
- Output exactly ONE fenced code block labeled json containing ONLY the JSON object:

  ```json
  { ...single JSON object matching <JSON_SCHEMA>... }
  ```

- No additional prose before or after the block.

Generation rules
- Invent plausible, internally consistent values when not explicitly provided.
- Honor all constraints from <JSON_SCHEMA> (types, enums, ranges, formats).
- Prefer ISO 8601 for dates/times when applicable.
- Ensure numbers respect reasonable magnitudes and relationships described in <INSTRUCTIONS>.
- Avoid referencing external sources; rely solely on the provided guidance.

Validation
- Ensure the final JSON validates against <JSON_SCHEMA> exactly.
` |
| model | `language_model` | Model to use for structured generation. | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| instructions | `str` | Detailed instructions for the structured output. | `` |
| context | `str` | Optional context to ground the generation. | `` |
| max_tokens | `int` | The maximum number of tokens to generate. | `4096` |
| context_window | `int` |  | `4096` |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.generators](../) namespace.

