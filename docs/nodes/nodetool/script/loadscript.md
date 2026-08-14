---
layout: page
title: "Load Script"
node_type: "nodetool.script.LoadScript"
namespace: "nodetool.script"
---

**Type:** `nodetool.script.LoadScript`

**Namespace:** `nodetool.script`

## Description

Read a persisted script's text and metadata.
    script, text, voiceover, narration, load

    Use cases:
    - Feed a script's text into an LLM or text node
    - Inspect line count and cast before voicing
    - Branch a workflow on a script's contents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| script | `script` | The script to read. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| lines | `list[str]` |  |
| name | `str` |  |
| line_count | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.script](./) namespace.
