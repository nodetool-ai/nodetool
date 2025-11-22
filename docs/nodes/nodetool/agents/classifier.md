---
layout: page
title: "Classifier"
node_type: "nodetool.agents.Classifier"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.Classifier`

**Namespace:** `nodetool.agents`

## Description

Classify text into predefined or dynamic categories using LLM.
    classification, nlp, categorization

    Use cases:
    - Sentiment analysis
    - Topic classification
    - Intent detection
    - Content categorization

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| system_prompt | `any` | The system prompt for the classifier | `
You are a precise classifier.

Goal
- Select exactly one category from the list provided by the user.

Output format (MANDATORY)
- Return ONLY a single JSON object with this exact schema and nothing else:
  {"category": "<one-of-the-allowed-categories>"}
- No prose, no Markdown, no code fences, no explanations, no extra keys.

Selection criteria
- Choose the single best category that captures the main intent of the text.
- If multiple categories seem plausible, pick the most probable one; do not return multiple.
- If none fit perfectly, choose the closest allowed category. If the list includes "Other" or "Unknown", prefer it when appropriate.
- Be robust to casing, punctuation, emojis, and minor typos. Handle negation correctly (e.g., "not spam" ≠ spam).
- Never invent categories that are not in the provided list.

Behavior
- Be deterministic for the same input.
- Do not ask clarifying questions; make the best choice with what's given.
` |
| model | `any` | Model to use for classification | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| text | `any` | Text to classify | `` |
| image | `any` | Optional image to classify in context | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| audio | `any` | Optional audio to classify in context | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| categories | `any` | List of possible categories. If empty, LLM will determine categories. | `[]` |
| context_window | `any` |  | `4096` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.

