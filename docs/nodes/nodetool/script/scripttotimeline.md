---
layout: page
title: "Script To Timeline"
node_type: "nodetool.script.ScriptToTimeline"
namespace: "nodetool.script"
---

**Type:** `nodetool.script.ScriptToTimeline`

**Namespace:** `nodetool.script`

## Description

Assemble a script's current takes into a voiceover timeline — one audio clip per voiced line, laid end to end with the authored pauses, each linked back to its script line. Updates the linked timeline in place when the script already has one. Voice the script first.
    script, timeline, voiceover, assemble, sequence

    Use cases:
    - Turn a voiced script into an editable sequence
    - Build a narration track for a video edit
    - Round-trip re-voiced lines into an existing timeline

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| script | `script` | The voiced script to assemble. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `timeline` |  |

## Related Nodes

Browse other nodes in the [nodetool.script](./) namespace.
