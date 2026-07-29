---
layout: page
title: "Say Text"
node_type: "lib.apple.SayText"
namespace: "lib.apple"
---

**Type:** `lib.apple.SayText`

**Namespace:** `lib.apple`

## Description

Speak text aloud using macOS text-to-speech via AppleScript's `say` command.
    speech, tts, voice, macos

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | Text to speak | `` |
| voice | `str` | Voice name (e.g. 'Alex', 'Samantha'). Empty = system default. | `` |
| rate | `int` | Speaking rate (words per minute) | `175` |
| wait | `bool` | Wait for speech to finish before returning | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Related Nodes

Browse other nodes in the [lib.apple](./) namespace.
