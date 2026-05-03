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
|----------|------|-------------|---------|
| system_prompt | `str` | The system prompt for the classifier | ` You are a precise classifier.  Goal - Select e...` |
| model | `language_model` | Model to use for classification | `{"type":"language_model","provider":"empty","id...` |
| text | `str` | Text to classify | `` |
| image | `image` | Optional image to classify in context | `{"type":"image","uri":"","asset_id":null,"data"...` |
| audio | `audio` | Optional audio to classify in context | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| categories | `list[str]` | List of possible categories. If empty, LLM will determine categories. | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
