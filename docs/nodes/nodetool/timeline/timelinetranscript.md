---
layout: page
title: "Timeline Transcript"
node_type: "nodetool.timeline.Transcript"
namespace: "nodetool.timeline"
---

**Type:** `nodetool.timeline.Transcript`

**Namespace:** `nodetool.timeline`

## Description

Extract the transcript of a timeline sequence as text.
    timeline, transcript, text, script, voiceover

    Use cases:
    - Summarize or rewrite an edit's narration with an LLM
    - Generate titles, descriptions, or chapters from the spoken script
    - Translate a voiceover script before re-recording with TTS

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| timeline | `timeline` | The timeline sequence to read the transcript from. | `{"type":"timeline","id":null,"data":null}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| lines | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.timeline](./) namespace.
