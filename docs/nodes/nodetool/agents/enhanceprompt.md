---
layout: page
title: "Enhance Prompt"
node_type: "nodetool.agents.EnhancePrompt"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.EnhancePrompt`

**Namespace:** `nodetool.agents`

## Description

Rewrite a rough draft into a clearer, more detailed prompt using an LLM, with streaming output.
    text, prompt, prompt-engineering, llm, rewrite, streaming

    Turn a short or vague idea into an effective prompt:
    - Add specificity, structure, and missing detail
    - Tune the result for the target model (text, image, video, audio, code)
    - Preserve the original intent while removing ambiguity
    - Stream the improved prompt as it is written

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| system_prompt | `str` | The system prompt that guides how prompts are enhanced | - |
| model | `language_model` | Model to use for enhancing the prompt | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | The draft prompt to enhance | `` |
| target | `enum` | What the enhanced prompt is for. Tailors the rewrite to the target model: general purpose, a text/LLM model, or an image, video, audio, or code generation model. | `general` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](./) namespace.
