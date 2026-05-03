---
layout: page
title: "Moderation"
node_type: "openai.text.Moderation"
namespace: "openai.text"
---

**Type:** `openai.text.Moderation`

**Namespace:** `openai.text`

## Description

Check text content for potential policy violations using OpenAI's moderation API.
    moderation, safety, content, filter, policy, harmful, toxic

    Uses OpenAI's moderation models to detect potentially harmful content including:
    - Hate speech
    - Harassment
    - Self-harm content
    - Sexual content
    - Violence
    - Graphic violence

    Returns flagged status and category scores for comprehensive content analysis.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input | `str` | The text content to check for policy violations. | `` |
| model | `enum` | The moderation model to use. | `omni-moderation-latest` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| flagged | `bool` |  |
| categories | `dict[str, bool]` |  |
| category_scores | `dict[str, float]` |  |

## Related Nodes

Browse other nodes in the [openai.text](../) namespace.
