---
layout: page
title: "Summarizer"
node_type: "nodetool.agents.Summarizer"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.Summarizer`

**Namespace:** `nodetool.agents`

## Description

Generate concise summaries of text content using LLM providers with streaming output.
    text, summarization, nlp, content, streaming

    Specialized for creating high-quality summaries with real-time streaming:
    - Condensing long documents into key points
    - Creating executive summaries with live output
    - Extracting main ideas from text as they're generated
    - Maintaining factual accuracy while reducing length

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| system_prompt | `any` | The system prompt for the summarizer | `
        You are an expert summarizer. Your task is to create clear, accurate, and concise summaries using Markdown for structuring. 
        Follow these guidelines:
        1. Identify and include only the most important information.
        2. Maintain factual accuracy - do not add or modify information.
        3. Use clear, direct language.
        4. Aim for approximately {self.max_tokens} tokens.
        ` |
| model | `any` | Model to use for summarization | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| text | `any` | The text to summarize | `` |
| image | `any` | Optional image to condition the summary | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| audio | `any` | Optional audio to condition the summary | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| context_window | `any` |  | `4096` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `any` |  |
| chunk | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.

