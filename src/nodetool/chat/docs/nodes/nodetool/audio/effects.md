# nodetool.nodes.nodetool.audio.effects

## Bitcrush

Applies a bitcrushing effect to an audio file, reducing bit depth and/or sample rate.

Use cases:
- Create lo-fi or retro-style audio effects
- Simulate vintage digital audio equipment
- Add digital distortion and artifacts to sounds

**Fields:**
audio: AudioRef
bit_depth: int
sample_rate_reduction: int

## Compress

Applies dynamic range compression to an audio file.

Use cases:
- Even out volume levels in a recording
- Increase perceived loudness of audio
- Control peaks in audio signals

**Fields:**
audio: AudioRef
threshold: float
ratio: float
attack: float
release: float

## Delay

Applies a delay effect to an audio file.

Use cases:
- Create echo effects
- Add spaciousness to sounds
- Produce rhythmic patterns

**Fields:**
audio: AudioRef
delay_seconds: float
feedback: float
mix: float

## Distortion

Applies a distortion effect to an audio file.

Use cases:
- Add grit and character to instruments
- Create aggressive sound effects
- Simulate overdriven amplifiers

**Fields:**
audio: AudioRef
drive_db: float

## Gain

Applies a gain (volume adjustment) to an audio file.

Use cases:
- Increase or decrease overall volume of audio
- Balance levels between different audio tracks
- Prepare audio for further processing

**Fields:**
audio: AudioRef
gain_db: float

## HighPassFilter

Applies a high-pass filter to attenuate frequencies below a cutoff point.

Use cases:
- Remove low-frequency rumble or noise
- Clean up the low end of a mix
- Create filter sweep effects

**Fields:**
audio: AudioRef
cutoff_frequency_hz: float

## HighShelfFilter

Applies a high shelf filter to boost or cut high frequencies.

Use cases:
- Enhance or reduce treble frequencies
- Add brightness or air to audio
- Tame harsh high frequencies

**Fields:**
audio: AudioRef
cutoff_frequency_hz: float
gain_db: float

## Limiter

Applies a limiter effect to an audio file.

Use cases:
- Prevent audio clipping
- Increase perceived loudness without distortion
- Control dynamic range of audio

**Fields:**
audio: AudioRef
threshold_db: float
release_ms: float

## LowPassFilter

Applies a low-pass filter to attenuate frequencies above a cutoff point.

Use cases:
- Reduce high-frequency harshness
- Simulate muffled or distant sounds
- Create dub-style effects

**Fields:**
audio: AudioRef
cutoff_frequency_hz: float

## LowShelfFilter

Applies a low shelf filter to boost or cut low frequencies.

Use cases:
- Enhance or reduce bass frequencies
- Shape the low-end response of audio
- Compensate for speaker or room deficiencies

**Fields:**
audio: AudioRef
cutoff_frequency_hz: float
gain_db: float

## NoiseGate

Applies a noise gate effect to an audio file.

Use cases:
- Reduce background noise in recordings
- Clean up audio tracks with unwanted low-level sounds
- Create rhythmic effects by gating sustained sounds

**Fields:**
audio: AudioRef
threshold_db: float
attack_ms: float
release_ms: float

## PeakFilter

Applies a peak filter to boost or cut a specific frequency range.

Use cases:
- Isolate specific frequency ranges
- Create telephone or radio voice effects
- Focus on particular instrument ranges in a mix

**Fields:**
audio: AudioRef
cutoff_frequency_hz: float
q_factor: float

## Phaser

Applies a phaser effect to an audio file.

Use cases:
- Create sweeping, swooshing sounds
- Add movement to static sounds
- Produce psychedelic or space-like effects

**Fields:**
audio: AudioRef
rate_hz: float
depth: float
centre_frequency_hz: float
feedback: float
mix: float

## PitchShift

Shifts the pitch of an audio file without changing its duration.

Use cases:
- Transpose audio to a different key
- Create harmonies or vocal effects
- Adjust instrument tuning

**Fields:**
audio: AudioRef
semitones: float

## Reverb

Applies a reverb effect to an audio file.

Use cases:
- Add spatial depth to dry recordings
- Simulate different room acoustics
- Create atmospheric sound effects

**Fields:**
audio: AudioRef
room_scale: float
damping: float
wet_level: float
dry_level: float

## TimeStretch

Changes the speed of an audio file without altering its pitch.

Use cases:
- Adjust audio duration to fit video length
- Create slow-motion or fast-motion audio effects
- Synchronize audio tracks of different lengths

**Fields:**
audio: AudioRef
rate: float

