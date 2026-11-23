---
layout: page
title: "Audio To Audio"
node_type: "nodetool.audio.AudioToAudio"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.AudioToAudio`

**Namespace:** `nodetool.audio`

## Description

Rewrite an existing recording with an audio-to-audio model: change the voice, isolate or denoise it, separate a stem, raise its sample rate.
    audio, audio-to-audio, voice-changer, isolation, denoise, stem-separation, AI

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `audio_to_audio_model` | The audio-to-audio model to use | `{"type":"audio_to_audio_model","provider":"fal_...` |
| audio | `audio` | The recording to transform | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| prompt | `str` | Optional direction for models that take one. Separators and denoisers ignore it. | `` |
| voice | `str` | Target voice, for voice-conversion models that name one. Leave empty otherwise. | `` |
| strength | `float` | How far from the source to move, where the model takes it. | `0.6` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](./) namespace.
