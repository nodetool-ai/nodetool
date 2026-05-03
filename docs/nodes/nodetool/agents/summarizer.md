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
|----------|------|-------------|---------|
| system_prompt | `str` | The system prompt for the summarizer | `         You are an expert summarizer. Your tas...` |
| model | `language_model` | Model to use for summarization | `{"type":"language_model","provider":"empty","id...` |
| text | `str` | The text to summarize | `` |
| image | `image` | Optional image to condition the summary | `{"type":"image","uri":"","asset_id":null,"data"...` |
| audio | `audio` | Optional audio to condition the summary | `{"type":"audio","uri":"","asset_id":null,"data"...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
