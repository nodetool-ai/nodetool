---
layout: page
title: "Voice Script"
node_type: "nodetool.script.VoiceScript"
namespace: "nodetool.script"
---

**Type:** `nodetool.script.VoiceScript`

**Namespace:** `nodetool.script`

## Description

Synthesize speech for every draft or stale line of a script, using each line's cast voice, and save the takes back onto the script. Lines already up to date, or with no text or no voice, are skipped.
    script, voiceover, tts, narration, batch

    Use cases:
    - Voice an LLM-written script in one step
    - Re-voice lines whose text or voice changed
    - Produce narration assets for timeline assembly

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| script | `script` | The script whose lines to voice. | - |
| speed | `float` | Speech speed multiplier passed to the TTS provider. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `script` |  |
| voiced_count | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.script](./) namespace.
