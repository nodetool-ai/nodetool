---
layout: page
title: "Script To Subtitles"
node_type: "nodetool.script.ScriptToSubtitles"
namespace: "nodetool.script"
---

**Type:** `nodetool.script.ScriptToSubtitles`

**Namespace:** `nodetool.script`

## Description

Export a voiced script as SRT or WebVTT subtitles, straight from each current take's word timings — one cue per line (or per word), laid out end to end with the authored pauses. Voice the script first; unvoiced lines are skipped.
    script, subtitles, srt, vtt, captions, export

    Use cases:
    - Produce a subtitle sidecar for a voiced narration
    - Generate word-timed captions from take timings
    - Feed subtitles into a burn-in or upload step

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| script | `script` | The voiced script to export subtitles from. | - |
| format | `enum` | Subtitle format: SubRip (.srt) or WebVTT (.vtt). | `srt` |
| granularity | `enum` | One cue per line (whole line text) or per word (using take word timings). | `line` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| subtitles | `str` |  |
| cue_count | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.script](./) namespace.
