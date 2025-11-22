---
layout: page
title: "Kokoro TTS"
node_type: "huggingface.text_to_speech.KokoroTTS"
namespace: "huggingface.text_to_speech"
---

**Type:** `huggingface.text_to_speech.KokoroTTS`

**Namespace:** `huggingface.text_to_speech`

## Description

Kokoro is an open-weight, fast, and lightweight TTS model (~82M params) with Apache-2.0 weights.
    It supports multiple languages via `misaki` and provides high-quality speech with selectable voices.
    tts, audio, speech, huggingface, kokoro

    Reference: https://huggingface.co/hexgrad/Kokoro-82M

    Use cases:
    - Natural-sounding speech synthesis for apps, assistants, and narration
    - Low-latency TTS in production or local projects
    - Multi-language TTS with configurable voices and speed

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.text_to_speech` | The Kokoro repo to use (e.g., hexgrad/Kokoro-82M) | `{'type': 'hf.text_to_speech', 'repo_id': 'hexgrad/Kokoro-82M', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| text | `str` | Input text to synthesize | `Hello from Kokoro.` |
| lang_code | `Enum['a', 'b', 'e', 'f', 'h', 'i', 'p', 'j', 'z', 'k', 'r', 't', 'v', 'a', 'g', 'p', 'r', 'u']` | Language code for G2P. Examples: 'a' (American English), 'b' (British English), 'e' (es), 'f' (fr-fr), 'h' (hi), 'i' (it), 'p' (pt-br), 'j' (ja), 'z' (zh). | `a` |
| voice | `Enum['af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa', 'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis', 'ef_dora', 'em_alex', 'em_santa', 'ff_siwis', 'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi', 'if_sara', 'im_nicola', 'jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro', 'jm_kumo', 'pf_dora', 'pm_alex', 'pm_santa', 'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi']` | Voice name (see VOICES.md on the model page). Examples: af_heart, af_bella, af_jessica. | `af_heart` |
| speed | `float` | Speech speed multiplier (0.5–2.0) | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |
| chunk | `chunk` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_speech](../) namespace.

