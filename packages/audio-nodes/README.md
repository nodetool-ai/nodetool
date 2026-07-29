# @nodetool-ai/audio-nodes

Audio I/O, DSP, and effects nodes for [NodeTool](https://nodetool.ai).

A pack of audio-processing nodes for NodeTool workflows: load and save audio,
edit and mix clips, run DSP effects, synthesize sound with a modular-synth graph,
and stream audio in real time. Also includes text-to-speech and text-to-music
generation.

## Install

```bash
npm install @nodetool-ai/audio-nodes
```

## Nodes

### I/O

Load and save audio, inspect format details.

- `nodetool.audio.LoadAudioFile`, `nodetool.audio.LoadAudioFolder`, `nodetool.audio.LoadAudioAssets`
- `nodetool.audio.SaveAudio`, `nodetool.audio.SaveAudioFile`
- `nodetool.audio.GetAudioInfo`

### Editing and mixing

Cut, join, and combine clips.

- `nodetool.audio.Trim`, `nodetool.audio.SliceAudio`, `nodetool.audio.Concat`, `nodetool.audio.ConcatList`
- `nodetool.audio.Repeat`, `nodetool.audio.Reverse`, `nodetool.audio.CreateSilence`, `nodetool.audio.RemoveSilence`
- `nodetool.audio.OverlayAudio`, `nodetool.audio.AudioMixer`
- `nodetool.audio.MonoToStereo`, `nodetool.audio.StereoToMono`, `nodetool.audio.ChunkToAudio`

### DSP and effects

- `nodetool.audio.Normalize`, `nodetool.audio.FadeIn`, `nodetool.audio.FadeOut`

### Generation

- `nodetool.audio.TextToSpeech` — synthesize speech from text.
- `nodetool.audio.TextToMusic` — generate music from a prompt.

### Realtime streaming

Chunk-based streaming filters and gain for live audio.

- `nodetool.audio.realtime.AudioToChunks`, `nodetool.audio.realtime.ChunksToAudio`, `nodetool.audio.realtime.AudioOutput`
- `nodetool.audio.realtime.StreamingGain`, `nodetool.audio.realtime.StreamingLowPass`, `nodetool.audio.realtime.StreamingHighPass`

### Modular synthesis

A patchable, Eurorack-style synth built from control-voltage nodes.

- `nodetool.audio.synth.Oscillator`, `nodetool.audio.synth.LFO`, `nodetool.audio.synth.ADSR`
- `nodetool.audio.synth.VCA`, `nodetool.audio.synth.VCF`, `nodetool.audio.synth.Mixer`
- `nodetool.audio.synth.Gate`, `nodetool.audio.synth.SampleHold`, `nodetool.audio.synth.Attenuverter`

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
