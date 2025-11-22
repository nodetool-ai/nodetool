---
layout: page
title: "Kokoro TTS"
node_type: "mlx.text_to_speech.KokoroTTS"
namespace: "mlx.text_to_speech"
---

**Type:** `mlx.text_to_speech.KokoroTTS`

**Namespace:** `mlx.text_to_speech`

## Description

MLX Kokoro text-to-speech.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` | Text content to synthesize into speech. | `Hello from MLX TTS.` |
| speed | `float` | Speech speed multiplier for Kokoro (0.5–2.0). | `1.0` |
| model | `Enum['prince-canuma/Kokoro-82M', 'mlx-community/Kokoro-82M-bf16', 'mlx-community/Kokoro-82M-4bit', 'mlx-community/Kokoro-82M-6bit', 'mlx-community/Kokoro-82M-8bit']` | Kokoro model variant to load. | `prince-canuma/Kokoro-82M` |
| voice | `Enum['af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa', 'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis', 'ef_dora', 'em_alex', 'em_santa', 'ff_siwis', 'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi', 'if_sara', 'im_nicola', 'jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro', 'jm_kumo', 'pf_dora', 'pm_alex', 'pm_santa', 'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi']` | Voice preset supported by Kokoro (e.g. af_heart, am_adam, bf_emma). | `af_heart` |
| language | `Enum['a', 'b', 'e', 'f', 'h', 'i', 'p', 'j', 'z', 'k', 'r', 't', 'v', 'a', 'g', 'p', 'r', 'u']` | Language code | `a` |
| temperature | `float` | Sampling temperature passed to the Kokoro generator. | `0.7` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |
| chunk | `chunk` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.text_to_speech](../) namespace.

