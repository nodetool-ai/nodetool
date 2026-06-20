---
layout: page
title: "MiniMax Music Generation"
node_type: "minimax.MusicGeneration"
namespace: "minimax"
---

**Type:** `minimax.MusicGeneration`

**Namespace:** `minimax`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | Describe the style, mood, genre, and instrumentation of the music. | `An upbeat pop song with bright synths and a cat...` |
| lyrics | `str` |  | `[Verse] Walking down the city street [Chorus] T...` |
| model | `enum` | The MiniMax music model to use. | `music-2.6` |
| format | `enum` | Output audio format. | `mp3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [minimax](./) namespace.
