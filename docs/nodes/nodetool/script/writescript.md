---
layout: page
title: "Write Script"
node_type: "nodetool.script.WriteScript"
namespace: "nodetool.script"
---

**Type:** `nodetool.script.WriteScript`

**Namespace:** `nodetool.script`

## Description

Write a new script from a brief, using the same writer rules the script editor and the agent use, and save it as a new script. Cast entities become speakers, each carrying its entity link and its voice.
    script, write, brief, narration, cast

    Use cases:
    - Turn a per-row brief into a script inside a batch
    - Write one script per language from the same brief
    - Author narration for a board without opening the editor

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model that writes the script. | - |
| brief | `str` | What the script is about. | `` |
| format | `enum` | Which format's cast and sections the writer works to. | `voiceover` |
| cast | `list[entity]` | Entities that speak. Each becomes a speaker linked to the entity, voiced with its voice id. | `[]` |
| language | `str` | Language to write in. Empty writes in the brief's language. | `` |
| pace | `enum` | Reading pace the length target is computed at. | `normal` |
| length_seconds | `int` | How long the finished read should take. | - |
| voice_provider | `str` | TTS provider for the cast's voices. Needed with Voice Model for a speaker's voice id to be voiceable. | `` |
| voice_model | `str` | TTS model for the cast's voices. | `` |
| name | `str` | Name for the new script. Defaults to the brief's first words. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| script | `script` |  |
| line_count | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.script](./) namespace.
