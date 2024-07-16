# nodetool.nodes.nodetool.audio.effects

## Bitcrush

Applies a bitcrushing effect to an audio file, reducing bit depth and/or sample rate.

Use cases:
- Create lo-fi or retro-style audio effects
- Simulate vintage digital audio equipment
- Add digital distortion and artifacts to sounds

**Tags:** audio, effect, distortion

- **audio**: The audio file to process. (AudioRef)
- **bit_depth**: The bit depth to reduce the audio to. Lower values create more distortion. (int)
- **sample_rate_reduction**: Factor by which to reduce the sample rate. Higher values create more aliasing. (int)

## Compress

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

## Delay

Applies a delay effect to an audio file.

Use cases:
- Create echo effects
- Add spaciousness to sounds
- Produce rhythmic patterns

**Tags:** audio, effect, time-based

- **audio**: The audio file to process. (AudioRef)
- **delay_seconds**: Delay time in seconds. (float)
- **feedback**: Amount of delayed signal fed back into the effect. (float)
- **mix**: Mix between the dry (original) and wet (delayed) signals. (float)

## Distortion

Applies a distortion effect to an audio file.

Use cases:
- Add grit and character to instruments
- Create aggressive sound effects
- Simulate overdriven amplifiers

**Tags:** audio, effect, distortion

- **audio**: The audio file to process. (AudioRef)
- **drive_db**: Amount of distortion to apply in decibels. (float)

## Gain

Applies a gain (volume adjustment) to an audio file.

Use cases:
- Increase or decrease overall volume of audio
- Balance levels between different audio tracks
- Prepare audio for further processing

**Tags:** audio, effect, volume

- **audio**: The audio file to process. (AudioRef)
- **gain_db**: Gain to apply in decibels. Positive values increase volume, negative values decrease it. (float)

## HighPassFilter

Applies a high-pass filter to attenuate frequencies below a cutoff point.

Use cases:
- Remove low-frequency rumble or noise
- Clean up the low end of a mix
- Create filter sweep effects

**Tags:** audio, effect, equalizer

- **audio**: The audio file to process. (AudioRef)
- **cutoff_frequency_hz**: The cutoff frequency of the high-pass filter in Hz. (float)

## HighShelfFilter

Applies a high shelf filter to boost or cut high frequencies.

Use cases:
- Enhance or reduce treble frequencies
- Add brightness or air to audio
- Tame harsh high frequencies

**Tags:** audio, effect, equalizer

- **audio**: The audio file to process. (AudioRef)
- **cutoff_frequency_hz**: The cutoff frequency of the shelf filter in Hz. (float)
- **gain_db**: The gain to apply to the frequencies above the cutoff, in dB. (float)

## Limiter

Applies a limiter effect to an audio file.

Use cases:
- Prevent audio clipping
- Increase perceived loudness without distortion
- Control dynamic range of audio

**Tags:** audio, effect, dynamics

- **audio**: The audio file to process. (AudioRef)
- **threshold_db**: Threshold in dB above which the limiter is applied. (float)
- **release_ms**: Release time in milliseconds. (float)

## LowPassFilter

Applies a low-pass filter to attenuate frequencies above a cutoff point.

Use cases:
- Reduce high-frequency harshness
- Simulate muffled or distant sounds
- Create dub-style effects

**Tags:** audio, effect, equalizer

- **audio**: The audio file to process. (AudioRef)
- **cutoff_frequency_hz**: The cutoff frequency of the low-pass filter in Hz. (float)

## LowShelfFilter

Applies a low shelf filter to boost or cut low frequencies.

Use cases:
- Enhance or reduce bass frequencies
- Shape the low-end response of audio
- Compensate for speaker or room deficiencies

**Tags:** audio, effect, equalizer

- **audio**: The audio file to process. (AudioRef)
- **cutoff_frequency_hz**: The cutoff frequency of the shelf filter in Hz. (float)
- **gain_db**: The gain to apply to the frequencies below the cutoff, in dB. (float)

## NoiseGate

Applies a noise gate effect to an audio file.

Use cases:
- Reduce background noise in recordings
- Clean up audio tracks with unwanted low-level sounds
- Create rhythmic effects by gating sustained sounds

**Tags:** audio, effect, dynamics

- **audio**: The audio file to process. (AudioRef)
- **threshold_db**: Threshold in dB below which the gate is active. (float)
- **attack_ms**: Attack time in milliseconds. (float)
- **release_ms**: Release time in milliseconds. (float)

## PeakFilter

Applies a peak filter to boost or cut a specific frequency range.

Use cases:
- Isolate specific frequency ranges
- Create telephone or radio voice effects
- Focus on particular instrument ranges in a mix

**Tags:** audio, effect, equalizer

- **audio**: The audio file to process. (AudioRef)
- **cutoff_frequency_hz**: The cutoff frequency of the band-pass filter in Hz. (float)
- **q_factor**: The Q factor, determining the width of the band. Higher values create narrower bands. (float)

## Phaser

Applies a phaser effect to an audio file.

Use cases:
- Create sweeping, swooshing sounds
- Add movement to static sounds
- Produce psychedelic or space-like effects

**Tags:** audio, effect, modulation

- **audio**: The audio file to process. (AudioRef)
- **rate_hz**: Rate of the phaser effect in Hz. (float)
- **depth**: Depth of the phaser effect. (float)
- **centre_frequency_hz**: Centre frequency of the phaser in Hz. (float)
- **feedback**: Feedback of the phaser effect. Negative values invert the phase. (float)
- **mix**: Mix between the dry (original) and wet (effected) signals. (float)

## PitchShift

Shifts the pitch of an audio file without changing its duration.

Use cases:
- Transpose audio to a different key
- Create harmonies or vocal effects
- Adjust instrument tuning

**Tags:** audio, effect, pitch

- **audio**: The audio file to process. (AudioRef)
- **semitones**: Number of semitones to shift the pitch. Positive values shift up, negative values shift down. (float)

## Reverb

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

## TimeStretch

Changes the speed of an audio file without altering its pitch.

Use cases:
- Adjust audio duration to fit video length
- Create slow-motion or fast-motion audio effects
- Synchronize audio tracks of different lengths

**Tags:** audio, transform, time

- **audio**: The audio file to process. (AudioRef)
- **rate**: Time stretch factor. Values > 1 speed up, < 1 slow down. (float)

