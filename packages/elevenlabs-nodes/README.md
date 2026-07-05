# @nodetool-ai/elevenlabs-nodes

ElevenLabs AI nodes for [NodeTool](https://nodetool.ai).

Run the [ElevenLabs](https://elevenlabs.io) API inside NodeTool workflows: text-to-speech and voice generation, speech-to-text transcription, and realtime streaming TTS and STT over WebSocket.

## Install

```bash
npm install @nodetool-ai/elevenlabs-nodes
```

## Nodes

| Node | Type | Description |
| --- | --- | --- |
| Text to Speech | `elevenlabs.TextToSpeech` | Synthesize speech with a chosen voice, model, stability, similarity, and style. |
| Speech to Text | `elevenlabs.SpeechToText` | Transcribe audio with timestamps, diarization, and audio-event tagging. |
| Realtime Text to Speech | `elevenlabs.RealtimeTextToSpeech` | Stream synthesized speech over WebSocket. |
| Realtime Speech to Text | `elevenlabs.RealtimeSpeechToText` | Stream transcription from audio chunks over WebSocket. |
| Standard Voice | `elevenlabs.StandardVoice` | Pick an ElevenLabs system voice and output its voice ID. |

## Configuration

Set `ELEVENLABS_API_KEY` in NodeTool's secret store (Settings → API Keys) or as an environment variable.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
