---
layout: page
title: "Decision"
node_type: "nodetool.agents.Decision"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.Decision`

**Namespace:** `nodetool.agents`

## Description

Let an LLM make a yes/no decision about the inputs, then route the value down the matching branch.
    decision, judge, condition, branch, if, evaluate, approve, verify, gate, loop, agent

    Write the question in prompt. Wire the value to route into value, and any other context as extra inputs; images and audio are shown to the model. decision carries the answer as a bool, reason explains it, and only the taken branch (if_true or if_false) emits value.

    Use cases:
    - Judge whether a draft or generated image meets a brief
    - Drive a Loop's condition from a model's judgement
    - Route items to different branches by a natural-language rule

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model that makes the decision | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | The yes/no question to decide, e.g. "Does the draft answer every point in the brief?" | `` |
| value | `any` | The value the decision is about. Shown to the model and passed through on the taken branch. | null |
| system_prompt | `str` | Instructions for how the model decides | - |
| max_tokens | `int` | The maximum number of tokens to generate. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| decision | `bool` |  |
| reason | `str` |  |
| if_true | `any` |  |
| if_false | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](./) namespace.
