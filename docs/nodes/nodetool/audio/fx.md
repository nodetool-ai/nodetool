# nodetool.nodes.nodetool.audio.fx

## CompressAudio

Applies dynamic range compression to an audio file.

Use cases:
- Even out volume levels in a recording
- Increase perceived loudness of audio
- Control peaks in audio signals

**Tags:** audio, effect, dynamics

- **audio**: The audio file to process. (AudioRef)
- **threshold**: Threshold in dB above which compression is applied. (float)
- **ratio**: Compression ratio. Higher values result in more compression. (float)
- **attack**: Attack time in milliseconds. (float)
- **release**: Release time in milliseconds. (float)

## ReverbAudio

Applies a reverb effect to an audio file.

Use cases:
- Add spatial depth to dry recordings
- Simulate different room acoustics
- Create atmospheric sound effects

**Tags:** audio, effect, reverb

- **audio**: The audio file to process. (AudioRef)
- **room_scale**: Size of the simulated room. Higher values create larger spaces. (float)
- **damping**: Amount of high frequency absorption. Higher values create a duller sound. (float)
- **wet_level**: Level of the reverb effect in the output. (float)
- **dry_level**: Level of the original signal in the output. (float)

## TimeStretchAudio

Changes the speed of an audio file without altering its pitch.

Use cases:
- Adjust audio duration to fit video length
- Create slow-motion or fast-motion audio effects
- Synchronize audio tracks of different lengths

**Tags:** audio, transform, time

- **audio**: The audio file to process. (AudioRef)
- **rate**: Time stretch factor. Values > 1 speed up, < 1 slow down. (float)

